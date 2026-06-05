from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from rf_edge_sentinel.api import create_app
from rf_edge_sentinel.cnn import SmallSpectrogramCnn, train_spectrogram_cnn
from rf_edge_sentinel.evaluation import write_evaluation_report
from rf_edge_sentinel.model import EdgeKnnModel, train_edge_model
from rf_edge_sentinel.quantization import quantize_onnx_model
from rf_edge_sentinel.runtime import load_detector_model, optional_runtime_status, runtime_comparison
from rf_edge_sentinel.scenarios import SCENARIOS
from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig
from rf_edge_sentinel.stream import run_synthetic_stream


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="rf-edge-sentinel")
    subparsers = parser.add_subparsers(dest="command", required=True)

    train_parser = subparsers.add_parser("train", help="train the spectrogram CNN model")
    train_parser.add_argument("--samples-per-class", type=int, default=160)
    train_parser.add_argument("--model-out", type=Path, default=Path("artifacts/rf_spectrogram_cnn.json"))
    train_parser.add_argument("--seed", type=int, default=7)
    _add_signal_args(train_parser)

    train_knn_parser = subparsers.add_parser("train-knn", help="train the legacy feature/KNN baseline")
    train_knn_parser.add_argument("--samples-per-class", type=int, default=160)
    train_knn_parser.add_argument("--model-out", type=Path, default=Path("artifacts/rf_edge_knn.json"))
    train_knn_parser.add_argument("--seed", type=int, default=7)
    _add_signal_args(train_knn_parser)

    infer_parser = subparsers.add_parser("infer", help="run synthetic streaming inference")
    infer_parser.add_argument("--model", type=Path, required=True)
    infer_parser.add_argument("--windows", type=int, default=10)
    infer_parser.add_argument("--seed", type=int, default=11)
    infer_parser.add_argument("--jsonl", type=Path)
    infer_parser.add_argument("--scenario", choices=SCENARIOS, default="nominal")
    _add_signal_args(infer_parser)

    benchmark_parser = subparsers.add_parser("benchmark", help="benchmark synthetic inference latency")
    benchmark_parser.add_argument("--model", type=Path, required=True)
    benchmark_parser.add_argument("--windows", type=int, default=200)
    benchmark_parser.add_argument("--seed", type=int, default=13)
    benchmark_parser.add_argument("--scenario", choices=SCENARIOS, default="nominal")
    _add_signal_args(benchmark_parser)

    export_parser = subparsers.add_parser("export-onnx", help="export a CNN model to ONNX")
    export_parser.add_argument("--model", type=Path, required=True)
    export_parser.add_argument("--onnx-out", type=Path, default=Path("artifacts/rf_spectrogram_cnn.onnx"))

    quantize_parser = subparsers.add_parser("quantize-onnx", help="post-training quantize an ONNX CNN model")
    quantize_parser.add_argument("--model", type=Path, required=True)
    quantize_parser.add_argument("--onnx", type=Path, required=True)
    quantize_parser.add_argument("--quantized-out", type=Path, default=Path("artifacts/rf_spectrogram_cnn.int8.onnx"))
    quantize_parser.add_argument("--manifest-out", type=Path)
    quantize_parser.add_argument("--calibration-samples", type=int, default=192)
    quantize_parser.add_argument("--seed", type=int, default=101)
    quantize_parser.add_argument("--scenarios", nargs="+", choices=SCENARIOS, default=list(SCENARIOS))
    _add_signal_args(quantize_parser)

    runtime_parser = subparsers.add_parser("benchmark-runtimes", help="compare Python, ONNX Runtime, and TensorRT")
    runtime_parser.add_argument("--model", type=Path, required=True)
    runtime_parser.add_argument("--onnx", type=Path)
    runtime_parser.add_argument("--windows", type=int, default=200)
    runtime_parser.add_argument("--seed", type=int, default=17)
    runtime_parser.add_argument("--scenario", choices=SCENARIOS, default="nominal")
    _add_signal_args(runtime_parser)

    serve_parser = subparsers.add_parser("serve", help="start the FastAPI event stream and dashboard")
    serve_parser.add_argument("--model", type=Path, required=True)
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8000)
    serve_parser.add_argument("--seed", type=int, default=23)
    serve_parser.add_argument("--scenario", choices=SCENARIOS, default="nominal")
    _add_signal_args(serve_parser)

    evaluate_parser = subparsers.add_parser("evaluate", help="write scenario and runtime evaluation report JSON")
    evaluate_parser.add_argument("--model", type=Path, required=True)
    evaluate_parser.add_argument("--out", type=Path, default=Path("reports/rf_spectrogram_cnn_eval.json"))
    evaluate_parser.add_argument("--windows-per-scenario", type=int, default=160)
    evaluate_parser.add_argument("--seed", type=int, default=303)
    evaluate_parser.add_argument("--onnx", type=Path)
    evaluate_parser.add_argument("--quantized-onnx", type=Path)
    _add_signal_args(evaluate_parser)

    subparsers.add_parser("runtime-status", help="show optional runtime availability")

    args = parser.parse_args(argv)
    if args.command == "runtime-status":
        print(json.dumps(optional_runtime_status(), indent=2, sort_keys=True))
        return 0
    if args.command == "export-onnx":
        return _export_onnx(args)

    config = _config_from_args(args)

    if args.command == "train":
        return _train_cnn(args, config)
    if args.command == "train-knn":
        return _train_knn(args, config)
    if args.command == "infer":
        return _infer(args, config)
    if args.command == "benchmark":
        return _benchmark(args, config)
    if args.command == "benchmark-runtimes":
        return _benchmark_runtimes(args, config)
    if args.command == "quantize-onnx":
        return _quantize_onnx(args, config)
    if args.command == "evaluate":
        return _evaluate(args, config)
    if args.command == "serve":
        return _serve(args, config)
    raise AssertionError("unreachable")


