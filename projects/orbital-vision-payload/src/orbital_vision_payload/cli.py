from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path

from orbital_vision_payload.datasets import (
    dataset_summary,
    download_eurosat_rgb,
    index_eurosat,
    split_records,
    write_manifest,
)
from orbital_vision_payload.evaluation import write_evaluation_report
from orbital_vision_payload.model import CentroidImageClassifier, KNearestImageClassifier, load_image_model
from orbital_vision_payload.priority import MISSION_PROFILE_WEIGHTS, score_prediction
from orbital_vision_payload.stac import DEFAULT_COLLECTION, search_sentinel2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="orbital-vision-payload")
    subparsers = parser.add_subparsers(dest="command", required=True)

    download_parser = subparsers.add_parser("download-eurosat", help="download and extract public EuroSAT RGB data")
    download_parser.add_argument("--data-dir", type=Path, default=Path("data/eurosat"))
    download_parser.add_argument("--force", action="store_true")

    index_parser = subparsers.add_parser("index-eurosat", help="write a manifest of EuroSAT image records")
    index_parser.add_argument("--data-dir", type=Path, default=Path("data/eurosat"))
    index_parser.add_argument("--manifest", type=Path, default=Path("data/eurosat/manifest.json"))
    index_parser.add_argument("--max-per-class", type=int)

    train_parser = subparsers.add_parser("train", help="train an edge classifier on EuroSAT RGB")
    train_parser.add_argument("--data-dir", type=Path, default=Path("data/eurosat"))
    train_parser.add_argument("--model-type", choices=("knn", "centroid"), default="knn")
    train_parser.add_argument("--neighbors", type=int, default=5)
    train_parser.add_argument("--samples-per-class", type=int, default=180)
    train_parser.add_argument("--train-fraction", type=float, default=0.8)
    train_parser.add_argument("--model-out", type=Path, default=Path("artifacts/orbital_knn.json"))
    train_parser.add_argument("--seed", type=int, default=7)

    infer_parser = subparsers.add_parser("infer-path", help="classify one satellite image and score downlink priority")
    infer_parser.add_argument("--model", type=Path, required=True)
    infer_parser.add_argument("--image", type=Path, required=True)
    _add_priority_args(infer_parser)

    benchmark_parser = subparsers.add_parser("benchmark", help="benchmark classifier latency on EuroSAT records")
    benchmark_parser.add_argument("--model", type=Path, required=True)
    benchmark_parser.add_argument("--data-dir", type=Path, default=Path("data/eurosat"))
    benchmark_parser.add_argument("--samples", type=int, default=600)

    evaluate_parser = subparsers.add_parser("evaluate", help="write EuroSAT evaluation report JSON")
    evaluate_parser.add_argument("--model", type=Path, required=True)
    evaluate_parser.add_argument("--data-dir", type=Path, default=Path("data/eurosat"))
    evaluate_parser.add_argument("--samples-per-class", type=int, default=200)
    evaluate_parser.add_argument("--out", type=Path, default=Path("reports/eurosat_centroid_eval.json"))
    _add_priority_args(evaluate_parser)

    stac_parser = subparsers.add_parser("discover-stac", help="search public Sentinel-2 scenes through Earth Search STAC")
    stac_parser.add_argument("--bbox", required=True, help="min_lon,min_lat,max_lon,max_lat")
    stac_parser.add_argument("--datetime", required=True, help="STAC datetime range, e.g. 2025-06-01/2025-06-30")
    stac_parser.add_argument("--max-cloud-cover", type=float, default=20.0)
    stac_parser.add_argument("--limit", type=int, default=10)
    stac_parser.add_argument("--collection", default=DEFAULT_COLLECTION)

    args = parser.parse_args(argv)
    if args.command == "download-eurosat":
        return _download_eurosat(args)
    if args.command == "index-eurosat":
        return _index_eurosat(args)
    if args.command == "train":
        return _train(args)
    if args.command == "infer-path":
        return _infer_path(args)
    if args.command == "benchmark":
        return _benchmark(args)
    if args.command == "evaluate":
        return _evaluate(args)
    if args.command == "discover-stac":
        return _discover_stac(args)
    raise AssertionError("unreachable")


def _add_priority_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--mission-profile", choices=sorted(MISSION_PROFILE_WEIGHTS), default="disaster_response")
    parser.add_argument("--threshold", type=float, default=0.62)


