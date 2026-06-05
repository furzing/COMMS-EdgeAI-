# Quantization Report

## Objective

Evaluate whether the RF Spectrogram CNN should be deployed as an INT8 ONNX model for edge inference.

## Method

1. Export the CNN to FP32 ONNX.
2. Calibrate post-training static quantization with 240 synthetic windows.
3. Include all synthetic scenarios during calibration:
   - `nominal`
   - `degraded_comms`
   - `bad_clock`
   - `confidence_drift`
4. Quantize using ONNX Runtime static QDQ quantization:
   - Activation type: `QUInt8`
   - Weight type: `QInt8`
   - Per-channel weights: enabled
5. Benchmark FP32 ONNX and INT8 ONNX using the same nominal synthetic stream.

## Results

| Artifact | Size | Accuracy | p50 Latency | p95 Latency |
| --- | ---: | ---: | ---: | ---: |
| FP32 ONNX | 152,465 bytes | 0.8625 | 0.1971 ms | 0.3242 ms |
| INT8 QDQ ONNX | 42,080 bytes | 0.2625 | 0.2088 ms | 0.2957 ms |

## Decision

Reject INT8 QDQ for the current model.

Reason: the quantized artifact is smaller, but the accuracy regression is unacceptable. The FP32 ONNX model is already very small and fast on CPU, so the current INT8 path does not justify deployment.

## Engineering Interpretation

This is not a failure of the project; it is a useful deployment decision. Quantization is only valuable when the model, calibration data, and runtime preserve mission-relevant behavior. The current architecture has a large dense head over normalized handcrafted RF image features, which appears sensitive to quantization.

## Next Quantization Work

1. Train a fully learnable CNN with a smaller dense head.
2. Use quantization-aware training.
3. Add calibration diagnostics for tensor ranges.
4. Benchmark on target hardware instead of only desktop CPU.
5. Consider FP16 or TensorRT when an NVIDIA edge device is available.

