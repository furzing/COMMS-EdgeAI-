# Public Real IQ Data

The project can evaluate small chunks from public SatNOGS IQ recordings hosted by CAMRAS for the Dwingeloo radio telescope.

Source page:

https://data.camras.nl/satnogs/

The source lists the recordings as 48 kHz, 16-bit complex IQ and CC-BY 4.0.

## Curated Recordings

The current catalog is in `rf_edge_sentinel.public_data`.

```powershell
python -m rf_edge_sentinel list-public-iq
```

Included examples:

- `satnogs_uresat1_7883687`
- `satnogs_fox1e_9305704`
- `satnogs_rsp03_13339371`

The files are large. Use byte-range download:

```powershell
python -m rf_edge_sentinel download-public-iq --recording satnogs_uresat1_7883687 --out data\public\satnogs_uresat1_7883687_2mb.raw --max-mb 2 --offset-mb 16
```

Evaluate:

```powershell
python -m rf_edge_sentinel evaluate-real-iq --model artifacts\rf_spectrogram_cnn.json --input data\public\satnogs_uresat1_7883687_2mb.raw --out reports\real_satnogs_uresat1_7883687_eval.json --source-id satnogs_uresat1_7883687 --windows 120 --sample-rate-hz 48000 --window-size 4096
```

## Current Result

For a 2 MB URESAT-1 chunk from byte range `16777216-18874367`:

```text
prediction_counts: qpsk = 120
mean_confidence: 0.5953
mean_anomaly_score: 0.9367
anomaly_rate: 0.225
```

This is not an accuracy result because the chunk is not labeled by modulation in this repo. It is useful for domain-shift testing and anomaly-threshold tuning.

## Next Use

Use these real chunks to drive model improvements:

- Check whether real satellite RF is consistently over-classified as one synthetic class.
- Tune anomaly scoring so real RF does not pass as clean synthetic data unless justified.
- Add weak labels later if modulation metadata is verified from external observation records.
- Compare synthetic scenarios against real-energy, real-noise, and real-clock behavior.

