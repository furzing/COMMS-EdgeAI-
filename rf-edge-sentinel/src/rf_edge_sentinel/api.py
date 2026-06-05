from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse

from rf_edge_sentinel.runtime import load_detector_model, optional_runtime_status
from rf_edge_sentinel.scenarios import SCENARIOS, iter_scenario_windows
from rf_edge_sentinel.signals import SIGNAL_LABELS, SignalConfig
from rf_edge_sentinel.stream import detect_window


def create_app(
    model_path: str | Path,
    signal_config: SignalConfig | None = None,
    seed: int = 23,
    scenario: str = "nominal",
) -> FastAPI:
    config = signal_config or SignalConfig()
    model = load_detector_model(model_path)
    app = FastAPI(title="RF Edge Sentinel")
    state: dict[str, Any] = {"seed": seed, "scenario": scenario, "model_path": str(model_path)}

    @app.get("/", response_class=HTMLResponse)
    def dashboard() -> str:
        return _dashboard_html()

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "model": getattr(model, "model_type", "edge_knn"),
            "labels": SIGNAL_LABELS,
            "scenario": state["scenario"],
            "optional_runtimes": optional_runtime_status(),
        }

    @app.get("/api/events")
    def events(windows: int = 20, scenario_name: str | None = None) -> list[dict[str, Any]]:
        selected = scenario_name or state["scenario"]
        source = iter_scenario_windows(selected, SIGNAL_LABELS, config, state["seed"])
        return [
            detect_window(model, iq, config, source=selected, expected_label=label).to_dict()
            for label, iq, _ in (next(source) for _ in range(max(1, min(windows, 200))))
        ]

    @app.get("/stream")
    def stream(interval_ms: int = 500, scenario_name: str | None = None) -> StreamingResponse:
        selected = scenario_name or state["scenario"]

        def generator():
            source = iter_scenario_windows(selected, SIGNAL_LABELS, config, state["seed"])
            for label, iq, scenario_label in source:
                event = detect_window(model, iq, config, source=scenario_label, expected_label=label)
                yield f"data: {json.dumps(event.to_dict(), sort_keys=True)}\n\n"
                time.sleep(max(50, interval_ms) / 1000.0)

        return StreamingResponse(generator(), media_type="text/event-stream")

    return app


def _dashboard_html() -> str:
    scenario_options = "".join(f'<option value="{name}">{name}</option>' for name in SCENARIOS)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RF Edge Sentinel</title>
  <style>
    :root {{
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0c0f12;
      color: #ecf2f0;
    }}
    body {{ margin: 0; min-height: 100vh; background: #0c0f12; }}
    header {{ padding: 20px 28px; border-bottom: 1px solid #263139; display: flex; align-items: center; justify-content: space-between; gap: 16px; }}
    h1 {{ margin: 0; font-size: 20px; font-weight: 650; letter-spacing: 0; }}
    main {{ padding: 24px 28px; display: grid; gap: 20px; }}
    .toolbar {{ display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }}
    select, button {{ height: 36px; border: 1px solid #34424a; background: #151b20; color: #ecf2f0; border-radius: 6px; padding: 0 12px; }}
    button {{ cursor: pointer; }}
    .metrics {{ display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 12px; }}
    .metric {{ border: 1px solid #263139; border-radius: 8px; padding: 14px; background: #11161a; }}
    .label {{ color: #94a6ad; font-size: 12px; }}
    .value {{ font-size: 24px; margin-top: 6px; font-variant-numeric: tabular-nums; }}
    table {{ width: 100%; border-collapse: collapse; border: 1px solid #263139; background: #11161a; border-radius: 8px; overflow: hidden; }}
    th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid #263139; font-size: 13px; }}
    th {{ color: #94a6ad; font-weight: 600; background: #151b20; }}
    tr:last-child td {{ border-bottom: 0; }}
    .ok {{ color: #72e0a2; }}
    .warn {{ color: #ffcc66; }}
    @media (max-width: 760px) {{ .metrics {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} header {{ align-items: flex-start; flex-direction: column; }} }}
  </style>
</head>
<body>
  <header>
    <h1>RF Edge Sentinel</h1>
    <div class="toolbar">
      <select id="scenario">{scenario_options}</select>
      <button id="restart">Restart Stream</button>
    </div>
  </header>
  <main>
    <section class="metrics">
      <div class="metric"><div class="label">Events</div><div class="value" id="events">0</div></div>
      <div class="metric"><div class="label">Accuracy</div><div class="value" id="accuracy">0.00</div></div>
      <div class="metric"><div class="label">Median ms</div><div class="value" id="median">0.00</div></div>
      <div class="metric"><div class="label">Anomalies</div><div class="value" id="anomalies">0</div></div>
    </section>
    <table>
      <thead><tr><th>Time</th><th>Scenario</th><th>Expected</th><th>Predicted</th><th>Confidence</th><th>Latency</th><th>Status</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </main>
  <script>
    let source = null;
    let total = 0, correct = 0, anomalies = 0;
    const latencies = [];
    const rows = document.getElementById('rows');
    function median(values) {{
      if (!values.length) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    }}
    function update(event) {{
      total += 1;
      if (event.expected_label === event.predicted_label) correct += 1;
      if (event.is_anomaly) anomalies += 1;
      latencies.push(event.latency_ms);
      document.getElementById('events').textContent = total;
      document.getElementById('accuracy').textContent = (correct / total).toFixed(2);
      document.getElementById('median').textContent = median(latencies).toFixed(2);
      document.getElementById('anomalies').textContent = anomalies;
      const tr = document.createElement('tr');
      const status = event.is_anomaly ? 'anomaly' : 'nominal';
      const cls = event.is_anomaly ? 'warn' : 'ok';
      tr.innerHTML = `<td>${{new Date(event.timestamp_ms).toLocaleTimeString()}}</td><td>${{event.source}}</td><td>${{event.expected_label}}</td><td>${{event.predicted_label}}</td><td>${{event.confidence.toFixed(3)}}</td><td>${{event.latency_ms.toFixed(2)}}</td><td class="${{cls}}">${{status}}</td>`;
      rows.prepend(tr);
      while (rows.children.length > 60) rows.removeChild(rows.lastChild);
    }}
    function start() {{
      if (source) source.close();
      const scenario = document.getElementById('scenario').value;
      source = new EventSource(`/stream?scenario_name=${{encodeURIComponent(scenario)}}&interval_ms=500`);
      source.onmessage = (message) => update(JSON.parse(message.data));
    }}
    document.getElementById('restart').addEventListener('click', start);
    document.getElementById('scenario').addEventListener('change', start);
    start();
  </script>
</body>
</html>"""

