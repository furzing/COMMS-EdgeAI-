from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass


EARTH_SEARCH_URL = "https://earth-search.aws.element84.com/v1/search"
DEFAULT_COLLECTION = "sentinel-2-c1-l2a"


@dataclass(frozen=True)
class StacScene:
    item_id: str
    collection: str
    datetime: str
    cloud_cover: float | None
    platform: str | None
    asset_hrefs: dict[str, str]
    quality_score: float

    def to_dict(self) -> dict[str, object]:
        return {
            "item_id": self.item_id,
            "collection": self.collection,
            "datetime": self.datetime,
            "cloud_cover": self.cloud_cover,
            "platform": self.platform,
            "asset_hrefs": self.asset_hrefs,
            "quality_score": self.quality_score,
        }


def search_sentinel2(
    *,
    bbox: list[float],
    datetime_range: str,
    max_cloud_cover: float = 20.0,
    limit: int = 10,
    collection: str = DEFAULT_COLLECTION,
    endpoint: str = EARTH_SEARCH_URL,
) -> list[StacScene]:
    body = {
        "collections": [collection],
        "bbox": bbox,
        "datetime": normalize_datetime_range(datetime_range),
        "limit": limit,
        "query": {"eo:cloud_cover": {"lte": max_cloud_cover}},
    }
    payload = _post_json(endpoint, body)
    return parse_stac_search(payload)


def parse_stac_search(payload: dict[str, object]) -> list[StacScene]:
    features = payload.get("features", [])
    if not isinstance(features, list):
        raise ValueError("STAC response does not contain a feature list")
    scenes: list[StacScene] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties", {})
        assets = feature.get("assets", {})
        if not isinstance(properties, dict) or not isinstance(assets, dict):
            continue
        cloud_cover = _optional_float(properties.get("eo:cloud_cover"))
        asset_hrefs = _select_asset_hrefs(assets)
        quality_score = 1.0 if cloud_cover is None else max(0.0, min(1.0, 1.0 - (cloud_cover / 100.0)))
        scenes.append(
            StacScene(
                item_id=str(feature.get("id", "")),
                collection=str(feature.get("collection", "")),
                datetime=str(properties.get("datetime", "")),
                cloud_cover=cloud_cover,
                platform=str(properties.get("platform")) if properties.get("platform") is not None else None,
                asset_hrefs=asset_hrefs,
                quality_score=quality_score,
            )
        )
    return scenes


def normalize_datetime_range(value: str) -> str:
    if "/" in value:
        start, end = value.split("/", 1)
        return f"{_normalize_datetime_part(start, end=False)}/{_normalize_datetime_part(end, end=True)}"
    return _normalize_datetime_part(value, end=False)


def _select_asset_hrefs(assets: dict[str, object]) -> dict[str, str]:
    preferred = ("visual", "thumbnail", "red", "green", "blue", "nir", "swir16", "swir22", "scl")
    hrefs: dict[str, str] = {}
    for key in preferred:
        asset = assets.get(key)
        if isinstance(asset, dict) and isinstance(asset.get("href"), str):
            hrefs[key] = asset["href"]
    if hrefs:
        return hrefs
    for key, asset in assets.items():
        if isinstance(asset, dict) and isinstance(asset.get("href"), str):
            hrefs[str(key)] = asset["href"]
    return hrefs


def _optional_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_datetime_part(value: str, *, end: bool) -> str:
    value = value.strip()
    if not value or value == "..":
        return value
    if "T" in value:
        return value
    suffix = "23:59:59Z" if end else "00:00:00Z"
    return f"{value}T{suffix}"


def _post_json(endpoint: str, body: dict[str, object]) -> dict[str, object]:
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "orbital-vision-payload/0.1",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))
