from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from orbital_vision_payload.datasets import ImageRecord, index_eurosat, split_records, write_manifest
from orbital_vision_payload.evaluation import evaluate_records, write_evaluation_report
from orbital_vision_payload.features import extract_rgb_features, feature_dim, load_rgb_image
from orbital_vision_payload.model import CentroidImageClassifier, KNearestImageClassifier, load_image_model
from orbital_vision_payload.priority import MISSION_PROFILE_WEIGHTS, score_prediction
from orbital_vision_payload.stac import normalize_datetime_range, parse_stac_search


class OrbitalVisionPayloadTests(unittest.TestCase):
    def test_rgb_feature_dimension_is_stable(self) -> None:
        image = np.zeros((64, 64, 3), dtype=np.float32)
        image[:, :, 1] = 0.8

        features = extract_rgb_features(image)

        self.assertEqual(features.shape, (feature_dim(),))
        self.assertTrue(np.all(np.isfinite(features)))

    def test_index_manifest_and_split_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            records = _write_fixture_dataset(root, labels=("Forest", "River"), samples_per_label=4)

            indexed = index_eurosat(root, max_per_class=3, labels=("Forest", "River"))
            manifest = write_manifest(indexed, root / "manifest.json")
            train, test = split_records(indexed, train_fraction=0.5, seed=4)

        self.assertEqual(len(records), 8)
        self.assertEqual(len(indexed), 6)
        self.assertEqual(manifest["summary"]["total_records"], 6)
        self.assertEqual(len(train), 4)
        self.assertEqual(len(test), 2)

    def test_model_save_load_predict_and_priority(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_fixture_dataset(root, labels=("Forest", "River"), samples_per_label=5)
            records = index_eurosat(root, labels=("Forest", "River"))
            model = CentroidImageClassifier.train(records)
            model_path = root / "model.json"
            model.save(model_path)
            loaded = CentroidImageClassifier.load(model_path)

            image_path = records[0].to_path()
            prediction = loaded.predict_path(image_path)
            priority = score_prediction(prediction, mission_profile="wildfire_watch", threshold=0.5)

        self.assertIn(prediction.label, {"Forest", "River"})
        self.assertGreaterEqual(prediction.confidence, 0.0)
        self.assertLessEqual(prediction.confidence, 1.0)
        self.assertEqual(priority.mission_profile, "wildfire_watch")

    def test_knn_model_save_load_and_predict(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_fixture_dataset(root, labels=("Forest", "River"), samples_per_label=5)
            records = index_eurosat(root, labels=("Forest", "River"))
            model = KNearestImageClassifier.train(records, neighbors=3)
            model_path = root / "model.json"
            model.save(model_path)
            loaded = load_image_model(model_path)

            prediction = loaded.predict_path(records[0].to_path())

        self.assertIn(prediction.label, {"Forest", "River"})
        self.assertGreaterEqual(prediction.confidence, 0.0)

    def test_evaluation_report_contains_latency_and_priority(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_fixture_dataset(root, labels=("Forest", "River"), samples_per_label=5)
            records = index_eurosat(root, labels=("Forest", "River"))
            train, test = split_records(records, train_fraction=0.6, seed=5)
            model = CentroidImageClassifier.train(train)

            report = evaluate_records(model, test, mission_profile="disaster_response")
            written = write_evaluation_report(model, test, root / "report.json")
            payload = json.loads((root / "report.json").read_text(encoding="utf-8"))

        self.assertIn("latency_ms_p50", report)
        self.assertIn("downlink_rate", written)
        self.assertEqual(payload["model_type"], "centroid_rgb_features")

    def test_parse_stac_search_extracts_scene_metadata(self) -> None:
        payload = {
            "features": [
                {
                    "id": "S2A_TEST",
                    "collection": "sentinel-2-c1-l2a",
                    "properties": {
                        "datetime": "2025-06-01T08:00:00Z",
                        "eo:cloud_cover": 12.5,
                        "platform": "sentinel-2a",
                    },
                    "assets": {
                        "visual": {"href": "https://example.test/visual.tif"},
                        "red": {"href": "https://example.test/red.tif"},
                    },
                }
            ]
        }

        scenes = parse_stac_search(payload)

        self.assertEqual(len(scenes), 1)
        self.assertEqual(scenes[0].item_id, "S2A_TEST")
        self.assertEqual(scenes[0].cloud_cover, 12.5)
        self.assertIn("visual", scenes[0].asset_hrefs)
        self.assertAlmostEqual(scenes[0].quality_score, 0.875)

    def test_stac_datetime_normalizes_date_only_ranges(self) -> None:
        normalized = normalize_datetime_range("2025-06-01/2025-06-30")

        self.assertEqual(normalized, "2025-06-01T00:00:00Z/2025-06-30T23:59:59Z")

    def test_mission_profiles_are_available(self) -> None:
        self.assertIn("disaster_response", MISSION_PROFILE_WEIGHTS)
        self.assertIn("wildfire_watch", MISSION_PROFILE_WEIGHTS)


def _write_fixture_dataset(root: Path, *, labels: tuple[str, ...], samples_per_label: int) -> list[ImageRecord]:
    records: list[ImageRecord] = []
    colors = {
        "Forest": (34, 132, 58),
        "River": (28, 92, 170),
        "Industrial": (160, 150, 145),
    }
    for label in labels:
        label_dir = root / label
        label_dir.mkdir(parents=True, exist_ok=True)
        base = np.asarray(colors.get(label, (120, 120, 120)), dtype=np.uint8)
        for idx in range(samples_per_label):
            image = np.zeros((64, 64, 3), dtype=np.uint8)
            image[:, :] = np.clip(base + idx, 0, 255)
            if label == "Forest":
                image[::4, :, 1] = np.clip(image[::4, :, 1] + 20, 0, 255)
            if label == "River":
                image[:, ::4, 2] = np.clip(image[:, ::4, 2] + 20, 0, 255)
            path = label_dir / f"{label}_{idx}.jpg"
            Image.fromarray(image).save(path)
            records.append(ImageRecord(path=str(path), label=label))
    return records


if __name__ == "__main__":
    unittest.main()
