from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from typing import Any, Iterable

import numpy as np

from rf_edge_sentinel.features import extract_features
from rf_edge_sentinel.scenarios import iter_scenario_windows
from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig, generate_iq


@dataclass(frozen=True)
class DetectionEvent:
    timestamp_ms: int
    source: str
    predicted_label: str
    expected_label: str | None
    confidence: float
    anomaly_score: float
    is_anomaly: bool
    latency_ms: float
    energy_db: float

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def detect_window(
    model: Any,
    iq: np.ndarray,
    config: SignalConfig,
    source: str,
    expected_label: str | None = None,
) -> DetectionEvent:
    start = time.perf_counter()
    if hasattr(model, "predict_iq"):
        prediction = model.predict_iq(iq, config)
    else:
        features = extract_features(iq, config.sample_rate_hz)
        prediction = model.predict(features)
    latency_ms = (time.perf_counter() - start) * 1000.0
    return DetectionEvent(
        timestamp_ms=int(time.time() * 1000),
        source=source,
        predicted_label=prediction.label,
        expected_label=expected_label,
        confidence=prediction.confidence,
        anomaly_score=prediction.anomaly_score,
        is_anomaly=prediction.anomaly_score > 1.0,
        latency_ms=latency_ms,
        energy_db=_energy_db(iq),
    )


def run_synthetic_stream(
    model: Any,
    config: SignalConfig,
    windows: int,
    seed: int,
    labels: Iterable[str] = SIGNAL_LABELS,
    scenario: str = "nominal",
) -> list[DetectionEvent]:
    rng = np.random.default_rng(seed)
    label_list = tuple(labels)
    events: list[DetectionEvent] = []
    if scenario == "nominal":
        for _ in range(windows):
            label = str(rng.choice(label_list))
            iq = generate_iq(label, config, rng)
            events.append(detect_window(model, iq, config, source="synthetic", expected_label=label))
        return events

    source = iter_scenario_windows(scenario, label_list, config, seed)
    for _ in range(windows):
        label, iq, scenario_label = next(source)
        events.append(detect_window(model, iq, config, source=scenario_label, expected_label=label))
    return events


def _energy_db(iq: np.ndarray) -> float:
    return float(10.0 * np.log10(float(np.mean(np.abs(iq) ** 2)) + 1e-12))
