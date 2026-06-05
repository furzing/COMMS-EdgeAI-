from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from orbital_vision_payload.datasets import ImageRecord
from orbital_vision_payload.features import FEATURE_NAMES, extract_path_features, feature_dim


@dataclass(frozen=True)
class Prediction:
    label: str
    confidence: float
    scores: dict[str, float]
    distance: float

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class CentroidImageClassifier:
    model_type = "centroid_rgb_features"

    def __init__(
        self,
        *,
        labels: list[str],
        centroids: np.ndarray,
        feature_mean: np.ndarray,
        feature_scale: np.ndarray,
        temperature: float,
        metadata: dict[str, object] | None = None,
    ) -> None:
        if centroids.shape != (len(labels), feature_dim()):
            raise ValueError("centroids shape does not match labels and feature dimension")
        self.labels = labels
        self.centroids = centroids.astype(np.float32)
        self.feature_mean = feature_mean.astype(np.float32)
        self.feature_scale = feature_scale.astype(np.float32)
        self.temperature = float(max(temperature, 1e-6))
        self.metadata = metadata or {}

    @classmethod
    def train(cls, records: list[ImageRecord]) -> "CentroidImageClassifier":
        if not records:
            raise ValueError("records cannot be empty")
        labels = sorted({record.label for record in records})
        features = np.vstack([extract_path_features(record.to_path()) for record in records])
        feature_mean = features.mean(axis=0)
        feature_scale = features.std(axis=0)
        feature_scale = np.where(feature_scale < 1e-6, 1.0, feature_scale)
        standardized = (features - feature_mean) / feature_scale

        centroids: list[np.ndarray] = []
        nearest_distances: list[float] = []
        for label in labels:
            indices = [idx for idx, record in enumerate(records) if record.label == label]
            class_vectors = standardized[indices]
            centroid = class_vectors.mean(axis=0)
            centroids.append(centroid)
            distances = np.linalg.norm(class_vectors - centroid, axis=1)
            nearest_distances.extend(float(value) for value in distances)

        temperature = float(np.median(nearest_distances)) if nearest_distances else 1.0
        return cls(
            labels=labels,
            centroids=np.vstack(centroids),
            feature_mean=feature_mean,
            feature_scale=feature_scale,
            temperature=max(temperature, 0.25),
            metadata={
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "training_records": len(records),
                "feature_names": list(FEATURE_NAMES),
            },
        )

    def predict_path(self, path: Path) -> Prediction:
        return self.predict_features(extract_path_features(path))

    def predict_features(self, features: np.ndarray) -> Prediction:
        if features.shape != (feature_dim(),):
            raise ValueError(f"expected feature vector shape {(feature_dim(),)}, got {features.shape}")
        standardized = (features.astype(np.float32) - self.feature_mean) / self.feature_scale
        distances = np.linalg.norm(self.centroids - standardized, axis=1)
        probabilities = _softmax((-distances / self.temperature).tolist())
        best_idx = int(np.argmax(probabilities))
        return Prediction(
            label=self.labels[best_idx],
            confidence=float(probabilities[best_idx]),
            scores={label: float(probabilities[idx]) for idx, label in enumerate(self.labels)},
            distance=float(distances[best_idx]),
        )

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "model_type": self.model_type,
            "labels": self.labels,
            "centroids": self.centroids.tolist(),
            "feature_mean": self.feature_mean.tolist(),
            "feature_scale": self.feature_scale.tolist(),
            "temperature": self.temperature,
            "metadata": self.metadata,
        }
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "CentroidImageClassifier":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("model_type") != cls.model_type:
            raise ValueError(f"Unsupported model_type in {path}: {payload.get('model_type')}")
        return cls(
            labels=[str(label) for label in payload["labels"]],
            centroids=np.asarray(payload["centroids"], dtype=np.float32),
            feature_mean=np.asarray(payload["feature_mean"], dtype=np.float32),
            feature_scale=np.asarray(payload["feature_scale"], dtype=np.float32),
            temperature=float(payload["temperature"]),
            metadata=dict(payload.get("metadata", {})),
        )


