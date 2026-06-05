from __future__ import annotations

import hashlib
import json
import random
import urllib.request
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


EUROSAT_RGB_URL = "https://zenodo.org/records/7711810/files/EuroSAT_RGB.zip?download=1"
EUROSAT_RGB_MD5 = "f46e308c4d50d4bf32fedad2d3d62f3b"
EUROSAT_CLASSES = (
    "AnnualCrop",
    "Forest",
    "HerbaceousVegetation",
    "Highway",
    "Industrial",
    "Pasture",
    "PermanentCrop",
    "Residential",
    "River",
    "SeaLake",
)
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


@dataclass(frozen=True)
class ImageRecord:
    path: str
    label: str

    def to_path(self) -> Path:
        return Path(self.path)


def download_eurosat_rgb(data_dir: Path, *, url: str = EUROSAT_RGB_URL, force: bool = False) -> Path:
    data_dir.mkdir(parents=True, exist_ok=True)
    archive_path = data_dir / "EuroSAT_RGB.zip"
    if force or not archive_path.exists():
        _download(url, archive_path)
    checksum = md5_file(archive_path)
    if checksum != EUROSAT_RGB_MD5:
        raise ValueError(
            f"EuroSAT archive checksum mismatch: expected {EUROSAT_RGB_MD5}, got {checksum}. "
            "Delete the archive and retry if the download was interrupted."
        )
    extract_dir = data_dir / "EuroSAT_RGB"
    if force and extract_dir.exists():
        for path in sorted(extract_dir.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                path.rmdir()
    if not extract_dir.exists() or not any(extract_dir.iterdir()):
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(data_dir)
    return find_eurosat_root(data_dir)


def index_eurosat(
    data_dir: Path,
    *,
    max_per_class: int | None = None,
    labels: Iterable[str] = EUROSAT_CLASSES,
) -> list[ImageRecord]:
    labels = tuple(labels)
    root = find_eurosat_root(data_dir, labels=labels)
    records: list[ImageRecord] = []
    for label in labels:
        label_dir = root / label
        if not label_dir.exists():
            continue
        paths = sorted(path for path in label_dir.rglob("*") if path.suffix.lower() in IMAGE_SUFFIXES)
        if max_per_class is not None:
            paths = paths[:max_per_class]
        records.extend(ImageRecord(path=str(path), label=label) for path in paths)
    if not records:
        raise FileNotFoundError(
            f"No EuroSAT images found under {data_dir}. Run download-eurosat or point --data-dir to an extracted dataset."
        )
    return records


def write_manifest(records: list[ImageRecord], path: Path) -> dict[str, object]:
    path.parent.mkdir(parents=True, exist_ok=True)
    summary = dataset_summary(records)
    payload = {
        "dataset": "EuroSAT_RGB",
        "records": [asdict(record) for record in records],
        "summary": summary,
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return payload


def read_manifest(path: Path) -> list[ImageRecord]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("records", [])
    if not isinstance(records, list):
        raise ValueError(f"Invalid manifest records in {path}")
    return [ImageRecord(path=str(item["path"]), label=str(item["label"])) for item in records]


def split_records(
    records: list[ImageRecord],
    *,
    train_fraction: float = 0.8,
    seed: int = 7,
) -> tuple[list[ImageRecord], list[ImageRecord]]:
    if not 0.0 < train_fraction < 1.0:
        raise ValueError("train_fraction must be between 0 and 1")
    by_label: dict[str, list[ImageRecord]] = {}
    for record in records:
        by_label.setdefault(record.label, []).append(record)
    rng = random.Random(seed)
    train: list[ImageRecord] = []
    test: list[ImageRecord] = []
    for label_records in by_label.values():
        shuffled = list(label_records)
        rng.shuffle(shuffled)
        split_index = max(1, min(len(shuffled) - 1, round(len(shuffled) * train_fraction)))
        train.extend(shuffled[:split_index])
        test.extend(shuffled[split_index:])
    return train, test


def dataset_summary(records: list[ImageRecord]) -> dict[str, object]:
    counts: dict[str, int] = {}
    for record in records:
        counts[record.label] = counts.get(record.label, 0) + 1
    return {
        "total_records": len(records),
        "labels": dict(sorted(counts.items())),
    }


def find_eurosat_root(data_dir: Path, *, labels: Iterable[str] = EUROSAT_CLASSES) -> Path:
    labels = tuple(labels)
    candidates = [data_dir, data_dir / "EuroSAT_RGB", data_dir / "2750"]
    candidates.extend(path for path in data_dir.glob("*") if path.is_dir())
    for candidate in candidates:
        if _looks_like_eurosat_root(candidate, labels=labels):
            return candidate
    raise FileNotFoundError(f"Could not find EuroSAT class directories under {data_dir}")


def md5_file(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _looks_like_eurosat_root(path: Path, *, labels: Iterable[str] = EUROSAT_CLASSES) -> bool:
    if not path.exists() or not path.is_dir():
        return False
    present = {child.name for child in path.iterdir() if child.is_dir()}
    expected = set(labels)
    required = min(5, max(1, len(expected)))
    return len(expected.intersection(present)) >= required


def _download(url: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "orbital-vision-payload/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response, out_path.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
