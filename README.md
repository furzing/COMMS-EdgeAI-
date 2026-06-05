# AI on Edge

Projects and notes for edge AI systems in RF, space, and autonomy.

The focus is practical software: public real data where available, synthetic data where appropriate, edge inference, runtime benchmarking, model export, stress scenarios, and clear safety boundaries.

## Projects

### RF Edge Sentinel

Receive-only RF signal classification and edge inference.

Path: `projects/rf-edge-sentinel`

Current work:

- Synthetic I/Q generator
- RF spectrogram CNN
- ONNX export
- ONNX Runtime benchmark
- FastAPI event stream and dashboard
- Stress scenarios for degraded comms, bad clocks, and confidence drift
- Model card, dataset card, quantization report, and evaluation report

### Orbital Vision Payload

Real-data edge vision baseline for satellite payload scene triage.

Path: `projects/orbital-vision-payload`

Current work:

- EuroSAT RGB downloader and indexer
- Lightweight RGB feature extraction for public Sentinel-2 image chips
- Edge-friendly kNN and centroid classifiers saved as JSON
- Mission-profile downlink priority scoring
- Live Sentinel-2 COG discovery through Earth Search STAC
- Runtime benchmark and evaluation report writer
- Dataset card and model card

## Other Project Directions

### GNSS-Denied Navigation Lab

Simulation-first navigation stack for degraded GPS conditions. The core would be sensor fusion, fault detection, timing jitter handling, and scenario replay.

### Edge Mission Data Mesh

Local event and sensor fusion system for degraded networks. The focus would be event schemas, low-bandwidth sync, provenance, and human review.

## References

- NASA small spacecraft avionics: https://www.nasa.gov/smallsat-institute/sst-soa/small-spacecraft-avionics/
- DARPA RFMLS: https://www.darpa.mil/research/programs/radio-frequency-machine-learning-systems
- DoD CDAO edge data integration: https://www.ai.mil/Latest/News-Press/PR-View/Article/3983856/dod-chief-digital-and-ai-office-announces-award-of-edge-data-integration-servic/
- NASA Prithvi in orbit: https://science.nasa.gov/science-research/ai-foundation-model-in-orbit/
- Shield AI Hivemind: https://shield.ai/delivering-hivemind-a-software-ecosystem-to-enable-autonomy-on-the-edge/
- Anduril Lattice: https://www.anduril.com/news/anduril-s-lattice-a-trusted-dual-use-commercial-and-military-platform-for-public-safety-security
- DoD Directive 3000.09: https://media.defense.gov/2023/Jan/25/2003149928/-1/-1/0/DOW-DIRECTIVE-3000.09-AUTONOMY-IN-WEAPON-SYSTEMS.PDF
