from __future__ import annotations

import importlib
import json
import statistics
import time
from pathlib import Path
from typing import Any

import numpy as np

from rf_edge_sentinel.cnn import SmallSpectrogramCnn
from rf_edge_sentinel.model import EdgeKnnModel
from rf_edge_sentinel.scenarios import iter_scenario_windows
from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig
from rf_edge_sentinel.spectrogram import iq_to_spectrogram_tensor


def load_detector_model(path: str | Path) -> Any:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("model_type") == "spectrogram_cnn":
        return SmallSpectrogramCnn.load(path)
    return EdgeKnnModel.load(path)


def runtime_comparison(
    model: Any,
    config: SignalConfig,
    windows: int,
    seed: int,
    onnx_path: str | Path | None = None,
    scenario: str = "nominal",
) -> list[dict[str, Any]]:
    results = [_benchmark_python(model, config, windows, seed, scenario)]

    if onnx_path is None:
        results.append({"runtime": "onnxruntime_cpu", "available": False, "reason": "no ONNX path provided"})
        results.append({"runtime": "tensorrt", "available": False, "reason": "no ONNX path provided"})
        return results

    onnx_path = Path(onnx_path)
    results.append(_benchmark_onnxruntime(onnx_path, model, config, windows, seed, scenario, "CPUExecutionProvider"))
    results.append(_benchmark_onnxruntime(onnx_path, model, config, windows, seed, scenario, "TensorrtExecutionProvider"))
    return results


def optional_runtime_status() -> dict[str, bool]:
    return {
        "onnx": _can_import("onnx"),
        "onnxruntime": _can_import("onnxruntime"),
        "tensorrt": _can_import("tensorrt"),
    }


def _can_import(module_name: str) -> bool:
    try:
        importlib.import_module(module_name)
    except Exception:
        return False
    return True


def _benchmark_python(
    model: Any,
    config: SignalConfig,
    windows: int,
    seed: int,
    scenario: str,
) -> dict[str, Any]:
    latencies: list[float] = []
    correct = 0
    source = iter_scenario_windows(scenario, SIGNAL_LABELS, config, seed)
    for _ in range(windows):
        label, iq, _ = next(source)
        start = time.perf_counter()
        if hasattr(model, "predict_iq"):
            prediction = model.predict_iq(iq, config)
        else:
            from rf_edge_sentinel.features import extract_features

            prediction = model.predict(extract_features(iq, config.sample_rate_hz))
        latencies.append((time.perf_counter() - start) * 1000.0)
        correct += int(prediction.label == label)
    return _latency_result("python_numpy", True, latencies, correct / windows)


def _benchmark_onnxruntime(
    onnx_path: Path,
    model: Any,
    config: SignalConfig,
    windows: int,
    seed: int,
    scenario: str,
    provider: str,
) -> dict[str, Any]:
    runtime_name = "tensorrt" if provider == "TensorrtExecutionProvider" else "onnxruntime_cpu"
    if not onnx_path.exists():
        return {"runtime": runtime_name, "available": False, "reason": f"ONNX file not found: {onnx_path}"}
    if not hasattr(model, "spectrogram_config"):
        return {"runtime": runtime_name, "available": False, "reason": "ONNX path supports the CNN model only"}
    try:
        import onnxruntime as ort
    except ImportError:
        return {"runtime": runtime_name, "available": False, "reason": "onnxruntime is not installed"}

    providers = ort.get_available_providers()
    if provider not in providers:
        return {
            "runtime": runtime_name,
            "available": False,
            "reason": f"{provider} is not available; providers={providers}",
        }

    session = ort.InferenceSession(str(onnx_path), providers=[provider])
    input_name = session.get_inputs()[0].name
    latencies: list[float] = []
    correct = 0
    source = iter_scenario_windows(scenario, SIGNAL_LABELS, config, seed)
    for _ in range(windows):
        label, iq, _ = next(source)
        tensor = iq_to_spectrogram_tensor(iq, config, model.spectrogram_config)[None, :, :, :]
        start = time.perf_counter()
        probabilities = session.run(["probabilities"], {input_name: tensor.astype(np.float32)})[0][0]
        latencies.append((time.perf_counter() - start) * 1000.0)
        correct += int(model.labels[int(np.argmax(probabilities))] == label)
    return _latency_result(runtime_name, True, latencies, correct / windows)


def _latency_result(runtime: str, available: bool, latencies: list[float], accuracy: float) -> dict[str, Any]:
    return {
        "runtime": runtime,
        "available": available,
        "windows": len(latencies),
        "accuracy": round(float(accuracy), 4),
        "latency_ms_p50": round(statistics.median(latencies), 4),
        "latency_ms_p95": round(_percentile(latencies, 95), 4),
        "latency_ms_max": round(max(latencies), 4),
    }


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise ValueError("values cannot be empty")
    idx = min(len(ordered) - 1, round((percentile / 100.0) * (len(ordered) - 1)))
    return ordered[idx]