def _download_eurosat(args: argparse.Namespace) -> int:
    root = download_eurosat_rgb(args.data_dir, force=args.force)
    records = index_eurosat(args.data_dir)
    print(f"dataset_root: {root}")
    print(json.dumps(dataset_summary(records), indent=2, sort_keys=True))
    return 0


def _index_eurosat(args: argparse.Namespace) -> int:
    records = index_eurosat(args.data_dir, max_per_class=args.max_per_class)
    manifest = write_manifest(records, args.manifest)
    print(f"saved manifest: {args.manifest}")
    print(json.dumps(manifest["summary"], indent=2, sort_keys=True))
    return 0


def _train(args: argparse.Namespace) -> int:
    records = index_eurosat(args.data_dir, max_per_class=args.samples_per_class)
    train_records, test_records = split_records(records, train_fraction=args.train_fraction, seed=args.seed)
    if args.model_type == "centroid":
        model = CentroidImageClassifier.train(train_records)
    else:
        model = KNearestImageClassifier.train(train_records, neighbors=args.neighbors)
    model.save(args.model_out)
    report = write_evaluation_report(model, test_records, args.model_out.with_suffix(".eval.json"))
    print(f"saved model: {args.model_out}")
    print(f"training_records: {len(train_records)}")
    print(f"validation_records: {len(test_records)}")
    print(json.dumps(_summary(report), indent=2, sort_keys=True))
    return 0


def _infer_path(args: argparse.Namespace) -> int:
    model = load_image_model(args.model)
    prediction = model.predict_path(args.image)
    priority = score_prediction(prediction, mission_profile=args.mission_profile, threshold=args.threshold)
    print(json.dumps({"prediction": prediction.to_dict(), "priority": priority.to_dict()}, indent=2, sort_keys=True))
    return 0


def _benchmark(args: argparse.Namespace) -> int:
    model = load_image_model(args.model)
    records = index_eurosat(args.data_dir)
    records = records[: args.samples]
    latencies: list[float] = []
    correct = 0
    for record in records:
        started = time.perf_counter()
        prediction = model.predict_path(record.to_path())
        latencies.append((time.perf_counter() - started) * 1000.0)
        correct += int(prediction.label == record.label)
    print(f"samples: {len(records)}")
    print(f"accuracy: {correct / len(records):.4f}")
    print(f"latency_ms_p50: {statistics.median(latencies):.4f}")
    print(f"latency_ms_p95: {_percentile(latencies, 95):.4f}")
    print(f"latency_ms_max: {max(latencies):.4f}")
    return 0


def _evaluate(args: argparse.Namespace) -> int:
    model = load_image_model(args.model)
    records = index_eurosat(args.data_dir, max_per_class=args.samples_per_class)
    report = write_evaluation_report(
        model,
        records,
        args.out,
        mission_profile=args.mission_profile,
        threshold=args.threshold,
    )
    print(f"saved report: {args.out}")
    print(json.dumps(_summary(report), indent=2, sort_keys=True))
    return 0


def _discover_stac(args: argparse.Namespace) -> int:
    scenes = search_sentinel2(
        bbox=_parse_bbox(args.bbox),
        datetime_range=args.datetime,
        max_cloud_cover=args.max_cloud_cover,
        limit=args.limit,
        collection=args.collection,
    )
    print(json.dumps([scene.to_dict() for scene in scenes], indent=2, sort_keys=True))
    return 0


def _parse_bbox(value: str) -> list[float]:
    parts = [float(part.strip()) for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox must contain four comma-separated numbers")
    min_lon, min_lat, max_lon, max_lat = parts
    if min_lon >= max_lon or min_lat >= max_lat:
        raise argparse.ArgumentTypeError("bbox must be min_lon,min_lat,max_lon,max_lat")
    return parts


def _summary(report: dict[str, object]) -> dict[str, object]:
    return {
        "model_type": report.get("model_type"),
        "mission_profile": report.get("mission_profile"),
        "accuracy": report.get("accuracy"),
        "downlink_rate": report.get("downlink_rate"),
        "latency_ms_p50": report.get("latency_ms_p50"),
        "latency_ms_p95": report.get("latency_ms_p95"),
    }


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    idx = min(len(ordered) - 1, round((percentile / 100.0) * (len(ordered) - 1)))
    return ordered[idx]


if __name__ == "__main__":
    raise SystemExit(main())
