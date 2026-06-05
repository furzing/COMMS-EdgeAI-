from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np

from rf_edge_sentinel.features import extract_features
from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig, generate_iq


MODEL_VERSION = 1


@dataclass(frozen=True)
class Prediction:
    label: str
    confidence: float
    anomaly_score: float
    probabilities: dict[str, float]


@dataclass
class EdgeKnnModel:
    labels: list[str]
    mean: np.ndarray
    std: np.ndarray
    exemplars: np.ndarray
    exemplar_labels: list[str]
    anomaly_threshold: float
    neighbors: int = 5

    def predict(self, features: np.ndarray) -> Prediction:
        z = self._normalize(features)
        exemplar_distances = np.sum((self.exemplars - z) ** 2, axis=1)
        logits = []
        for label in self.labels:
            label_distances = exemplar_distances[np.asarray(self.exemplar_labels) == label]
            nearest = np.sort(label_distances)[: self.neighbors]
            logits.append(-float(np.mean(nearest)))
        logits = np.asarray(logits, dtype=np.float32)
        probs = _softmax(logits)
        best_idx = int(np.argmax(probs))
        min_distance = float(np.min(exemplar_distances))
        anomaly_score = min_distance / max(float(self.anomaly_threshold), 1e-6)
        return Prediction(
            label=self.labels[best_idx],
            confidence=float(probs[best_idx]),
            anomaly_score=anomaly_score,
            probabilities={label: float(prob) for label, prob in zip(self.labels, probs)},
        )

    def save(self, path: str | Path) -> None:
        payload = {
            "version": MODEL_VERSION,
            "labels": self.labels,
            "mean": self.mean.tolist(),
            "std": self.std.tolist(),
            "exemplars": self.exemplars.tolist(),
            "exemplar_labels": self.exemplar_labels,
            "anomaly_threshold": self.anomaly_threshold,
            "neighbors": self.neighbors,
        }
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "EdgeKnnModel":
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        if payload.get("version") != MODEL_VERSION:
            raise ValueError(f"unsupported model version {payload.get('version')!r}")
        return cls(
            labels=list(payload["labels"]),
            mean=np.asarray(payload["mean"], dtype=np.float32),
            std=np.asarray(payload["std"], dtype=np.float32),
            exemplars=np.asarray(payload["exemplars"], dtype=np.float32),
            exemplar_labels=list(payload["exemplar_labels"]),
            anomaly_threshold=float(payload["anomaly_threshold"]),
            neighbors=int(payload.get("neighbors", 5)),
        )

    def _normalize(self, features: np.ndarray) -> np.ndarray:
        features = np.asarray(features, dtype=np.float32)
        return (features - self.mean) / self.std


def train_edge_model(
    samples_per_class: int,
    config: SignalConfig,
    seed: int,
    labels: Iterable[str] = SIGNAL_LABELS,
    max_exemplars_per_class: int = 96,
) -> EdgeKnnModel:
    rng = np.random.default_rng(seed)
    label_list = [label.lower() for label in labels]
    rows: list[np.ndarray] = []
    row_labels: list[str] = []

    for label in label_list:
        for _ in range(samples_per_class):
            iq = generate_iq(label, config, rng)
            rows.append(extract_features(iq, config.sample_rate_hz))
            row_labels.append(label)

    matrix = np.vstack(rows).astype(np.float32)
    mean = matrix.mean(axis=0)
    std = matrix.std(axis=0)
    std[std < 1e-6] = 1.0
    normalized = (matrix - mean) / std

    exemplars = []
    exemplar_labels = []
    row_labels_array = np.asarray(row_labels)
    for label in label_list:
        class_rows = normalized[row_labels_array == label]
        if class_rows.shape[0] > max_exemplars_per_class:
            chosen = rng.choice(class_rows.shape[0], size=max_exemplars_per_class, replace=False)
            class_rows = class_rows[chosen]
        exemplars.append(class_rows)
        exemplar_labels.extend([label] * class_rows.shape[0])

    exemplar_matrix = np.vstack(exemplars).astype(np.float32)
    train_nn_distances = _nearest_neighbor_distances(exemplar_matrix)
    threshold = float(np.percentile(train_nn_distances, 99.0) * 2.0)
    return EdgeKnnModel(
        labels=label_list,
        mean=mean.astype(np.float32),
        std=std.astype(np.float32),
        exemplars=exemplar_matrix,
        exemplar_labels=exemplar_labels,
        anomaly_threshold=threshold,
        neighbors=5,
    )


# Backward-compatible name for the first scaffold iteration.
CentroidModel = EdgeKnnModel
train_centroid_model = train_edge_model


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits)
    exp = np.exp(shifted)
    return exp / np.sum(exp)


def _nearest_neighbor_distances(matrix: np.ndarray) -> np.ndarray:
    distances: list[float] = []
    for index, row in enumerate(matrix):
        delta = matrix - row
        dist = np.sum(delta * delta, axis=1)
        dist[index] = np.inf
        distances.append(float(np.min(dist)))
    return np.asarray(distances, dtype=np.float32)
