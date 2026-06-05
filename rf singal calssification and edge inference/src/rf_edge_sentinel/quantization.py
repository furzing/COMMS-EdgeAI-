from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import numpy as np

from rf_edge_sentinel.cnn import SmallSpectrogramCnn
from rf_edge_sentinel.scenarios import SCENARIOS, iter_scenario_windows
from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig
from rf_edge_sentinel.spectrogram import iq_to_spectrogram_tensor


@dataclass(frozen=True)
class QuantizationReport:
    input_onnx: str
    output_onnx: str
    calibration_samples: int
    scenarios: list[str]
    activation_type: str
    weight_type: str
    quant_format: str
    manifest_path: str


def quantize_onnx_model(
    model: SmallSpectrogramCnn,
    input_onnx: str | Path,
    output_onnx: str | Path,
    config: SignalConfig,
    calibration_samples: int,
    seed: int,
    scenarios: Iterable[str] = SCENARIOS,
    manifest_out: str | Path | None = None,
) -> QuantizationReport:
    try:
        from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static
    except ImportError as exc:
        raise RuntimeError("ONNX quantization requires onnxruntime[quantization] plus sympy") from exc

    input_onnx = Path(input_onnx)
    output_onnx = Path(output_onnx)
    output_onnx.parent.mkdir(parents=True, exist_ok=True)
    manifest_path = Path(manifest_out) if manifest_out else output_onnx.with_suffix(".calibration.json")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    scenario_list = [scenario for scenario in scenarios if scenario in SCENARIOS]
    if not scenario_list:
        raise ValueError(f"at least one valid scenario is required; expected one of {SCENARIOS}")

    reader = _SyntheticCalibrationReader(
        model=model,
        config=config,
        samples=calibration_samples,
        seed=seed,
        scenarios=scenario_list,
    )
    quantize_static(
        model_input=str(input_onnx),
        model_output=str(output_onnx),
        calibration_data_reader=reader,
        quant_format=QuantFormat.QDQ,
        activation_type=QuantType.QUInt8,
        weight_type=QuantType.QInt8,
        per_channel=True,
        reduce_range=False,
    )

    report = QuantizationReport(
        input_onnx=str(input_onnx),
        output_onnx=str(output_onnx),
        calibration_samples=calibration_samples,
        scenarios=scenario_list,
        activation_type="QUInt8",
        weight_type="QInt8",
        quant_format="QDQ",
        manifest_path=str(manifest_path),
    )
    manifest_path.write_text(json.dumps(asdict(report), indent=2), encoding="utf-8")
    return report


class _SyntheticCalibrationReader:
    def __init__(
        self,
        model: SmallSpectrogramCnn,
        config: SignalConfig,
        samples: int,
        seed: int,
        scenarios: list[str],
    ) -> None:
        self._items = _build_calibration_items(model, config, samples, seed, scenarios)
        self._index = 0

    def get_next(self) -> dict[str, np.ndarray] | None:
        if self._index >= len(self._items):
            return None
        item = self._items[self._index]
        self._index += 1
        return {"input": item}

    def rewind(self) -> None:
        self._index = 0


def _build_calibration_items(
    model: SmallSpectrogramCnn,
    config: SignalConfig,
    samples: int,
    seed: int,
    scenarios: list[str],
) -> list[np.ndarray]:
    if samples <= 0:
        raise ValueError("calibration_samples must be positive")
    per_scenario = max(1, int(np.ceil(samples / len(scenarios))))
    items: list[np.ndarray] = []
    for index, scenario in enumerate(scenarios):
        source = iter_scenario_windows(scenario, SIGNAL_LABELS, config, seed + index * 10_000)
        for _ in range(per_scenario):
            _, iq, _ = next(source)
            tensor = iq_to_spectrogram_tensor(iq, config, model.spectrogram_config)
            items.append(tensor[None, :, :, :].astype(np.float32))
            if len(items) >= samples:
                return items
    return items[:samples]

