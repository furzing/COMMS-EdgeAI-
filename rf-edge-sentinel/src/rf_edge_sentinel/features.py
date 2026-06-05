from __future__ import annotations

import numpy as np


PSD_BINS = 64
PHASE_BINS = 16
AMPLITUDE_BINS = 8


def extract_features(iq: np.ndarray, sample_rate_hz: float, psd_bins: int = PSD_BINS) -> np.ndarray:
    """Convert one complex I/Q window into deterministic edge-friendly features."""
    if iq.ndim != 1:
        raise ValueError("iq must be a 1-D complex array")
    if iq.size < psd_bins:
        raise ValueError(f"iq window must contain at least {psd_bins} samples")

    x = np.asarray(iq, dtype=np.complex64)
    power = np.abs(x) ** 2
    eps = 1e-12

    window = np.hanning(x.size).astype(np.float32)
    spectrum = np.fft.fftshift(np.fft.fft(x * window))
    psd = (np.abs(spectrum) ** 2).astype(np.float64)
    psd = psd / (float(np.sum(psd)) + eps)

    reduced_psd = _bin_average(psd, psd_bins)
    reduced_psd = reduced_psd / (float(np.sum(reduced_psd)) + eps)

    freqs = np.fft.fftshift(np.fft.fftfreq(x.size, d=1.0 / sample_rate_hz))
    centroid_hz = float(np.sum(freqs * psd))
    occupied_bw_hz = _occupied_bandwidth(freqs, psd, fraction=0.9)

    spectral_entropy = -float(np.sum(psd * np.log2(psd + eps))) / np.log2(psd.size)
    peak_to_mean_psd = float(np.max(psd) / (np.mean(psd) + eps))
    iq_mean_abs = float(np.mean(np.abs(x)))
    iq_std_abs = float(np.std(np.abs(x)))
    energy_db = 10.0 * np.log10(float(np.mean(power)) + eps)
    i_q_corr = float(np.corrcoef(x.real, x.imag)[0, 1]) if x.size > 1 else 0.0
    if not np.isfinite(i_q_corr):
        i_q_corr = 0.0

    unit = x / (np.abs(x) + eps)
    phase_step = np.angle(unit[1:] * np.conj(unit[:-1]))
    phase_hist, _ = np.histogram(phase_step, bins=PHASE_BINS, range=(-np.pi, np.pi), density=False)
    phase_hist = phase_hist.astype(np.float64)
    phase_hist = phase_hist / (float(np.sum(phase_hist)) + eps)

    amp = np.abs(x)
    amp_norm = amp / (float(np.percentile(amp, 95)) + eps)
    amp_hist, _ = np.histogram(np.clip(amp_norm, 0.0, 2.0), bins=AMPLITUDE_BINS, range=(0.0, 2.0))
    amp_hist = amp_hist.astype(np.float64)
    amp_hist = amp_hist / (float(np.sum(amp_hist)) + eps)

    phase_moments = np.array(
        [
            abs(np.mean(unit**2)),
            abs(np.mean(unit**4)),
            abs(np.mean(np.exp(1j * phase_step))),
            abs(np.mean(np.exp(2j * phase_step))),
            abs(np.mean(np.exp(4j * phase_step))),
            _kurtosis(amp),
        ],
        dtype=np.float32,
    )

    summary = np.array(
        [
            energy_db,
            iq_mean_abs,
            iq_std_abs,
            spectral_entropy,
            peak_to_mean_psd,
            centroid_hz / sample_rate_hz,
            occupied_bw_hz / sample_rate_hz,
            i_q_corr,
        ],
        dtype=np.float32,
    )
    return np.concatenate(
        [
            summary,
            phase_moments,
            phase_hist.astype(np.float32),
            amp_hist.astype(np.float32),
            reduced_psd.astype(np.float32),
        ]
    )


def feature_dim(psd_bins: int = PSD_BINS) -> int:
    return 8 + 6 + PHASE_BINS + AMPLITUDE_BINS + psd_bins


def _bin_average(values: np.ndarray, bins: int) -> np.ndarray:
    edges = np.linspace(0, values.size, bins + 1, dtype=int)
    return np.array([np.mean(values[edges[i] : edges[i + 1]]) for i in range(bins)], dtype=np.float64)


def _occupied_bandwidth(freqs: np.ndarray, psd: np.ndarray, fraction: float) -> float:
    order = np.argsort(freqs)
    sorted_freqs = freqs[order]
    sorted_psd = psd[order]
    cdf = np.cumsum(sorted_psd)
    low = sorted_freqs[np.searchsorted(cdf, (1.0 - fraction) / 2.0)]
    high = sorted_freqs[np.searchsorted(cdf, 1.0 - (1.0 - fraction) / 2.0)]
    return float(abs(high - low))


def _kurtosis(values: np.ndarray) -> float:
    centered = values - np.mean(values)
    var = float(np.mean(centered**2))
    if var < 1e-12:
        return 0.0
    return float(np.mean(centered**4) / (var**2))
