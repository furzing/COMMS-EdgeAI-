# Model Card: EuroSAT RGB Edge Classifiers

## Model

- Default type: k-nearest-neighbor classifier over handcrafted RGB image features
- Comparison type: centroid classifier over the same features
- Input: 64x64 RGB satellite chip
- Output: EuroSAT land-cover label, confidence, and mission-specific downlink priority score
- Artifact: JSON

## Intended Use

The model is an edge-friendly baseline for deciding whether a satellite image chip is likely worth downlinking under a mission profile such as disaster response, agriculture, wildfire watch, maritime monitoring, or infrastructure monitoring.

The priority score is a triage signal, not an operational decision.

## Training Data

The intended training data is EuroSAT RGB from Zenodo. The project includes a downloader and indexer, but the dataset itself is not committed to the repository.

## Features

The model uses simple image statistics:

- RGB mean and standard deviation
- Luma percentiles
- Color dominance fractions
- Four-bin channel histograms
- Lightweight edge magnitude statistics

These features are cheap to compute and useful as a transparent baseline, but they are weaker than a trained CNN or multispectral model. The kNN model is more accurate than the centroid model on sampled real EuroSAT RGB data, while the centroid model remains useful as a compact comparison baseline.

## Evaluation

Use:

```powershell
python -m orbital_vision_payload evaluate --model artifacts\orbital_knn.json --data-dir data\eurosat --samples-per-class 200 --out reports\eurosat_knn_eval.json
```

Report fields include accuracy, latency percentiles, mean confidence, downlink rate, and per-label metrics.

When using the same leading per-class samples for training and evaluation, prefer the held-out validation report written by the `train` command. A standalone report over the same records can overstate accuracy because kNN stores training examples.

## Current Real-Data Smoke Result

Configuration:

- Dataset: EuroSAT RGB
- Samples: 120 per class
- Split: 80% train, 20% held-out validation
- Model: `knn_rgb_features`, k=5

Held-out validation:

- Accuracy: 0.6708
- P50 latency: 4.90 ms including image load and feature extraction
- P95 latency: 10.16 ms including image load and feature extraction
- Stronger classes: Forest, Industrial, Pasture, SeaLake
- Weaker classes: Highway, AnnualCrop, River, HerbaceousVegetation

## Limitations

- Does not detect wildfire, flood, or scene change directly.
- Does not use multispectral bands yet.
- Confidence is distance-derived and should be calibrated before operational use.
- Mission-profile weights are policy defaults and should be reviewed per mission.

## Next Model Work

- Add multispectral support using EuroSAT MS and Sentinel-2 COG chips.
- Train a small quantized CNN once ingestion is stable.
- Add explicit event datasets for flood, wildfire, cloud, and change labels.
- Calibrate confidence and priority thresholds against mission costs.
