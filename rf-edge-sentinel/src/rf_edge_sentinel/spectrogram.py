from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from rf_edge_sentinel.signals import SignalConfig


@dataclass(frozen=True)
class SpectrogramConfig:
    channels: int = 5
    frequency_bins: int = 32
    time_bins: int = 32
    frame_size: int = 256


DEFAULT_SPECTROGRAM_CONFIG = SpectrogramConfig()


def iq_to_spectrogram_tensor(
    iq: np.ndarray,
    signal_config: SignalConfig,
    spectrogram_config: SpectrogramConfig = DEFAULT_SPECTROGRAM_CONFIG,
) -> np.ndarray:
    """Create a compact RF image tensor from one complex I/Q window.

    The tensor uses log power, normalized STFT real/imaginary parts, and two
    phase-behavior channels. Keeping phase-bearing channels is important because
    a plain magnitude spectrogram makes several PSK families hard to separate.
    """
    if spectrogram_config.channels != 5:
        raise ValueError("only 5-channel RF spectrogram tensors are supported")

    x = np.asarray(iq, dtype=np.complex64)
    if x.ndim != 1:
        raise ValueError("iq must be a 1-D complex array")

    frames = _frame_iq(x, spectrogram_config)
    window = np.hanning(frames.shape[1]).astype(np.float32)
    stft = np.fft.fftshift(np.fft.fft(frames * window, n=frames.shape[1], axis=1), axes=1)
    center = stft.shape[1] // 2
    half = spectrogram_config.frequency_bins // 2
    stft = stft[:, center - half : center + half]
    stft = stft.T

    magnitude = np.abs(stft)
    log_power = np.log1p(magnitude**2).astype(np.float32)
    log_power = _standardize(log_power)

    scale = float(np.percentile(magnitude, 95)) + 1e-6
    real = np.clip(stft.real / scale, -2.5, 2.5).astype(np.float32)
    imag = np.clip(stft.imag / scale, -2.5, 2.5).astype(np.float32)
    phase_moments = _phase_moment_plane(x, spectrogram_config)
    phase_hist = _phase_transition_plane(x, spectrogram_config)

    tensor = np.stack([log_power, real, imag, phase_moments, phase_hist], axis=0).astype(np.float32)
    if tensor.shape != (
        spectrogram_config.channels,
        spectrogram_config.frequency_bins,
        spectrogram_config.time_bins,
    ):
        raise ValueError(f"unexpected spectrogram tensor shape {tensor.shape}")
    return tensor


def spectrogram_shape(config: SpectrogramConfig = DEFAULT_SPECTROGRAM_CONFIG) -> tuple[int, int, int]:
    return (config.channels, config.frequency_bins, config.time_bins)


def _frame_iq(iq: np.ndarray, config: SpectrogramConfig) -> np.ndarray:
    frame_size = min(config.frame_size, max(64, iq.size))
    if iq.size < frame_size:
        iq = np.pad(iq, (0, frame_size - iq.size), mode="wrap")

    max_start = max(0, iq.size - frame_size)
    starts = np.linspace(0, max_start, config.time_bins, dtype=np.int64)
    return np.stack([iq[start : start + frame_size] for start in starts], axis=0)


def _standardize(values: np.ndarray) -> np.ndarray:
    mean = float(np.mean(values))
    std = float(np.std(values))
    if std < 1e-6:
        std = 1.0
    return ((values - mean) / std).astype(np.float32)


def _phase_moment_plane(iq: np.ndarray, config: SpectrogramConfig) -> np.ndarray:
    eps = 1e-6
    unit = iq / (np.abs(iq) + eps)
    phase_step = np.angle(unit[1:] * np.conj(unit[:-1]))
    values = np.asarray(
        [
            abs(np.mean(unit**2)),
            abs(np.mean(unit**4)),
            abs(np.mean(np.exp(1j * phase_step))),
            abs(np.mean(np.exp(2j * phase_step))),
        ],
        dtype=np.float32,
    )
    plane = np.zeros((config.frequency_bins, config.time_bins), dtype=np.float32)
    band = max(1, config.frequency_bins // values.size)
    for index, value in enumerate(values):
        plane[index * band : (index + 1) * band, :] = value
    return plane


def _phase_transition_plane(iq: np.ndarray, config: SpectrogramConfig) -> np.ndarray:
    eps = 1e-6
    unit = iq / (np.abs(iq) + eps)
    phase_step = np.angle(unit[1:] * np.conj(unit[:-1]))
    hist, _ = np.histogram(phase_step, bins=config.frequency_bins, range=(-np.pi, np.pi), density=False)
    hist = hist.astype(np.float32)
    hist = hist / (float(np.sum(hist)) + eps)
    return np.repeat(hist[:, None], config.time_bins, axis=1)
