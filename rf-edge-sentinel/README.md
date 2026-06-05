# RF Edge Sentinel

Receive-only RF signal classification and edge inference experiments.

The project uses synthetic complex I/Q windows for now, so it can run without SDR hardware. It trains a small RF spectrogram CNN, exports it to ONNX, benchmarks runtime latency, and streams detections through a small FastAPI dashboard.

## Scope

This is receive-only work.

- No RF transmission
- No jamming, spoofing, or interference generation
- No weapon guidance or engagement logic
- No unauthorized decoding of protected communications

If real RF captures are added later, they should come from lawful lab, public, or otherwise authorized receive-only sources.

## What Is In Here

- Synthetic I/Q generation for `bpsk`, `qpsk`, `fsk`, `ofdm`, `fm`, and `noise`
- RF spectrogram tensor generation
- Small CNN classifier
- Older feature/KNN baseline
- ONNX export
- ONNX Runtime and TensorRT availability benchmarking
- Synthetic stress scenarios: `nominal`, `degraded_comms`, `bad_clock`, `confidence_drift`
- FastAPI event stream and browser dashboard
- Post-training ONNX quantization experiment
- Model card, dataset card, quantization report, and evaluation report

## Install

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
```

For ONNX export, ONNX Runtime, and quantization:

```powershell
pip install -e ".[onnx]"
```

On Windows, ONNX can hit path-length issues in the user site. A short target path avoids that:

```powershell
python -m pip install --target C:\onnxdeps --upgrade onnx onnxruntime sympy
$env:PYTHONPATH="C:\onnxdeps;src"
```

## Train And Run

```powershell
python -m rf_edge_sentinel train --samples-per-class 240 --model-out artifacts\rf_spectrogram_cnn.json
python -m rf_edge_sentinel infer --model artifacts\rf_spectrogram_cnn.json --windows 8
python -m rf_edge_sentinel benchmark --model artifacts\rf_spectrogram_cnn.json --windows 200
```

Run a stress scenario:

```powershell
python -m rf_edge_sentinel benchmark --model artifacts\rf_spectrogram_cnn.json --scenario degraded_comms --windows 200
```

## ONNX

```powershell
python -m rf_edge_sentinel export-onnx --model artifacts\rf_spectrogram_cnn.json --onnx-out artifacts\rf_spectrogram_cnn.onnx
python -m rf_edge_sentinel benchmark-runtimes --model artifacts\rf_spectrogram_cnn.json --onnx artifacts\rf_spectrogram_cnn.onnx --windows 300
```

Recent nominal benchmark:

```text
Python NumPy:
accuracy: 0.8667
p50 latency: 5.3806 ms
p95 latency: 14.8904 ms

ONNX Runtime CPU:
accuracy: 0.8667
p50 latency: 0.2908 ms
p95 latency: 0.4034 ms

TensorRT:
not available on this machine
```

## Quantization

```powershell
python -m rf_edge_sentinel quantize-onnx --model artifacts\rf_spectrogram_cnn.json --onnx artifacts\rf_spectrogram_cnn.onnx --quantized-out artifacts\rf_spectrogram_cnn.int8.onnx --calibration-samples 240
python -m rf_edge_sentinel evaluate --model artifacts\rf_spectrogram_cnn.json --onnx artifacts\rf_spectrogram_cnn.onnx --quantized-onnx artifacts\rf_spectrogram_cnn.int8.onnx --out reports\rf_spectrogram_cnn_eval.json --windows-per-scenario 160
```

Current result: FP32 ONNX is the usable artifact. INT8 QDQ reduced file size but broke accuracy.

```text
FP32 ONNX:
accuracy: 0.8625
size: 152,465 bytes

INT8 QDQ ONNX:
accuracy: 0.2625
size: 42,080 bytes
```

See:

- `docs/model-card.md`
- `docs/dataset-card.md`
- `docs/quantization-report.md`
- `reports/rf_spectrogram_cnn_eval.json`

## Dashboard

```powershell
python -m rf_edge_sentinel serve --model artifacts\rf_spectrogram_cnn.json --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000/
```

Endpoints:

- `GET /health`
- `GET /api/events?windows=20&scenario_name=degraded_comms`
- `GET /stream?scenario_name=bad_clock&interval_ms=500`

## Tests

```powershell
python -m unittest discover -s .\tests
```

With ONNX installed in `C:\onnxdeps`:

```powershell
$env:PYTHONPATH="C:\onnxdeps;src"
python -m unittest discover -s .\tests
```

## Notes

The model is trained only on synthetic data. The degraded scenarios are intentionally difficult and expose current weaknesses under low SNR, dropouts, clock drift, and confidence drift.

Next useful work:

- Train a learnable PyTorch CNN and compare against the current fixed-filter CNN
- Add calibration metrics
- Revisit INT8 with quantization-aware training
- Add latency histograms and anomaly timelines to the dashboard
- Add real receive-only SDR ingestion when hardware is available

