from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from rf_edge_sentinel.model import Prediction
from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig, generate_iq
from rf_edge_sentinel.spectrogram import (
    DEFAULT_SPECTROGRAM_CONFIG,
    SpectrogramConfig,
    iq_to_spectrogram_tensor,
    spectrogram_shape,
)


CNN_MODEL_VERSION = 1
CONV_FILTERS = 24
POOL_KERNEL = 2
POOL_STRIDE = 2


@dataclass
class SmallSpectrogramCnn:
    labels: list[str]
    conv_weight: np.ndarray
    conv_bias: np.ndarray
    dense_weight: np.ndarray
    dense_bias: np.ndarray
    embedding_mean: np.ndarray
    embedding_std: np.ndarray
    class_centroids: np.ndarray
    anomaly_threshold: float
    spectrogram_config: SpectrogramConfig = DEFAULT_SPECTROGRAM_CONFIG

    @property
    def model_type(self) -> str:
        return "spectrogram_cnn"

    def predict_iq(self, iq: np.ndarray, signal_config: SignalConfig) -> Prediction:
        tensor = iq_to_spectrogram_tensor(iq, signal_config, self.spectrogram_config)
        return self.predict_tensor(tensor)

    def predict_tensor(self, tensor: np.ndarray) -> Prediction:
        embedding = self.embedding(tensor)
        normalized = self._normalize_embedding(embedding)
        logits = normalized @ self.dense_weight + self.dense_bias
        probs = _softmax(logits)
        best_idx = int(np.argmax(probs))
        distances = np.sum((self.class_centroids - normalized) ** 2, axis=1)
        anomaly_score = float(np.min(distances)) / max(self.anomaly_threshold, 1e-6)
        return Prediction(
            label=self.labels[best_idx],
            confidence=float(probs[best_idx]),
            anomaly_score=anomaly_score,
            probabilities={label: float(prob) for label, prob in zip(self.labels, probs)},
        )

    def embedding(self, tensor: np.ndarray) -> np.ndarray:
        x = np.asarray(tensor, dtype=np.float32)
        if x.shape != spectrogram_shape(self.spectrogram_config):
            raise ValueError(f"expected tensor shape {spectrogram_shape(self.spectrogram_config)}, got {x.shape}")
        x = _conv2d_same(x, self.conv_weight, self.conv_bias)
        x = np.maximum(x, 0.0)
        x = _avg_pool2d(x, kernel_size=POOL_KERNEL, stride=POOL_STRIDE)
        return x.reshape(-1).astype(np.float32)

    def save(self, path: str | Path) -> None:
        payload = {
            "version": CNN_MODEL_VERSION,
            "model_type": self.model_type,
            "labels": self.labels,
            "spectrogram_config": {
                "channels": self.spectrogram_config.channels,
                "frequency_bins": self.spectrogram_config.frequency_bins,
                "time_bins": self.spectrogram_config.time_bins,
                "frame_size": self.spectrogram_config.frame_size,
            },
            "conv_weight": self.conv_weight.tolist(),
            "conv_bias": self.conv_bias.tolist(),
            "dense_weight": self.dense_weight.tolist(),
            "dense_bias": self.dense_bias.tolist(),
            "embedding_mean": self.embedding_mean.tolist(),
            "embedding_std": self.embedding_std.tolist(),
            "class_centroids": self.class_centroids.tolist(),
            "anomaly_threshold": self.anomaly_threshold,
        }
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "SmallSpectrogramCnn":
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        if payload.get("version") != CNN_MODEL_VERSION:
            raise ValueError(f"unsupported CNN model version {payload.get('version')!r}")
        if payload.get("model_type") != "spectrogram_cnn":
            raise ValueError(f"unsupported model type {payload.get('model_type')!r}")
        spectrogram_config = SpectrogramConfig(**payload["spectrogram_config"])
        return cls(
            labels=list(payload["labels"]),
            conv_weight=np.asarray(payload["conv_weight"], dtype=np.float32),
            conv_bias=np.asarray(payload["conv_bias"], dtype=np.float32),
            dense_weight=np.asarray(payload["dense_weight"], dtype=np.float32),
            dense_bias=np.asarray(payload["dense_bias"], dtype=np.float32),
            embedding_mean=np.asarray(payload["embedding_mean"], dtype=np.float32),
            embedding_std=np.asarray(payload["embedding_std"], dtype=np.float32),
            class_centroids=np.asarray(payload["class_centroids"], dtype=np.float32),
            anomaly_threshold=float(payload["anomaly_threshold"]),
            spectrogram_config=spectrogram_config,
        )

    def export_onnx(self, path: str | Path) -> None:
        try:
            import onnx
            from onnx import TensorProto, helper, numpy_helper
        except ImportError as exc:
            raise RuntimeError("ONNX export requires the optional 'onnx' package") from exc

        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        channels, height, width = spectrogram_shape(self.spectrogram_config)
        dense_weight, dense_bias = self._fold_embedding_normalization()

        initializers = [
            numpy_helper.from_array(self.conv_weight.astype(np.float32), name="conv_weight"),
            numpy_helper.from_array(self.conv_bias.astype(np.float32), name="conv_bias"),
            numpy_helper.from_array(dense_weight.astype(np.float32), name="dense_weight"),
            numpy_helper.from_array(dense_bias.astype(np.float32), name="dense_bias"),
        ]
        graph = helper.make_graph(
            nodes=[
                helper.make_node(
                    "Conv",
                    ["input", "conv_weight", "conv_bias"],
                    ["conv"],
                    pads=[1, 1, 1, 1],
                    strides=[1, 1],
                ),
                helper.make_node("Relu", ["conv"], ["relu"]),
                helper.make_node(
                    "AveragePool",
                    ["relu"],
                    ["pool"],
                    kernel_shape=[POOL_KERNEL, POOL_KERNEL],
                    strides=[POOL_STRIDE, POOL_STRIDE],
                ),
                helper.make_node("Flatten", ["pool"], ["flat"], axis=1),
                helper.make_node("Gemm", ["flat", "dense_weight", "dense_bias"], ["logits"], transB=0),
                helper.make_node("Softmax", ["logits"], ["probabilities"], axis=1),
            ],
            name="rf_edge_sentinel_spectrogram_cnn",
            inputs=[helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, channels, height, width])],
            outputs=[
                helper.make_tensor_value_info("probabilities", TensorProto.FLOAT, [1, len(self.labels)]),
                helper.make_tensor_value_info("logits", TensorProto.FLOAT, [1, len(self.labels)]),
            ],
            initializer=initializers,
        )
        model = helper.make_model(
            graph,
            producer_name="rf-edge-sentinel",
            opset_imports=[helper.make_operatorsetid("", 13)],
        )
        onnx.checker.check_model(model)
        onnx.save(model, path)

    def _normalize_embedding(self, embedding: np.ndarray) -> np.ndarray:
        return (embedding - self.embedding_mean) / self.embedding_std

    def _fold_embedding_normalization(self) -> tuple[np.ndarray, np.ndarray]:
        std = np.where(self.embedding_std < 1e-6, 1.0, self.embedding_std)
        folded_weight = self.dense_weight / std[:, None]
        folded_bias = self.dense_bias - (self.embedding_mean / std) @ self.dense_weight
        return folded_weight.astype(np.float32), folded_bias.astype(np.float32)


