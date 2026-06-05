from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


FEATURE_NAMES = (
    "mean_red",
    "mean_green",
    "mean_blue",
    "std_red",
    "std_green",
    "std_blue",
    "p10_luma",
    "p50_luma",
    "p90_luma",
    "green_minus_red",
    "blue_minus_green",
    "red_blue_ratio",
    "edge_mean",
    "edge_std",
    "edge_p90",
    "dark_fraction",
    "bright_fraction",
    "green_dominant_fraction",
    "blue_dominant_fraction",
    "red_dominant_fraction",
    "red_hist_0",
    "red_hist_1",
    "red_hist_2",
    "red_hist_3",
    "green_hist_0",
    "green_hist_1",
    "green_hist_2",
    "green_hist_3",
    "blue_hist_0",
    "blue_hist_1",
    "blue_hist_2",
    "blue_hist_3",
)


def load_rgb_image(path: Path, *, size: tuple[int, int] = (64, 64)) -> np.ndarray:
    with Image.open(path) as image:
        rgb = image.convert("RGB")
        if rgb.size != size:
            rgb = rgb.resize(size, Image.Resampling.BILINEAR)
        return np.asarray(rgb, dtype=np.float32) / 255.0


def extract_rgb_features(image: np.ndarray) -> np.ndarray:
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("image must have shape HxWx3")
    arr = image.astype(np.float32)
    if arr.max(initial=0.0) > 1.5:
        arr = arr / 255.0

    red = arr[:, :, 0]
    green = arr[:, :, 1]
    blue = arr[:, :, 2]
    luma = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)

    gx = np.diff(luma, axis=1, append=luma[:, -1:])
    gy = np.diff(luma, axis=0, append=luma[-1:, :])
    edge = np.sqrt((gx * gx) + (gy * gy))

    red_hist = _hist4(red)
    green_hist = _hist4(green)
    blue_hist = _hist4(blue)
    eps = 1e-6

    values = [
        float(red.mean()),
        float(green.mean()),
        float(blue.mean()),
        float(red.std()),
        float(green.std()),
        float(blue.std()),
        float(np.percentile(luma, 10)),
        float(np.percentile(luma, 50)),
        float(np.percentile(luma, 90)),
        float(green.mean() - red.mean()),
        float(blue.mean() - green.mean()),
        float(red.mean() / (blue.mean() + eps)),
        float(edge.mean()),
        float(edge.std()),
        float(np.percentile(edge, 90)),
        float(np.mean(luma < 0.2)),
        float(np.mean(luma > 0.8)),
        float(np.mean((green > red + 0.03) & (green > blue + 0.03))),
        float(np.mean((blue > red + 0.03) & (blue > green + 0.03))),
        float(np.mean((red > green + 0.03) & (red > blue + 0.03))),
        *red_hist,
        *green_hist,
        *blue_hist,
    ]
    return np.asarray(values, dtype=np.float32)


def extract_path_features(path: Path) -> np.ndarray:
    return extract_rgb_features(load_rgb_image(path))


def feature_dim() -> int:
    return len(FEATURE_NAMES)


def _hist4(channel: np.ndarray) -> list[float]:
    hist, _ = np.histogram(channel, bins=4, range=(0.0, 1.0))
    total = max(int(hist.sum()), 1)
    return [float(value / total) for value in hist]
