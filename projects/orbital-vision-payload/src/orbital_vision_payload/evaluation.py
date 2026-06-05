from __future__ import annotations

import json
import statistics
import time
from dataclasses import dataclass
from pathlib import Path

from orbital_vision_payload.datasets import ImageRecord, dataset_summary
from orbital_vision_payload.model import ImageClassifier
from orbital_vision_payload.priority import score_prediction


@dataclass(frozen=True)
class EvaluationResult:
    label: str
    predicted_label: str
    confidence: float
    priority_score: float
    downlink: bool
    latency_ms: float

    def to_dict(self) -> dict[str, object]:
        return {
            "label": self.label,
            "predicted_label": self.predicted_label,
            "confidence": self.confidence,
            "priority_score": self.priority_score,
            "downlink": self.downlink,
            "latency_ms": self.latency_ms,
        }


def evaluate_records(
    model: ImageClassifier,
    records: list[ImageRecord],
    *,
    mission_profile: str = "disaster_response",
    threshold: float = 0.62,
) -> dict[str, object]:
    if not records:
        raise ValueError("records cannot be empty")
    results: list[EvaluationResult] = []
    for record in records:
        started = time.perf_counter()
        prediction = model.predict_path(record.to_path())
        latency_ms = (time.perf_counter() - started) * 1000.0
        priority = score_prediction(prediction, mission_profile=mission_profile, threshold=threshold)
        results.append(
            EvaluationResult(
                label=record.label,
                predicted_label=prediction.label,
                confidence=prediction.confidence,
                priority_score=priority.priority_score,
                downlink=priority.downlink,
                latency_ms=latency_ms,
            )
        )
    accuracy = sum(item.label == item.predicted_label for item in results) / len(results)
    latencies = [item.latency_ms for item in results]
    confidences = [item.confidence for item in results]
    priorities = [item.priority_score for item in results]
    return {
        "model_type": model.model_type,
        "mission_profile": mission_profile,
        "threshold": threshold,
        "dataset_summary": dataset_summary(records),
        "accuracy": accuracy,
        "mean_confidence": statistics.fmean(confidences),
        "mean_priority_score": statistics.fmean(priorities),
        "downlink_rate": sum(item.downlink for item in results) / len(results),
        "latency_ms_p50": statistics.median(latencies),
        "latency_ms_p95": _percentile(latencies, 95),
        "per_label": _per_label_metrics(results),
    }


def write_evaluation_report(
    model: ImageClassifier,
    records: list[ImageRecord],
    path: Path,
    *,
    mission_profile: str = "disaster_response",
    threshold: float = 0.62,
) -> dict[str, object]:
    report = evaluate_records(model, records, mission_profile=mission_profile, threshold=threshold)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def _per_label_metrics(results: list[EvaluationResult]) -> dict[str, dict[str, float]]:
    labels = sorted({item.label for item in results})
    metrics: dict[str, dict[str, float]] = {}
    for label in labels:
        label_results = [item for item in results if item.label == label]
        metrics[label] = {
            "records": float(len(label_results)),
            "accuracy": sum(item.predicted_label == label for item in label_results) / len(label_results),
            "downlink_rate": sum(item.downlink for item in label_results) / len(label_results),
            "mean_priority_score": statistics.fmean(item.priority_score for item in label_results),
        }
    return metrics


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise ValueError("values cannot be empty")
    idx = min(len(ordered) - 1, round((percentile / 100.0) * (len(ordered) - 1)))
    return ordered[idx]