def train_spectrogram_cnn(
    samples_per_class: int,
    signal_config: SignalConfig,
    seed: int,
    labels: Iterable[str] = SIGNAL_LABELS,
    ridge_lambda: float = 0.05,
    spectrogram_config: SpectrogramConfig = DEFAULT_SPECTROGRAM_CONFIG,
) -> SmallSpectrogramCnn:
    rng = np.random.default_rng(seed)
    label_list = [label.lower() for label in labels]
    conv_weight, conv_bias = _make_conv_bank(input_channels=spectrogram_config.channels, filters=CONV_FILTERS, seed=seed)
    embedding_dim = _embedding_dim(spectrogram_config)

    embeddings: list[np.ndarray] = []
    y: list[int] = []
    feature_extractor = SmallSpectrogramCnn(
        labels=label_list,
        conv_weight=conv_weight,
        conv_bias=conv_bias,
        dense_weight=np.zeros((embedding_dim, len(label_list)), dtype=np.float32),
        dense_bias=np.zeros(len(label_list), dtype=np.float32),
        embedding_mean=np.zeros(embedding_dim, dtype=np.float32),
        embedding_std=np.ones(embedding_dim, dtype=np.float32),
        class_centroids=np.zeros((len(label_list), embedding_dim), dtype=np.float32),
        anomaly_threshold=1.0,
        spectrogram_config=spectrogram_config,
    )

    for class_idx, label in enumerate(label_list):
        for _ in range(samples_per_class):
            iq = generate_iq(label, signal_config, rng)
            tensor = iq_to_spectrogram_tensor(iq, signal_config, spectrogram_config)
            embeddings.append(feature_extractor.embedding(tensor))
            y.append(class_idx)

    x = np.vstack(embeddings).astype(np.float32)
    y_array = np.asarray(y, dtype=np.int64)
    embedding_mean = x.mean(axis=0)
    embedding_std = x.std(axis=0)
    embedding_std[embedding_std < 1e-6] = 1.0
    x_norm = (x - embedding_mean) / embedding_std
    dense_weight, dense_bias = _fit_ridge_head(x_norm, y_array, classes=len(label_list), ridge_lambda=ridge_lambda)

    centroids = []
    distances = []
    for class_idx in range(len(label_list)):
        rows = x_norm[y_array == class_idx]
        centroid = rows.mean(axis=0)
        centroids.append(centroid)
        distances.extend(np.sum((rows - centroid) ** 2, axis=1).tolist())

    threshold = float(np.percentile(distances, 98.0) * 1.4)
    return SmallSpectrogramCnn(
        labels=label_list,
        conv_weight=conv_weight,
        conv_bias=conv_bias,
        dense_weight=dense_weight,
        dense_bias=dense_bias,
        embedding_mean=embedding_mean.astype(np.float32),
        embedding_std=embedding_std.astype(np.float32),
        class_centroids=np.vstack(centroids).astype(np.float32),
        anomaly_threshold=threshold,
        spectrogram_config=spectrogram_config,
    )


