from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np


SIGNAL_LABELS = ("bpsk", "qpsk", "fsk", "ofdm", "fm", "noise")


@dataclass(frozen=True)
class SignalConfig:
    sample_rate_hz: float = 1_000_000.0
    window_size: int = 4096
    samples_per_symbol: int = 8
    snr_db_min: float = 6.0
    snr_db_max: float = 24.0
    carrier_offset_hz_max: float = 80_000.0


def generate_iq(label: str, config: SignalConfig, rng: np.random.Generator) -> np.ndarray:
    """Generate one synthetic complex-baseband I/Q window."""
    label = label.lower()
    if label not in SIGNAL_LABELS:
        raise ValueError(f"unsupported label {label!r}; expected one of {SIGNAL_LABELS}")

    if label == "noise":
        return _complex_noise(config.window_size, rng).astype(np.complex64)

    if label == "bpsk":
        clean = _bpsk(config, rng)
    elif label == "qpsk":
        clean = _qpsk(config, rng)
    elif label == "fsk":
        clean = _fsk(config, rng)
    elif label == "ofdm":
        clean = _ofdm(config, rng)
    elif label == "fm":
        clean = _fm_like(config, rng)
    else:
        raise AssertionError("unreachable")

    clean = _apply_channel(clean, config, rng)
    snr_db = rng.uniform(config.snr_db_min, config.snr_db_max)
    return _add_awgn(clean, snr_db, rng).astype(np.complex64)


def iter_synthetic_windows(
    labels: Iterable[str],
    config: SignalConfig,
    seed: int,
) -> Iterable[tuple[str, np.ndarray]]:
    rng = np.random.default_rng(seed)
    label_tuple = tuple(labels)
    if not label_tuple:
        raise ValueError("at least one label is required")

    while True:
        label = str(rng.choice(label_tuple))
        yield label, generate_iq(label, config, rng)


def _bpsk(config: SignalConfig, rng: np.random.Generator) -> np.ndarray:
    symbol_count = _symbol_count(config)
    bits = rng.integers(0, 2, size=symbol_count)
    symbols = (2 * bits - 1).astype(np.float32).astype(np.complex64)
    return _repeat_symbols(symbols, config)


def _qpsk(config: SignalConfig, rng: np.random.Generator) -> np.ndarray:
    symbol_count = _symbol_count(config)
    idx = rng.integers(0, 4, size=symbol_count)
    constellation = np.array([1 + 1j, 1 - 1j, -1 + 1j, -1 - 1j], dtype=np.complex64)
    symbols = constellation[idx] / np.sqrt(2.0)
    return _repeat_symbols(symbols, config)


def _fsk(config: SignalConfig, rng: np.random.Generator) -> np.ndarray:
    symbol_count = _symbol_count(config)
    bits = rng.integers(0, 2, size=symbol_count)
    freq_shift = rng.uniform(22_000.0, 72_000.0)
    freqs = np.repeat(np.where(bits > 0, freq_shift, -freq_shift), config.samples_per_symbol)
    freqs = _fit_window(freqs.astype(np.float64), config.window_size)
    phase = 2.0 * np.pi * np.cumsum(freqs) / config.sample_rate_hz
    return np.exp(1j * phase).astype(np.complex64)


def _ofdm(config: SignalConfig, rng: np.random.Generator) -> np.ndarray:
    fft_size = 64
    used_bins = np.r_[6:26, 38:58]
    frames: list[np.ndarray] = []
    while sum(frame.size for frame in frames) < config.window_size:
        bins = np.zeros(fft_size, dtype=np.complex64)
        qpsk = rng.choice(
            np.array([1 + 1j, 1 - 1j, -1 + 1j, -1 - 1j], dtype=np.complex64),
            size=used_bins.size,
        )
        bins[used_bins] = qpsk / np.sqrt(2.0)
        time_symbol = np.fft.ifft(np.fft.ifftshift(bins))
        cyclic_prefix = time_symbol[-16:]
        frames.append(np.concatenate([cyclic_prefix, time_symbol]))
    return _fit_window(np.concatenate(frames), config.window_size).astype(np.complex64)


def _fm_like(config: SignalConfig, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(config.window_size, dtype=np.float64) / config.sample_rate_hz
    tone_hz = rng.uniform(800.0, 6_000.0)
    deviation_hz = rng.uniform(12_000.0, 55_000.0)
    modulator = np.sin(2.0 * np.pi * tone_hz * t + rng.uniform(0.0, 2.0 * np.pi))
    inst_freq = deviation_hz * modulator
    phase = 2.0 * np.pi * np.cumsum(inst_freq) / config.sample_rate_hz
    return np.exp(1j * phase).astype(np.complex64)


def _apply_channel(iq: np.ndarray, config: SignalConfig, rng: np.random.Generator) -> np.ndarray:
    n = iq.size
    t = np.arange(n, dtype=np.float64) / config.sample_rate_hz
    carrier_offset = rng.uniform(-config.carrier_offset_hz_max, config.carrier_offset_hz_max)
    phase = rng.uniform(0.0, 2.0 * np.pi)
    rotated = iq * np.exp(1j * (2.0 * np.pi * carrier_offset * t + phase))

    gain = rng.uniform(0.5, 1.5)
    if rng.random() < 0.3:
        fade = 0.85 + 0.15 * np.sin(2.0 * np.pi * rng.uniform(20.0, 200.0) * t)
        rotated = rotated * fade
    return (gain * rotated).astype(np.complex64)


def _add_awgn(iq: np.ndarray, snr_db: float, rng: np.random.Generator) -> np.ndarray:
    signal_power = float(np.mean(np.abs(iq) ** 2))
    noise_power = signal_power / (10.0 ** (snr_db / 10.0))
    return iq + np.sqrt(noise_power) * _complex_noise(iq.size, rng)


def _complex_noise(size: int, rng: np.random.Generator) -> np.ndarray:
    scale = 1.0 / np.sqrt(2.0)
    return scale * (rng.standard_normal(size) + 1j * rng.standard_normal(size))


def _symbol_count(config: SignalConfig) -> int:
    return int(np.ceil(config.window_size / config.samples_per_symbol))


def _repeat_symbols(symbols: np.ndarray, config: SignalConfig) -> np.ndarray:
    repeated = np.repeat(symbols, config.samples_per_symbol)
    return _fit_window(repeated, config.window_size).astype(np.complex64)


def _fit_window(values: np.ndarray, size: int) -> np.ndarray:
    if values.size >= size:
        return values[:size]
    return np.pad(values, (0, size - values.size), mode="wrap")

