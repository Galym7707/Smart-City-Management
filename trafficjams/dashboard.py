"""
Flask web dashboard for real-time traffic jam monitoring.
Reads data saved by detector.py, serves a browser UI, and streams
annotated video with YOLO detections via MJPEG.
"""

import json
import os
import time
import threading
import cv2
from flask import Flask, render_template_string, jsonify, Response

app = Flask(__name__)
BASE_DIR = os.path.dirname(__file__)
DATA_FILE = os.path.join(BASE_DIR, "traffic_data.json")

# Shared state for the latest annotated frame (set by detector thread)
_latest_frame = None
_frame_lock = threading.Lock()


def set_latest_frame(frame_bytes):
    global _latest_frame
    with _frame_lock:
        _latest_frame = frame_bytes


def get_latest_frame():
    with _frame_lock:
        return _latest_frame


def generate_mjpeg():
    """Yield MJPEG frames for the /video_feed endpoint."""
    while True:
        frame = get_latest_frame()
        if frame is not None:
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n")
        time.sleep(0.05)


DASHBOARD_HTML = r"""
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TrafficJams — Live Monitor</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
            --bg-primary: #050a18;
            --bg-secondary: #0c1425;
            --bg-card: #111c32;
            --bg-card-hover: #162040;
            --border: #1c2d4a;
            --text-primary: #f0f4fc;
            --text-secondary: #8899b4;
            --text-muted: #4a5e80;
            --accent-blue: #3b82f6;
            --accent-green: #10b981;
            --accent-yellow: #f59e0b;
            --accent-orange: #f97316;
            --accent-red: #ef4444;
            --accent-purple: #8b5cf6;
        }

        body {
            font-family: 'Inter', 'Segoe UI', sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
        }

        /* --- HEADER --- */
        .header {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 0 32px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(12px);
        }
        .header-left { display: flex; align-items: center; gap: 14px; }
        .logo {
            width: 36px; height: 36px;
            background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
            border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; font-weight: 800; color: white;
        }
        .header h1 {
            font-size: 18px; font-weight: 700; color: var(--text-primary);
            letter-spacing: -0.3px;
        }
        .header h1 span { color: var(--accent-blue); }
        .header-right { display: flex; align-items: center; gap: 16px; }
        .status-badge {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 13px; font-weight: 600;
            background: rgba(16,185,129,0.1);
            border: 1px solid rgba(16,185,129,0.2);
            color: var(--accent-green);
        }
        .status-badge.offline {
            background: rgba(239,68,68,0.1);
            border-color: rgba(239,68,68,0.2);
            color: var(--accent-red);
        }
        .status-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: var(--accent-green);
            animation: blink 2s infinite;
        }
        .status-badge.offline .status-dot {
            background: var(--accent-red);
            animation: none;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        /* --- LAYOUT --- */
        .main {
            max-width: 1400px;
            margin: 0 auto;
            padding: 28px 24px 60px;
        }

        /* --- JAM BANNER --- */
        .jam-banner {
            border-radius: 20px;
            padding: 36px 40px;
            margin-bottom: 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
            transition: background 0.6s ease;
        }
        .jam-banner::before {
            content: '';
            position: absolute;
            top: -50%; right: -10%;
            width: 300px; height: 300px;
            border-radius: 50%;
            background: rgba(255,255,255,0.03);
        }
        .jam-banner.free {
            background: linear-gradient(135deg, #062e21 0%, #065f46 50%, #047857 100%);
            border: 1px solid rgba(16,185,129,0.2);
        }
        .jam-banner.light {
            background: linear-gradient(135deg, #2a1f05 0%, #713f12 50%, #a16207 100%);
            border: 1px solid rgba(245,158,11,0.2);
        }
        .jam-banner.moderate {
            background: linear-gradient(135deg, #2a1508 0%, #9a3412 50%, #c2410c 100%);
            border: 1px solid rgba(249,115,22,0.2);
        }
        .jam-banner.heavy {
            background: linear-gradient(135deg, #2a0808 0%, #7f1d1d 50%, #dc2626 100%);
            border: 1px solid rgba(239,68,68,0.2);
        }
        .jam-left h2 {
            font-size: 40px; font-weight: 800;
            letter-spacing: -1px;
            margin-bottom: 6px;
        }
        .jam-left .advice {
            font-size: 15px; opacity: 0.85; font-weight: 500;
        }
        .jam-right { text-align: right; }
        .score-ring {
            position: relative;
            width: 100px; height: 100px;
            display: inline-block;
        }
        .score-ring svg { transform: rotate(-90deg); }
        .score-ring .bg { fill: none; stroke: rgba(255,255,255,0.1); stroke-width: 8; }
        .score-ring .fg { fill: none; stroke: white; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 0.6s ease; }
        .score-value {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            font-size: 22px; font-weight: 800;
        }
        .score-label { font-size: 13px; opacity: 0.7; margin-top: 6px; }

        /* --- GRID --- */
        .grid-4 {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 18px;
            margin-bottom: 28px;
        }
        @media (max-width: 900px) {
            .grid-4 { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 520px) {
            .grid-4 { grid-template-columns: 1fr; }
            .jam-banner { flex-direction: column; text-align: center; gap: 20px; }
            .jam-right { text-align: center; }
        }

        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 22px 24px;
            transition: background 0.2s, transform 0.2s;
        }
        .card:hover { background: var(--bg-card-hover); transform: translateY(-2px); }
        .card .label {
            font-size: 12px; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.8px;
            color: var(--text-muted); margin-bottom: 10px;
        }
        .card .value {
            font-size: 32px; font-weight: 800; color: var(--text-primary);
            letter-spacing: -0.5px;
        }
        .card .sub { font-size: 12px; color: var(--text-secondary); margin-top: 6px; }

        /* --- TWO-COL SECTION --- */
        .section-2col {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 18px;
            margin-bottom: 28px;
        }
        @media (max-width: 800px) {
            .section-2col { grid-template-columns: 1fr; }
        }

        .panel {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
        }
        .panel h3 {
            font-size: 14px; font-weight: 700; color: var(--text-secondary);
            text-transform: uppercase; letter-spacing: 0.6px;
            margin-bottom: 20px;
        }

        /* --- BAR CHART --- */
        .bars { display: flex; align-items: flex-end; gap: 16px; height: 140px; }
        .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
        .bar-value { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
        .bar-fill {
            width: 48px;
            border-radius: 8px 8px 4px 4px;
            min-height: 6px;
            transition: height 0.5s cubic-bezier(.4,0,.2,1);
        }
        .bar-name { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-top: 10px; }

        /* --- VIDEO --- */
        .video-section {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 28px;
        }
        .video-section h3 {
            font-size: 14px; font-weight: 700; color: var(--text-secondary);
            text-transform: uppercase; letter-spacing: 0.6px;
            margin-bottom: 16px;
        }
        .video-container {
            position: relative;
            border-radius: 12px;
            overflow: hidden;
            background: #000;
            aspect-ratio: 16/9;
        }
        .video-container img {
            width: 100%; height: 100%;
            object-fit: contain;
            display: block;
        }
        .video-overlay {
            position: absolute; top: 12px; left: 12px;
            display: flex; gap: 8px;
        }
        .video-tag {
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px; font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .video-tag.live-tag {
            background: rgba(239,68,68,0.9); color: white;
        }
        .video-tag.ai-tag {
            background: rgba(139,92,246,0.9); color: white;
        }
        .video-placeholder {
            display: flex; align-items: center; justify-content: center;
            width: 100%; aspect-ratio: 16/9;
            color: var(--text-muted); font-size: 15px;
            flex-direction: column; gap: 8px;
        }
        .video-placeholder svg { opacity: 0.3; }

        /* --- GAUGE --- */
        .gauge-container { display: flex; align-items: center; justify-content: center; padding: 10px 0; }
        .gauge { position: relative; width: 180px; height: 100px; }
        .gauge svg { width: 100%; height: 100%; }
        .gauge-bg { fill: none; stroke: var(--border); stroke-width: 12; stroke-linecap: round; }
        .gauge-fill { fill: none; stroke-width: 12; stroke-linecap: round; transition: stroke-dashoffset 0.6s ease, stroke 0.6s ease; }
        .gauge-text {
            position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
            text-align: center;
        }
        .gauge-text .val { font-size: 28px; font-weight: 800; }
        .gauge-text .lbl { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }

        /* --- NO DATA --- */
        .no-data {
            text-align: center; padding: 100px 20px;
            color: var(--text-muted); font-size: 18px;
        }
        .no-data small { display: block; margin-top: 8px; font-size: 14px; opacity: 0.7; }

        /* --- FOOTER --- */
        .footer {
            text-align: center; padding: 24px;
            color: var(--text-muted); font-size: 12px; font-weight: 500;
        }
        .footer span { color: var(--accent-blue); }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <div class="logo">TJ</div>
            <h1>Traffic<span>Jams</span></h1>
        </div>
        <div class="header-right">
            <div class="status-badge offline" id="statusBadge">
                <div class="status-dot"></div>
                <span id="statusText">Connecting...</span>
            </div>
        </div>
    </div>

    <div class="main">
        <div id="noData" class="no-data">
            Waiting for detector data...
            <small>Start the system with: python run.py</small>
        </div>

        <div id="content" style="display:none;">

            <!-- JAM BANNER -->
            <div class="jam-banner free" id="jamBanner">
                <div class="jam-left">
                    <h2 id="jamStatus">FREE FLOW</h2>
                    <div class="advice" id="jamAdvice">Roads are clear</div>
                </div>
                <div class="jam-right">
                    <div class="score-ring">
                        <svg width="100" height="100" viewBox="0 0 100 100">
                            <circle class="bg" cx="50" cy="50" r="42"/>
                            <circle class="fg" id="scoreCircle" cx="50" cy="50" r="42"
                                stroke-dasharray="264" stroke-dashoffset="264"/>
                        </svg>
                        <div class="score-value" id="scoreVal">0%</div>
                    </div>
                    <div class="score-label">Congestion</div>
                </div>
            </div>

            <!-- STATS CARDS -->
            <div class="grid-4">
                <div class="card">
                    <div class="label">Total Vehicles</div>
                    <div class="value" id="totalCount">0</div>
                    <div class="sub">detected in frame</div>
                </div>
                <div class="card">
                    <div class="label">Cars</div>
                    <div class="value" id="carCount" style="color:var(--accent-blue)">0</div>
                    <div class="sub">passenger vehicles</div>
                </div>
                <div class="card">
                    <div class="label">Heavy Vehicles</div>
                    <div class="value" id="heavyCount" style="color:var(--accent-orange)">0</div>
                    <div class="sub">buses + trucks</div>
                </div>
                <div class="card">
                    <div class="label">Last Update</div>
                    <div class="value" id="lastUpdate">--</div>
                    <div class="sub">seconds ago</div>
                </div>
            </div>

            <!-- VIDEO FEED -->
            <div class="video-section">
                <h3>Live Camera Feed — AI Detection</h3>
                <div class="video-container" id="videoContainer">
                    <div class="video-placeholder" id="videoPlaceholder">
                        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                        Loading video feed...
                    </div>
                    <img id="videoFeed" src="/video_feed" style="display:none;" alt="Live Feed"/>
                    <div class="video-overlay">
                        <div class="video-tag live-tag">LIVE</div>
                        <div class="video-tag ai-tag">YOLOv8</div>
                    </div>
                </div>
            </div>

            <!-- CHARTS -->
            <div class="section-2col">
                <div class="panel">
                    <h3>Vehicle Breakdown</h3>
                    <div class="bars" id="barChart"></div>
                </div>
                <div class="panel">
                    <h3>Road Density</h3>
                    <div class="gauge-container">
                        <div class="gauge">
                            <svg viewBox="0 0 200 110">
                                <path class="gauge-bg" d="M 20 100 A 80 80 0 0 1 180 100"/>
                                <path class="gauge-fill" id="gaugeFill" d="M 20 100 A 80 80 0 0 1 180 100"
                                    stroke-dasharray="251" stroke-dashoffset="251"/>
                            </svg>
                            <div class="gauge-text">
                                <div class="val" id="densityVal">0%</div>
                                <div class="lbl">occupied</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">TrafficJams Detection System — Powered by <span>YOLOv8</span> + Flask</div>

    <script>
        const TYPES = {car:"Cars", motorcycle:"Motos", bus:"Buses", truck:"Trucks"};
        const COLORS = {car:"#3b82f6", motorcycle:"#8b5cf6", bus:"#f59e0b", truck:"#ef4444"};
        const ADVICES = {
            "FREE FLOW":  "Roads are clear, no delays expected",
            "LIGHT":      "Slight slowdown, minor delays possible",
            "MODERATE":   "Congestion building, expect delays",
            "HEAVY JAM":  "Severe congestion — avoid this route"
        };

        let videoLoaded = false;
        const videoEl = document.getElementById("videoFeed");
        videoEl.onload = function() {
            if (!videoLoaded) {
                videoLoaded = true;
                document.getElementById("videoPlaceholder").style.display = "none";
                videoEl.style.display = "block";
            }
        };
        videoEl.onerror = function() {
            videoEl.style.display = "none";
            document.getElementById("videoPlaceholder").style.display = "flex";
            // retry in 3s
            setTimeout(() => { videoEl.src = "/video_feed?" + Date.now(); }, 3000);
        };

        function update(data) {
            document.getElementById("noData").style.display = "none";
            document.getElementById("content").style.display = "block";

            const badge = document.getElementById("statusBadge");
            badge.className = "status-badge";
            document.getElementById("statusText").textContent = "Live";

            const jam = data.jam || {status:"FREE FLOW", score:0, is_jam:false};

            // Banner
            const banner = document.getElementById("jamBanner");
            banner.className = "jam-banner";
            if      (jam.score >= 65) banner.classList.add("heavy");
            else if (jam.score >= 40) banner.classList.add("moderate");
            else if (jam.score >= 20) banner.classList.add("light");
            else                      banner.classList.add("free");

            document.getElementById("jamStatus").textContent = jam.status;
            document.getElementById("jamAdvice").textContent = ADVICES[jam.status] || "";

            // Score ring
            const pct = Math.min(jam.score, 100);
            const offset = 264 - (264 * pct / 100);
            document.getElementById("scoreCircle").style.strokeDashoffset = offset;
            document.getElementById("scoreVal").textContent = Math.round(pct) + "%";

            // Cards
            document.getElementById("totalCount").textContent = data.total_count;
            const c = data.counts || {};
            document.getElementById("carCount").textContent = (c.car||0) + (c.motorcycle||0);
            document.getElementById("heavyCount").textContent = (c.bus||0) + (c.truck||0);

            if (data.timestamp) {
                const ago = Math.max(0, Math.round(Date.now()/1000 - data.timestamp));
                document.getElementById("lastUpdate").textContent = ago < 60 ? ago+"s" : Math.round(ago/60)+"m";
            }

            // Bars
            const chart = document.getElementById("barChart");
            chart.innerHTML = "";
            const maxV = Math.max(1, ...Object.values(c));
            for (const [k, label] of Object.entries(TYPES)) {
                const v = c[k]||0;
                const h = Math.max(6, (v/maxV)*110);
                chart.innerHTML += `
                    <div class="bar-col">
                        <div class="bar-value">${v}</div>
                        <div class="bar-fill" style="height:${h}px;background:${COLORS[k]}"></div>
                        <div class="bar-name">${label}</div>
                    </div>`;
            }

            // Density gauge
            const d = Math.min(data.density || 0, 1);
            const gOff = 251 - 251*d;
            const gEl = document.getElementById("gaugeFill");
            gEl.style.strokeDashoffset = gOff;
            if      (d > 0.3) gEl.style.stroke = "#ef4444";
            else if (d > 0.15) gEl.style.stroke = "#f59e0b";
            else               gEl.style.stroke = "#10b981";
            document.getElementById("densityVal").textContent = (d*100).toFixed(1)+"%";
        }

        function poll() {
            fetch("/api/traffic")
                .then(r => r.json())
                .then(data => {
                    if (data.error) {
                        document.getElementById("statusBadge").className = "status-badge offline";
                        document.getElementById("statusText").textContent = "No data";
                    } else {
                        update(data);
                    }
                })
                .catch(() => {
                    document.getElementById("statusBadge").className = "status-badge offline";
                    document.getElementById("statusText").textContent = "Offline";
                });
        }

        poll();
        setInterval(poll, 1000);
    </script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(DASHBOARD_HTML)


@app.route("/api/traffic")
def api_traffic():
    if not os.path.exists(DATA_FILE):
        return jsonify({"error": "no data yet"})
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if time.time() - data.get("timestamp", 0) > 30:
            return jsonify({"error": "data is stale"})
        return jsonify(data)
    except (json.JSONDecodeError, IOError):
        return jsonify({"error": "read error"})


@app.route("/video_feed")
def video_feed():
    return Response(generate_mjpeg(),
                    mimetype="multipart/x-mixed-replace; boundary=frame")


if __name__ == "__main__":
    print("Dashboard running at http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