def _conv2d_same(x: np.ndarray, weights: np.ndarray, bias: np.ndarray) -> np.ndarray:
    _, kernel_h, kernel_w = weights.shape[1:]
    pad_h = kernel_h // 2
    pad_w = kernel_w // 2
    padded = np.pad(x, ((0, 0), (pad_h, pad_h), (pad_w, pad_w)), mode="constant")
    windows = sliding_window_view(padded, (kernel_h, kernel_w), axis=(1, 2))
    out = np.einsum("chwkl,ockl->ohw", windows, weights, optimize=True)
    return (out + bias[:, None, None]).astype(np.float32)


def _avg_pool2d(x: np.ndarray, kernel_size: int, stride: int) -> np.ndarray:
    channels, height, width = x.shape
    pooled_h = 1 + (height - kernel_size) // stride
    pooled_w = 1 + (width - kernel_size) // stride
    out = np.empty((channels, pooled_h, pooled_w), dtype=np.float32)
    for row in range(pooled_h):
        for col in range(pooled_w):
            window = x[
                :,
                row * stride : row * stride + kernel_size,
                col * stride : col * stride + kernel_size,
            ]
            out[:, row, col] = np.mean(window, axis=(1, 2))
    return out


def _embedding_dim(config: SpectrogramConfig) -> int:
    pooled_h = 1 + (config.frequency_bins - POOL_KERNEL) // POOL_STRIDE
    pooled_w = 1 + (config.time_bins - POOL_KERNEL) // POOL_STRIDE
    return CONV_FILTERS * pooled_h * pooled_w


def _make_conv_bank(input_channels: int, filters: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    base_kernels = np.asarray(
        [
            [[0, 0, 0], [0, 1, 0], [0, 0, 0]],
            [[1, 0, -1], [2, 0, -2], [1, 0, -1]],
            [[1, 2, 1], [0, 0, 0], [-1, -2, -1]],
            [[0, 1, 0], [1, -4, 1], [0, 1, 0]],
            [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
            [[2, -1, -1], [-1, 2, -1], [-1, -1, 2]],
            [[0, -1, 2], [-1, 2, -1], [2, -1, 0]],
            [[2, -1, 0], [-1, 2, -1], [0, -1, 2]],
        ],
        dtype=np.float32,
    )
    rng = np.random.default_rng(seed)
    weights = np.zeros((filters, input_channels, 3, 3), dtype=np.float32)
    for out_channel in range(filters):
        kernel = base_kernels[out_channel % len(base_kernels)].copy()
        kernel = kernel / (float(np.linalg.norm(kernel)) + 1e-6)
        channel = out_channel % input_channels
        weights[out_channel, channel] = kernel
        if out_channel >= len(base_kernels) * input_channels:
            weights[out_channel] += rng.normal(0.0, 0.08, size=(input_channels, 3, 3)).astype(np.float32)
    bias = np.zeros(filters, dtype=np.float32)
    return weights, bias


def _fit_ridge_head(
    x: np.ndarray,
    y: np.ndarray,
    classes: int,
    ridge_lambda: float,
) -> tuple[np.ndarray, np.ndarray]:
    one_hot = np.eye(classes, dtype=np.float32)[y]
    x_aug = np.hstack([x, np.ones((x.shape[0], 1), dtype=np.float32)])
    regularizer = ridge_lambda * np.eye(x_aug.shape[0], dtype=np.float32)
    alpha = np.linalg.solve(x_aug @ x_aug.T + regularizer, one_hot)
    weights_aug = x_aug.T @ alpha
    return weights_aug[:-1].astype(np.float32), weights_aug[-1].astype(np.float32)


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits)
    exp = np.exp(shifted)
    return exp / np.sum(exp)