def _add_signal_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--sample-rate-hz", type=float, default=1_000_000.0)
    parser.add_argument("--window-size", type=int, default=4096)
    parser.add_argument("--samples-per-symbol", type=int, default=8)


def _config_from_args(args: argparse.Namespace) -> SignalConfig:
    return SignalConfig(
        sample_rate_hz=args.sample_rate_hz,
        window_size=args.window_size,
        samples_per_symbol=args.samples_per_symbol,
    )


def _train_cnn(args: argparse.Namespace, config: SignalConfig) -> int:
    model = train_spectrogram_cnn(
        samples_per_class=args.samples_per_class,
        signal_config=config,
        seed=args.seed,
        labels=SIGNAL_LABELS,
    )
    model.save(args.model_out)
    print(f"saved model: {args.model_out}")
    print("model_type: spectrogram_cnn")
    print(f"labels: {', '.join(model.labels)}")
    print(f"anomaly_threshold: {model.anomaly_threshold:.3f}")
    return 0


def _train_knn(args: argparse.Namespace, config: SignalConfig) -> int:
    model = train_edge_model(
        samples_per_class=args.samples_per_class,
        config=config,
        seed=args.seed,
        labels=SIGNAL_LABELS,
    )
    model.save(args.model_out)
    print(f"saved model: {args.model_out}")
    print("model_type: edge_knn")
    print(f"labels: {', '.join(model.labels)}")
    print(f"anomaly_threshold: {model.anomaly_threshold:.3f}")
    return 0


def _infer(args: argparse.Namespace, config: SignalConfig) -> int:
    model = load_detector_model(args.model)
    events = run_synthetic_stream(model, config=config, windows=args.windows, seed=args.seed, scenario=args.scenario)
    lines = [json.dumps(event.to_dict(), sort_keys=True) for event in events]
    for line in lines:
        print(line)
    if args.jsonl:
        args.jsonl.parent.mkdir(parents=True, exist_ok=True)
        args.jsonl.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


