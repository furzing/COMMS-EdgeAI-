# Dataset Card: Orbital Vision Payload

## Dataset Sources

The default baseline uses published real satellite data.

### EuroSAT RGB

- Source: https://zenodo.org/records/7711810
- DOI: 10.5281/zenodo.7711810
- Sensor: Sentinel-2
- Size: 27,000 labeled 64x64 RGB image chips
- Classes: AnnualCrop, Forest, HerbaceousVegetation, Highway, Industrial, Pasture, PermanentCrop, Residential, River, SeaLake
- License: MIT for the EuroSAT dataset release; Sentinel data is free and open under Copernicus terms

### Sentinel-2 L2A COG Discovery

- Source: https://registry.opendata.aws/sentinel-2-l2a-cogs/
- Search API: https://earth-search.aws.element84.com/v1
- Use in this project: scene discovery, cloud-cover filtering, and COG asset manifests

## Intended Use

The dataset supports an early edge vision baseline for classifying real satellite image chips and scoring downlink priority by mission profile.

This is not a disaster detector yet. Flood, wildfire, smoke, and change-detection workflows require additional public labels or authorized mission data.

## Collection Method

EuroSAT is derived from Sentinel-2 imagery and published as labeled image chips by Helber, Bischke, Dengel, and Borth. This project downloads the RGB archive from Zenodo and preserves the original class directory structure.

The STAC workflow queries public Sentinel-2 COG metadata and returns asset links. It does not download large COG files by default.

## Preprocessing

The first baseline uses RGB JPEG chips resized to 64x64 if necessary. It extracts low-cost color, luma, histogram, and edge features suitable for a small edge payload prototype.

## Limitations

- RGB-only EuroSAT lacks NIR, SWIR, and thermal bands needed for stronger vegetation, water, burn, and heat indices.
- EuroSAT land-cover classes are not event labels.
- EuroSAT is Europe-centric and may not represent other geographies or sensors.
- The first classifier is a compact baseline, not a deep neural model.
- STAC cloud cover is scene metadata and may not exactly match a specific chip.

## Safety And Compliance

Use only public, licensed, or authorized imagery. Do not mix restricted imagery into this repository. Preserve source citations and dataset licenses in downstream reports.
