# Orbital Vision Payload

Real-data edge vision baseline for satellite payload scene triage.

The project prioritizes published, available satellite data over synthetic generation. The first baseline uses EuroSAT RGB, a public Sentinel-2 land-use and land-cover dataset, plus live Sentinel-2 item discovery through the Earth Search STAC API.

## Scope

This is a perception and downlink-prioritization project.

- No weapon guidance or targeting
- No autonomous engagement logic
- No private or restricted imagery sources
- No claims of operational disaster detection from the first baseline

The current model classifies real Sentinel-2 RGB chips into land-cover classes and scores them for mission-specific downlink value. Flood, wildfire, and change-detection labels should be added only through appropriate public datasets or authorized mission data.

## What Is In Here

- EuroSAT RGB downloader and indexer
- Lightweight image feature extraction for 64x64 RGB satellite chips
- Edge-friendly kNN and centroid classifiers saved as JSON
- Mission profile priority scoring for downlink triage
- Sentinel-2 STAC discovery against Earth Search
- Runtime benchmark and evaluation report writer
- Dataset card and model card
- Unit tests with local image fixtures

## Public Data Sources

- EuroSAT RGB on Zenodo: `https://zenodo.org/records/7711810`
- Sentinel-2 L2A COGs on AWS Open Data: `https://registry.opendata.aws/sentinel-2-l2a-cogs/`
- Earth Search STAC API: `https://earth-search.aws.element84.com/v1`

## Install

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
```

## Get Real Data

Download and extract EuroSAT RGB:

```powershell
python -m orbital_vision_payload download-eurosat --data-dir data\eurosat
```

Index a small subset for a fast first run:

```powershell
python -m orbital_vision_payload index-eurosat --data-dir data\eurosat --manifest data\eurosat\manifest.json --max-per-class 120
```

## Train And Run

```powershell
python -m orbital_vision_payload train --data-dir data\eurosat --samples-per-class 180 --model-out artifacts\orbital_knn.json
python -m orbital_vision_payload infer-path --model artifacts\orbital_knn.json --image data\eurosat\EuroSAT_RGB\Forest\Forest_1.jpg --mission-profile wildfire_watch
python -m orbital_vision_payload benchmark --model artifacts\orbital_knn.json --data-dir data\eurosat --samples 600
```

Write an evaluation report:

```powershell
python -m orbital_vision_payload evaluate --model artifacts\orbital_knn.json --data-dir data\eurosat --samples-per-class 200 --out reports\eurosat_knn_eval.json
```

The `train` command also writes a held-out validation report next to the model artifact. Prefer that report for fair first-pass model quality when evaluating the same subset used for training.

## Discover Sentinel-2 Scenes

Search public Sentinel-2 items before downloading any imagery:

```powershell
python -m orbital_vision_payload discover-stac --bbox "35.7,31.8,36.1,32.2" --datetime "2025-06-01/2025-06-30" --max-cloud-cover 20 --limit 5
```

The command returns item IDs, cloud cover, acquisition time, and available COG asset links. This keeps the first workflow bandwidth-conscious.

## Mission Profiles

Priority scoring is available for:

- `disaster_response`
- `agriculture`
- `wildfire_watch`
- `maritime`
- `infrastructure`

Scores are triage aids, not mission decisions. Downlink thresholds should be calibrated against the mission's actual false-positive and false-negative costs.

## Tests

```powershell
python -m unittest discover -s .\tests
```

## Notes

Next useful work:

- Add a public flood dataset adapter such as Sen1Floods11
- Add a public wildfire or active-fire labeling source
- Add multispectral EuroSAT support for NDVI/NDWI/NBR features
- Add COG chip reading with rasterio for Sentinel-2 assets returned by STAC
- Add quantized neural baseline once the data pipeline is stable
