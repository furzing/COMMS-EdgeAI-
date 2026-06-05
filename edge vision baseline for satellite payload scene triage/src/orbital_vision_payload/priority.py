from __future__ import annotations

from dataclasses import dataclass

from orbital_vision_payload.model import Prediction


MISSION_PROFILE_WEIGHTS: dict[str, dict[str, float]] = {
    "disaster_response": {
        "AnnualCrop": 0.62,
        "Forest": 0.70,
        "HerbaceousVegetation": 0.64,
        "Highway": 0.82,
        "Industrial": 0.86,
        "Pasture": 0.55,
        "PermanentCrop": 0.58,
        "Residential": 0.90,
        "River": 0.88,
        "SeaLake": 0.48,
    },
    "agriculture": {
        "AnnualCrop": 0.92,
        "Forest": 0.42,
        "HerbaceousVegetation": 0.80,
        "Highway": 0.35,
        "Industrial": 0.30,
        "Pasture": 0.78,
        "PermanentCrop": 0.88,
        "Residential": 0.28,
        "River": 0.55,
        "SeaLake": 0.30,
    },
    "wildfire_watch": {
        "AnnualCrop": 0.62,
        "Forest": 0.95,
        "HerbaceousVegetation": 0.86,
        "Highway": 0.50,
        "Industrial": 0.70,
        "Pasture": 0.78,
        "PermanentCrop": 0.72,
        "Residential": 0.68,
        "River": 0.38,
        "SeaLake": 0.20,
    },
    "maritime": {
        "AnnualCrop": 0.20,
        "Forest": 0.20,
        "HerbaceousVegetation": 0.18,
        "Highway": 0.35,
        "Industrial": 0.58,
        "Pasture": 0.18,
        "PermanentCrop": 0.20,
        "Residential": 0.42,
        "River": 0.72,
        "SeaLake": 0.94,
    },
    "infrastructure": {
        "AnnualCrop": 0.32,
        "Forest": 0.24,
        "HerbaceousVegetation": 0.22,
        "Highway": 0.92,
        "Industrial": 0.95,
        "Pasture": 0.20,
        "PermanentCrop": 0.24,
        "Residential": 0.90,
        "River": 0.55,
        "SeaLake": 0.38,
    },
}


@dataclass(frozen=True)
class PriorityDecision:
    mission_profile: str
    predicted_label: str
    confidence: float
    priority_score: float
    downlink: bool
    threshold: float

    def to_dict(self) -> dict[str, object]:
        return {
            "mission_profile": self.mission_profile,
            "predicted_label": self.predicted_label,
            "confidence": self.confidence,
            "priority_score": self.priority_score,
            "downlink": self.downlink,
            "threshold": self.threshold,
        }


def score_prediction(
    prediction: Prediction,
    *,
    mission_profile: str = "disaster_response",
    threshold: float = 0.62,
) -> PriorityDecision:
    if mission_profile not in MISSION_PROFILE_WEIGHTS:
        raise ValueError(f"Unknown mission profile: {mission_profile}")
    label_weights = MISSION_PROFILE_WEIGHTS[mission_profile]
    mission_value = label_weights.get(prediction.label, 0.25)
    confidence_floor = 0.35
    priority = mission_value * (confidence_floor + ((1.0 - confidence_floor) * prediction.confidence))
    priority = max(0.0, min(1.0, priority))
    return PriorityDecision(
        mission_profile=mission_profile,
        predicted_label=prediction.label,
        confidence=prediction.confidence,
        priority_score=priority,
        downlink=priority >= threshold,
        threshold=threshold,
    )
