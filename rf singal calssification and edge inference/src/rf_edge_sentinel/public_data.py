from __future__ import annotations

import json
import statistics
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

from rf_edge_sentinel.runtime import load_detector_model
from rf_edge_sentinel.signals import SignalConfig
from rf_edge_sentinel.stream import detect_window


@dataclass(frozen=True)
class PublicIqRecording:
    id: str
    provider: str
    url: str
    sample_rate_hz: float
    dtype: str
    license: str
    satellite: str
    observation_id: str
    status: str
    notes: str = ""


PUBLIC_IQ_RECORDINGS = (
    PublicIqRecording(
        id="satnogs_uresat1_7883687",
        provider="CAMRAS / SatNOGS Dwingeloo Telescope",
        url="https://data.camras.nl/satnogs/iq_7883687.raw",
        sample_rate_hz=48_000.0,
        dtype="c16le",
        license="CC-BY-4.0",
        satellite="URESAT-1",
        observation_id="7883687",
        status="good",
        notes="Telemetry file is listed on the source page.",
    ),
    PublicIqRecording(
        id="satnogs_fox1e_9305704",
        provider="CAMRAS / SatNOGS Dwingeloo Telescope",
        url="https://data.camras.nl/satnogs/iq_9305704.raw",
        sample_rate_hz=48_000.0,
        dtype="c16le",
        license="CC-BY-4.0",
        satellite="FOX-1E",
        observation_id="9305704",
        status="good",
    ),
    PublicIqRecording(
        id="satnogs_rsp03_13339371",
        provider="CAMRAS / SatNOGS Dwingeloo Telescope",
        url="https://data.camras.nl/satnogs/iq_13339371.raw",
        sample_rate_hz=48_000.0,
        dtype="c16le",
        license="CC-BY-4.0",
        satellite="RSP-03",
        observation_id="13339371",
        status="good",
        notes="Smaller listed file, still large enough to evaluate in chunks.",
    ),
)


def list_public_iq_recordings() -> list[dict[str, Any]]:
    return [asdict(recording) for recording in PUBLIC_IQ_RECORDINGS]


def get_public_iq_recording(recording_id: str) -> PublicIqRecording:
    for recording in PUBLIC_IQ_RECORDINGS:
        if recording.id == recording_id:
            return recording
    ids = ", ".join(recording.id for recording in PUBLIC_IQ_RECORDINGS)
    raise ValueError(f"unknown recording {recording_id!r}; expected one of: {ids}")


def download_recording_range(
    recording: PublicIqRecording,
    output_path: str | Path,
    max_mb: float,
    offset_mb: float = 0.0,
) -> dict[str, Any]:
    if max_mb <= 0:
        raise ValueError("max_mb must be positive")
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    byte_count = int(max_mb * 1024 * 1024)
    offset = int(offset_mb * 1024 * 1024)
    end = offset + byte_count - 1
    request = urllib.request.Request(recording.url, headers={"Range": f"bytes={offset}-{end}"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(byte_count)
        headers = dict(response.headers.items())
    output_path.write_bytes(data)

    manifest = {
        "recording": asdict(recording),
        "output_path": str(output_path),
        "requested_offset_mb": offset_mb,
        "requested_max_mb": max_mb,
        "bytes_written": len(data),
        "http_headers": headers,
    }
    manifest_path = output_path.with_suffix(output_path.suffix + ".json")
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest["manifest_path"] = str(manifest_path)
    return manifest


def read_c16le_iq(
    path: str | Path,
    max_samples: int | None = None,
    offset_samples: int = 0,
) -> np.ndarray:
    path = Path(path)
    if offset_samples < 0:
        raise ValueError("offset_samples cannot be negative")
    offset_bytes = offset_samples * 4
    count = -1 if max_samples is None else max_samples * 2
    raw = np.fromfile(path, dtype="<i2", count=count, offset=offset_bytes)
    if raw.size < 2:
        return np.asarray([], dtype=np.complex64)
    if raw.size % 2:
        raw = raw[:-1]
    pairs = raw.reshape(-1, 2).astype(np.float32)
    return ((pairs[:, 0] + 1j * pairs[:, 1]) / 32768.0).astype(np.complex64)


def iter_iq_windows(iq: np.ndarray, window_size: int, stride: int) -> list[np.ndarray]:
    if window_size <= 0:
        raise ValueError("window_size must be positive")
    if stride <= 0:
        raise ValueError("stride must be positive")
    if iq.size < window_size:
        return []
    return [iq[start : start + window_size] for start in range(0, iq.size - window_size + 1, stride)]


def evaluate_real_iq_file(
    model_path: str | Path,
    input_path: str | Path,
    output_path: str | Path,
    config: SignalConfig,
    windows: int,
    stride: int | None = None,
    source_id: str = "real_iq",
) -> dict[str, Any]:
    model = load_detector_model(model_path)
    stride = stride or config.window_size
    max_samples = config.window_size + max(0, windows - 1) * stride
    iq = read_c16le_iq(input_path, max_samples=max_samples)
    iq_windows = iter_iq_windows(iq, config.window_size, stride)[:windows]
    if not iq_windows:
        raise ValueError("input file does not contain enough c16le samples for one window")

    events = [detect_window(model, window, config, source=source_id, expected_label=None) for window in iq_windows]
    labels: dict[str, int] = {}
    for event in events:
        labels[event.predicted_label] = labels.get(event.predicted_label, 0) + 1
    confidences = [event.confidence for event in events]
    anomaly_scores = [event.anomaly_score for event in events]

    report = {
        "source_id": source_id,
        "input_path": str(input_path),
        "source_manifest": _read_adjacent_manifest(input_path),
        "model_path": str(model_path),
        "sample_rate_hz": config.sample_rate_hz,
        "window_size": config.window_size,
        "stride": stride,
        "windows": len(events),
        "prediction_counts": labels,
        "mean_confidence": round(float(np.mean(confidences)), 4),
        "median_confidence": round(float(statistics.median(confidences)), 4),
        "mean_anomaly_score": round(float(np.mean(anomaly_scores)), 4),
        "anomaly_rate": round(sum(event.is_anomaly for event in events) / len(events), 4),
        "energy_db_mean": round(float(np.mean([event.energy_db for event in events])), 4),
        "events": [event.to_dict() for event in events],
    }
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def _read_adjacent_manifest(input_path: str | Path) -> dict[str, Any] | None:
    manifest_path = Path(str(input_path) + ".json")
    if not manifest_path.exists():
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if "http_headers" in manifest:
        manifest = dict(manifest)
        manifest["http_headers"] = {
            key: manifest["http_headers"][key]
            for key in ("Content-Range", "Content-Length", "Accept-Ranges")
            if key in manifest["http_headers"]
        }
    return manifest
