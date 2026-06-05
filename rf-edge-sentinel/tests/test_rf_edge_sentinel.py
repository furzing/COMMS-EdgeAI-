from __future__ import annotations

import sys
import tempfile
import unittest
import importlib.util
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from rf_edge_sentinel.cnn import SmallSpectrogramCnn, train_spectrogram_cnn
from rf_edge_sentinel.evaluation import evaluate_model, write_evaluation_report
from rf_edge_sentinel.features import extract_features, feature_dim
from rf_edge_sentinel.model import EdgeKnnModel, train_edge_model
from rf_edge_sentinel.quantization import quantize_onnx_model
from rf_edge_sentinel.public_data import (
    evaluate_real_iq_file,
    list_public_iq_recordings,
    read_c16le_iq,
)
from rf_edge_sentinel.scenarios import (
    ConfidenceDriftMonitor,
    apply_clock_drift,
    apply_packet_dropouts,
    iter_scenario_windows,
)
from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig, generate_iq
from rf_edge_sentinel.spectrogram import iq_to_spectrogram_tensor, spectrogram_shape
from rf_edge_sentinel.stream import run_synthetic_stream


class RfEdgeSentinelTests(unittest.TestCase):
    def test_signal_generation_returns_complex_windows(self) -> None:
        config = SignalConfig(window_size=1024)
        rng = np.random.default_rng(123)

        for label in SIGNAL_LABELS:
            with self.subTest(label=label):
                iq = generate_iq(label, config, rng)
                self.assertEqual(iq.shape, (1024,))
                self.assertTrue(np.iscomplexobj(iq))
                self.assertTrue(np.all(np.isfinite(iq.real)))
                self.assertTrue(np.all(np.isfinite(iq.imag)))

    def test_feature_dimension_is_stable(self) -> None:
        config = SignalConfig(window_size=1024)
        rng = np.random.default_rng(456)
        iq = generate_iq("qpsk", config, rng)

        features = extract_features(iq, config.sample_rate_hz)

        self.assertEqual(features.shape, (feature_dim(),))
        self.assertTrue(np.all(np.isfinite(features)))

    def test_model_save_load_and_stream(self) -> None:
        config = SignalConfig(window_size=1024, snr_db_min=18.0, snr_db_max=28.0)
        model = train_edge_model(samples_per_class=16, config=config, seed=789)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "model.json"
            model.save(path)
            loaded = EdgeKnnModel.load(path)

        events = run_synthetic_stream(loaded, config=config, windows=12, seed=321)

        self.assertEqual(len(events), 12)
        self.assertTrue(all(event.latency_ms >= 0.0 for event in events))
        self.assertTrue(all(event.predicted_label in SIGNAL_LABELS for event in events))

    def test_spectrogram_tensor_shape_is_stable(self) -> None:
        config = SignalConfig(window_size=1024)
        rng = np.random.default_rng(42)
        iq = generate_iq("ofdm", config, rng)

        tensor = iq_to_spectrogram_tensor(iq, config)

        self.assertEqual(tensor.shape, spectrogram_shape())
        self.assertTrue(np.all(np.isfinite(tensor)))

    def test_cnn_save_load_and_stream(self) -> None:
        config = SignalConfig(window_size=1024, snr_db_min=14.0, snr_db_max=24.0)
        model = train_spectrogram_cnn(samples_per_class=4, signal_config=config, seed=99)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "cnn.json"
            model.save(path)
            loaded = SmallSpectrogramCnn.load(path)

        events = run_synthetic_stream(loaded, config=config, windows=6, seed=654)

        self.assertEqual(len(events), 6)
        self.assertTrue(all(event.predicted_label in SIGNAL_LABELS for event in events))
        self.assertTrue(all(0.0 <= event.confidence <= 1.0 for event in events))

    def test_degraded_comms_dropout_preserves_iq_shape(self) -> None:
        config = SignalConfig(window_size=1024)
        rng = np.random.default_rng(7)
        iq = generate_iq("fsk", config, rng)

        dropped = apply_packet_dropouts(iq, probability=0.5, rng=rng)

        self.assertEqual(dropped.shape, iq.shape)
        self.assertTrue(np.any(dropped == 0.0))
        self.assertTrue(np.all(np.isfinite(dropped.real)))

    def test_bad_clock_drift_preserves_window_size(self) -> None:
        config = SignalConfig(window_size=1024)
        rng = np.random.default_rng(8)
        iq = generate_iq("fm", config, rng)

        drifted = apply_clock_drift(iq, ppm=100.0)

        self.assertEqual(drifted.shape, iq.shape)
        self.assertTrue(np.all(np.isfinite(drifted.imag)))

    def test_confidence_drift_monitor_flags_drop(self) -> None:
        monitor = ConfidenceDriftMonitor(baseline_confidence=0.86, drop_threshold=0.12, min_samples=4)

        result = monitor.evaluate([0.82, 0.74, 0.69, 0.66, 0.62])

        self.assertTrue(result["drift_detected"])
        self.assertGreater(result["confidence_drop"], 0.12)

    def test_scenario_generator_emits_labeled_windows(self) -> None:
        config = SignalConfig(window_size=1024)
        source = iter_scenario_windows("degraded_comms", SIGNAL_LABELS, config, seed=77)

        label, iq, scenario = next(source)

        self.assertIn(label, SIGNAL_LABELS)
        self.assertEqual(scenario, "degraded_comms")
        self.assertEqual(iq.shape, (1024,))

    def test_public_iq_catalog_has_satnogs_sources(self) -> None:
        catalog = list_public_iq_recordings()

        self.assertGreaterEqual(len(catalog), 1)
        self.assertEqual(catalog[0]["dtype"], "c16le")
        self.assertEqual(catalog[0]["license"], "CC-BY-4.0")

    def test_c16le_reader_parses_interleaved_iq(self) -> None:
        values = np.array([32767, 0, 0, -32768], dtype="<i2")

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "sample.raw"
            values.tofile(path)
            iq = read_c16le_iq(path)

        self.assertEqual(iq.shape, (2,))
        self.assertAlmostEqual(float(iq[0].real), 32767 / 32768, places=5)
        self.assertAlmostEqual(float(iq[1].imag), -1.0, places=5)

    def test_real_iq_evaluation_writes_report(self) -> None:
        config = SignalConfig(sample_rate_hz=48_000.0, window_size=1024, snr_db_min=14.0, snr_db_max=24.0)
        model = train_spectrogram_cnn(samples_per_class=4, signal_config=config, seed=88)
        rng = np.random.default_rng(89)
        iq = generate_iq("ofdm", config, rng)
        interleaved = np.column_stack(
            [
                np.clip(iq.real * 32767, -32768, 32767),
                np.clip(iq.imag * 32767, -32768, 32767),
            ]
        ).astype("<i2")

        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = Path(tmpdir) / "model.json"
            raw_path = Path(tmpdir) / "sample.raw"
            report_path = Path(tmpdir) / "real_eval.json"
            model.save(model_path)
            interleaved.tofile(raw_path)
            report = evaluate_real_iq_file(
                model_path=model_path,
                input_path=raw_path,
                output_path=report_path,
                config=config,
                windows=1,
                source_id="test_real_iq",
            )

        self.assertEqual(report["source_id"], "test_real_iq")
        self.assertEqual(report["windows"], 1)
        self.assertEqual(sum(report["prediction_counts"].values()), 1)

    def test_evaluation_report_contains_all_scenarios(self) -> None:
        config = SignalConfig(window_size=1024, snr_db_min=14.0, snr_db_max=24.0)
        model = train_spectrogram_cnn(samples_per_class=4, signal_config=config, seed=91)

        metrics = evaluate_model(model, config=config, windows_per_scenario=3, seed=92)

        self.assertEqual({metric.scenario for metric in metrics}, {"nominal", "degraded_comms", "bad_clock", "confidence_drift"})
        self.assertTrue(all(0.0 <= metric.accuracy <= 1.0 for metric in metrics))

    def test_evaluation_report_writes_json(self) -> None:
        config = SignalConfig(window_size=1024, snr_db_min=14.0, snr_db_max=24.0)
        model = train_spectrogram_cnn(samples_per_class=4, signal_config=config, seed=93)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "eval.json"
            report = write_evaluation_report(model, config, path, windows_per_scenario=2, seed=94)

        self.assertEqual(report["model_type"], "spectrogram_cnn")
        self.assertEqual(len(report["scenario_metrics"]), 4)

    @unittest.skipUnless(importlib.util.find_spec("onnx") and importlib.util.find_spec("onnxruntime"), "ONNX runtime not installed")
    def test_onnx_quantization_smoke(self) -> None:
        try:
            import onnxruntime.quantization  # noqa: F401
        except Exception as exc:
            self.skipTest(f"ONNX quantization unavailable: {exc}")

        config = SignalConfig(window_size=1024, snr_db_min=14.0, snr_db_max=24.0)
        model = train_spectrogram_cnn(samples_per_class=4, signal_config=config, seed=95)

        with tempfile.TemporaryDirectory() as tmpdir:
            onnx_path = Path(tmpdir) / "model.onnx"
            quantized_path = Path(tmpdir) / "model.int8.onnx"
            model.export_onnx(onnx_path)
            report = quantize_onnx_model(
                model=model,
                input_onnx=onnx_path,
                output_onnx=quantized_path,
                config=config,
                calibration_samples=4,
                seed=96,
                scenarios=["nominal"],
            )
            exists = quantized_path.exists()

        self.assertEqual(report.calibration_samples, 4)
        self.assertTrue(exists)


if __name__ == "__main__":
    unittest.main()
