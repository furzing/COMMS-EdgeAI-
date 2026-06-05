from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

from rf_edge_sentinel.runtime import runtime_comparison
from rf_edge_sentinel.scenarios import SCENARIOS, iter_scenario_windows
from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig


@dataclass(frozen=True)
class ScenarioMetric:
    scenario: str
    windows: int
    accuracy: float
    mean_confidence: float
    anomaly_rate: float
    confusion: dict[str, dict[str, int]]


def evaluate_model(
    model: Any,
    config: SignalConfig,
    windows_per_scenario: int,
    seed: int,
) -> list[ScenarioMetric]:
    metrics: list[ScenarioMetric] = []
    for scenario_index, scenario in enumerate(SCENARIOS):
        source = iter_scenario_windows(scenario, SIGNAL_LABELS, config, seed + scenario_index * 10_000)
        correct = 0
        confidences: list[float] = []
        anomalies = 0
        confusion = {label: {predicted: 0 for predicted in SIGNAL_LABELS} for label in SIGNAL_LABELS}
        for _ in range(windows_per_scenario):
            label, iq, _ = next(source)
            if hasattr(model, "predict_iq"):
                prediction = model.predict_iq(iq, config)
            else:
                from rf_edge_sentinel.features import extract_features

                prediction = model.predict(extract_features(iq, config.sample_rate_hz))
            correct += int(prediction.label == label)
            confidences.append(prediction.confidence)
            anomalies += int(prediction.anomaly_score > 1.0)
            confusion[label][prediction.label] += 1
        metrics.append(
            ScenarioMetric(
                scenario=scenario,
                windows=windows_per_scenario,
                accuracy=round(correct / windows_per_scenario, 4),
                mean_confidence=round(float(np.mean(confidences)), 4),
                anomaly_rate=round(anomalies / windows_per_scenario, 4),
                confusion=confusion,
            )
        )
    return metrics


def write_evaluation_report(
    model: Any,
    config: SignalConfig,
    out_path: str | Path,
    windows_per_scenario: int,
    seed: int,
    onnx_path: str | Path | None = None,
    quantized_onnx_path: str | Path | None = None,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "model_type": getattr(model, "model_type", "edge_knn"),
        "labels": list(getattr(model, "labels", SIGNAL_LABELS)),
        "signal_config": asdict(config),
        "windows_per_scenario": windows_per_scenario,
        "seed": seed,
        "scenario_metrics": [asdict(metric) for metric in evaluate_model(model, config, windows_per_scenario, seed)],
        "runtime_benchmarks": {},
    }
    if onnx_path:
        report["runtime_benchmarks"]["onnx"] = runtime_comparison(
            model,
            config=config,
            windows=windows_per_scenario,
            seed=seed,
            onnx_path=onnx_path,
            scenario="nominal",
        )
    if quantized_onnx_path:
        report["runtime_benchmarks"]["quantized_onnx"] = runtime_comparison(
            model,
            config=config,
            windows=windows_per_scenario,
            seed=seed,
            onnx_path=quantized_onnx_path,
            scenario="nominal",
        )

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report

