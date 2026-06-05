from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np

from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig, generate_iq


SCENARIOS = ("nominal", "degraded_comms", "bad_clock", "confidence_drift")


@dataclass(frozen=True)
class ScenarioProfile:
    name: str
    snr_db_min: float
    snr_db_max: float
    carrier_offset_hz_max: float
    dropout_probability: float = 0.0
    clock_ppm: float = 0.0
    drift_per_window_db: float = 0.0


def scenario_profile(name: str) -> ScenarioProfile:
    if name == "nominal":
        return ScenarioProfile(name, snr_db_min=10.0, snr_db_max=24.0, carrier_offset_hz_max=80_000.0)
    if name == "degraded_comms":
        return ScenarioProfile(
            name,
            snr_db_min=0.0,
            snr_db_max=9.0,
            carrier_offset_hz_max=120_000.0,
            dropout_probability=0.08,
        )
    if name == "bad_clock":
        return ScenarioProfile(
            name,
            snr_db_min=8.0,
            snr_db_max=20.0,
            carrier_offset_hz_max=180_000.0,
            clock_ppm=75.0,
        )
    if name == "confidence_drift":
        return ScenarioProfile(
            name,
            snr_db_min=16.0,
            snr_db_max=24.0,
            carrier_offset_hz_max=80_000.0,
            drift_per_window_db=0.2,
        )
    raise ValueError(f"unsupported scenario {name!r}; expected one of {SCENARIOS}")


def generate_scenario_iq(
    label: str,
    base_config: SignalConfig,
    profile: ScenarioProfile,
    rng: np.random.Generator,
    window_index: int = 0,
) -> np.ndarray:
    snr_shift = profile.drift_per_window_db * window_index
    config = SignalConfig(
        sample_rate_hz=base_config.sample_rate_hz,
        window_size=base_config.window_size,
        samples_per_symbol=base_config.samples_per_symbol,
        snr_db_min=max(-4.0, profile.snr_db_min - snr_shift),
        snr_db_max=max(-2.0, profile.snr_db_max - snr_shift),
        carrier_offset_hz_max=profile.carrier_offset_hz_max,
    )
    iq = generate_iq(label, config, rng)
    if profile.clock_ppm:
        iq = apply_clock_drift(iq, profile.clock_ppm)
    if profile.dropout_probability:
        iq = apply_packet_dropouts(iq, profile.dropout_probability, rng)
    return iq.astype(np.complex64)


def iter_scenario_windows(
    scenario: str,
    labels: Iterable[str],
    config: SignalConfig,
    seed: int,
) -> Iterable[tuple[str, np.ndarray, str]]:
    rng = np.random.default_rng(seed)
    label_tuple = tuple(labels)
    if not label_tuple:
        raise ValueError("at least one label is required")
    profile = scenario_profile(scenario)
    index = 0
    while True:
        label = str(rng.choice(label_tuple))
        yield label, generate_scenario_iq(label, config, profile, rng, index), scenario
        index += 1


def apply_packet_dropouts(iq: np.ndarray, probability: float, rng: np.random.Generator) -> np.ndarray:
    if probability <= 0.0:
        return np.asarray(iq, dtype=np.complex64)
    out = np.asarray(iq, dtype=np.complex64).copy()
    packet = max(16, out.size // 64)
    for start in range(0, out.size, packet):
        if rng.random() < probability:
            out[start : start + packet] = 0.0
    return out


def apply_clock_drift(iq: np.ndarray, ppm: float) -> np.ndarray:
    x = np.asarray(iq, dtype=np.complex64)
    if ppm == 0.0:
        return x
    scale = 1.0 + ppm / 1_000_000.0
    source_positions = np.arange(x.size, dtype=np.float64) * scale
    source_positions = np.clip(source_positions, 0.0, x.size - 1.0)
    sample_index = np.arange(x.size, dtype=np.float64)
    real = np.interp(source_positions, sample_index, x.real)
    imag = np.interp(source_positions, sample_index, x.imag)
    return (real + 1j * imag).astype(np.complex64)


@dataclass
class ConfidenceDriftMonitor:
    baseline_confidence: float
    drop_threshold: float = 0.12
    min_samples: int = 8

    def evaluate(self, confidences: Iterable[float]) -> dict[str, float | bool]:
        values = np.asarray(list(confidences), dtype=np.float32)
        if values.size == 0:
            raise ValueError("at least one confidence value is required")
        rolling_mean = float(np.mean(values[-self.min_samples :]))
        drop = self.baseline_confidence - rolling_mean
        return {
            "rolling_mean": rolling_mean,
            "baseline_confidence": self.baseline_confidence,
            "confidence_drop": float(drop),
            "drift_detected": bool(values.size >= self.min_samples and drop >= self.drop_threshold),
        }

