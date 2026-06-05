# Dataset Card: Synthetic RF Windows

## Dataset Summary

This dataset is generated on demand by `rf_edge_sentinel.signals` and `rf_edge_sentinel.scenarios`. It contains synthetic complex-baseband I/Q windows for RF signal-awareness development.

Supported labels:

- `bpsk`
- `qpsk`
- `fsk`
- `ofdm`
- `fm`
- `noise`

## Data Source

All data in this version is synthetic. No SDR, satellite, tactical, or private communications recordings are included.

The generator produces baseband windows using randomized modulation parameters, SNR ranges, carrier offsets, phase rotation, gain variation, optional fading, packet dropouts, clock drift, and confidence-drift scenarios.

## Intended Use

Use this dataset for:

- RF ML software pipeline development.
- Edge inference benchmarking.
- ONNX export and runtime comparison.
- Scenario regression tests.
- Portfolio demonstration of RF edge AI engineering.

Do not use this dataset to claim real-world RF performance.

## Generation Configuration

Default signal configuration:

| Field | Value |
| --- | ---: |
| Sample rate | 1,000,000 Hz |
| Window size | 4,096 samples |
| Samples per symbol | 8 |
| SNR range | 6 to 24 dB |
| Max carrier offset | 80,000 Hz |

Scenario profiles:

| Scenario | Purpose |
| --- | --- |
| `nominal` | Clean synthetic operating condition. |
| `degraded_comms` | Low SNR, wider carrier offset, and packet dropouts. |
| `bad_clock` | Larger carrier offset and sample-clock drift. |
| `confidence_drift` | Progressive SNR degradation over time. |

## Known Gaps

- No real RF front-end effects from SDR hardware.
- No antenna, LNA, mixer, ADC, or AGC model.
- No multipath, terrain, atmospheric, or orbital dynamics.
- No real interference environment.
- No dataset split registry or immutable sample manifests yet.

## Data Governance

The dataset is safe to generate and share because it is synthetic. If real receive-only data is added later, the project should add:

- Capture source and authorization.
- Frequency band and local legal constraints.
- Retention rules.
- Labeling method.
- Exclusion of protected, private, or decoded communications.

## Reproduction

Example commands:

```powershell
$env:PYTHONPATH="src"
python -m rf_edge_sentinel train --samples-per-class 240 --model-out artifacts\rf_spectrogram_cnn.json
python -m rf_edge_sentinel evaluate --model artifacts\rf_spectrogram_cnn.json --out reports\rf_spectrogram_cnn_eval.json --windows-per-scenario 160
```