class KNearestImageClassifier:
    model_type = "knn_rgb_features"

    def __init__(
        self,
        *,
        labels: list[str],
        train_features: np.ndarray,
        train_labels: list[str],
        feature_mean: np.ndarray,
        feature_scale: np.ndarray,
        neighbors: int,
        metadata: dict[str, object] | None = None,
    ) -> None:
        if train_features.ndim != 2 or train_features.shape[1] != feature_dim():
            raise ValueError("train_features shape does not match feature dimension")
        if train_features.shape[0] != len(train_labels):
            raise ValueError("train_features and train_labels must have the same length")
        self.labels = labels
        self.train_features = train_features.astype(np.float32)
        self.train_labels = train_labels
        self.feature_mean = feature_mean.astype(np.float32)
        self.feature_scale = feature_scale.astype(np.float32)
        self.neighbors = max(1, int(neighbors))
        self.metadata = metadata or {}

    @classmethod
    def train(cls, records: list[ImageRecord], *, neighbors: int = 5) -> "KNearestImageClassifier":
        if not records:
            raise ValueError("records cannot be empty")
        labels = sorted({record.label for record in records})
        features = np.vstack([extract_path_features(record.to_path()) for record in records])
        feature_mean = features.mean(axis=0)
        feature_scale = features.std(axis=0)
        feature_scale = np.where(feature_scale < 1e-6, 1.0, feature_scale)
        standardized = (features - feature_mean) / feature_scale
        return cls(
            labels=labels,
            train_features=standardized,
            train_labels=[record.label for record in records],
            feature_mean=feature_mean,
            feature_scale=feature_scale,
            neighbors=neighbors,
            metadata={
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "training_records": len(records),
                "feature_names": list(FEATURE_NAMES),
            },
        )

    def predict_path(self, path: Path) -> Prediction:
        return self.predict_features(extract_path_features(path))

    def predict_features(self, features: np.ndarray) -> Prediction:
        if features.shape != (feature_dim(),):
            raise ValueError(f"expected feature vector shape {(feature_dim(),)}, got {features.shape}")
        standardized = (features.astype(np.float32) - self.feature_mean) / self.feature_scale
        distances = np.linalg.norm(self.train_features - standardized, axis=1)
        k = min(self.neighbors, len(distances))
        neighbor_indices = np.argpartition(distances, k - 1)[:k]
        weights = {label: 0.0 for label in self.labels}
        for index in neighbor_indices:
            label = self.train_labels[int(index)]
            weights[label] += 1.0 / (float(distances[int(index)]) + 1e-6)
        total_weight = sum(weights.values())
        if total_weight <= 0.0:
            scores = {label: 1.0 / len(self.labels) for label in self.labels}
        else:
            scores = {label: float(weight / total_weight) for label, weight in weights.items()}
        best_label = max(scores, key=scores.get)
        return Prediction(
            label=best_label,
            confidence=scores[best_label],
            scores=scores,
            distance=float(np.min(distances)),
        )

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "model_type": self.model_type,
            "labels": self.labels,
            "train_features": self.train_features.tolist(),
            "train_labels": self.train_labels,
            "feature_mean": self.feature_mean.tolist(),
            "feature_scale": self.feature_scale.tolist(),
            "neighbors": self.neighbors,
            "metadata": self.metadata,
        }
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "KNearestImageClassifier":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("model_type") != cls.model_type:
            raise ValueError(f"Unsupported model_type in {path}: {payload.get('model_type')}")
        return cls(
            labels=[str(label) for label in payload["labels"]],
            train_features=np.asarray(payload["train_features"], dtype=np.float32),
            train_labels=[str(label) for label in payload["train_labels"]],
            feature_mean=np.asarray(payload["feature_mean"], dtype=np.float32),
            feature_scale=np.asarray(payload["feature_scale"], dtype=np.float32),
            neighbors=int(payload["neighbors"]),
            metadata=dict(payload.get("metadata", {})),
        )


ImageClassifier = CentroidImageClassifier | KNearestImageClassifier


def load_image_model(path: Path) -> ImageClassifier:
    payload = json.loads(path.read_text(encoding="utf-8"))
    model_type = payload.get("model_type")
    if model_type == CentroidImageClassifier.model_type:
        return CentroidImageClassifier.load(path)
    if model_type == KNearestImageClassifier.model_type:
        return KNearestImageClassifier.load(path)
    raise ValueError(f"Unsupported model_type in {path}: {model_type}")


def _softmax(values: list[float]) -> np.ndarray:
    max_value = max(values)
    shifted = [math.exp(value - max_value) for value in values]
    total = sum(shifted)
    if total <= 0.0:
        return np.full((len(values),), 1.0 / len(values), dtype=np.float32)
    return np.asarray([value / total for value in shifted], dtype=np.float32)