def _benchmark(args: argparse.Namespace, config: SignalConfig) -> int:
    model = load_detector_model(args.model)
    events = run_synthetic_stream(model, config=config, windows=args.windows, seed=args.seed, scenario=args.scenario)
    latencies = [event.latency_ms for event in events]
    accuracy = sum(event.predicted_label == event.expected_label for event in events) / len(events)
    print(f"windows: {len(events)}")
    print(f"accuracy_synthetic: {accuracy:.3f}")
    print(f"latency_ms_p50: {statistics.median(latencies):.3f}")
    print(f"latency_ms_p95: {_percentile(latencies, 95):.3f}")
    print(f"latency_ms_max: {max(latencies):.3f}")
    return 0


def _export_onnx(args: argparse.Namespace) -> int:
    model = load_detector_model(args.model)
    if not isinstance(model, SmallSpectrogramCnn):
        print("ONNX export is currently implemented for spectrogram_cnn models only")
        return 2
    try:
        model.export_onnx(args.onnx_out)
    except RuntimeError as exc:
        print(str(exc))
        print("Install optional runtime packages: pip install onnx onnxruntime")
        return 2
    print(f"saved ONNX: {args.onnx_out}")
    return 0


def _benchmark_runtimes(args: argparse.Namespace, config: SignalConfig) -> int:
    model = load_detector_model(args.model)
    results = runtime_comparison(
        model,
        config=config,
        windows=args.windows,
        seed=args.seed,
        onnx_path=args.onnx,
        scenario=args.scenario,
    )
    print(json.dumps(results, indent=2, sort_keys=True))
    return 0


def _quantize_onnx(args: argparse.Namespace, config: SignalConfig) -> int:
    model = load_detector_model(args.model)
    if not isinstance(model, SmallSpectrogramCnn):
        print("ONNX quantization is currently implemented for spectrogram_cnn models only")
        return 2
    try:
        report = quantize_onnx_model(
            model=model,
            input_onnx=args.onnx,
            output_onnx=args.quantized_out,
            config=config,
            calibration_samples=args.calibration_samples,
            seed=args.seed,
            scenarios=args.scenarios,
            manifest_out=args.manifest_out,
        )
    except RuntimeError as exc:
        print(str(exc))
        print("Install optional runtime packages: pip install onnx onnxruntime sympy")
        return 2
    print(json.dumps(report.__dict__, indent=2, sort_keys=True))
    return 0


def _evaluate(args: argparse.Namespace, config: SignalConfig) -> int:
    model = load_detector_model(args.model)
    report = write_evaluation_report(
        model=model,
        config=config,
        out_path=args.out,
        windows_per_scenario=args.windows_per_scenario,
        seed=args.seed,
        onnx_path=args.onnx,
        quantized_onnx_path=args.quantized_onnx,
    )
    print(f"saved report: {args.out}")
    print(json.dumps(_evaluation_summary(report), indent=2, sort_keys=True))
    return 0


def _serve(args: argparse.Namespace, config: SignalConfig) -> int:
    try:
        import uvicorn
    except ImportError:
        print("FastAPI serving requires uvicorn. Install it with: pip install uvicorn")
        return 2

    app = create_app(args.model, signal_config=config, seed=args.seed, scenario=args.scenario)
    uvicorn.run(app, host=args.host, port=args.port)
    return 0


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise ValueError("values cannot be empty")
    idx = min(len(ordered) - 1, round((percentile / 100.0) * (len(ordered) - 1)))
    return ordered[idx]


def _evaluation_summary(report: dict[str, object]) -> dict[str, object]:
    metrics = report["scenario_metrics"]
    if not isinstance(metrics, list):
        return {"scenario_metrics": metrics}
    return {
        "model_type": report.get("model_type"),
        "scenarios": [
            {
                "scenario": item["scenario"],
                "accuracy": item["accuracy"],
                "anomaly_rate": item["anomaly_rate"],
                "mean_confidence": item["mean_confidence"],
            }
            for item in metrics
            if isinstance(item, dict)
        ],
    }


if __name__ == "__main__":
    raise SystemExit(main())
