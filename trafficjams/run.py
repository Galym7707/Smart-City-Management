"""
Main launcher: starts both the detector and the dashboard in parallel.
Usage:
    python run.py [video_path_or_camera_index]
    python run.py traffic_video.MOV     (default)
    python run.py 0                     (webcam)
"""

import sys
import threading
import time


def start_dashboard():
    from dashboard import app
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)


def start_detector(source):
    from detector import VehicleDetector
    from dashboard import set_latest_frame

    detector = VehicleDetector(model_path="yolov8n.pt", confidence=0.4)
    while True:
        detector.process_video(source, show=False, save_interval=1.0,
                               frame_callback=set_latest_frame)
        print("Video loop restarting...")
        time.sleep(0.5)


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else "traffic_video.MOV"
    if isinstance(source, str) and source.isdigit():
        source = int(source)

    print("=" * 50)
    print("  TRAFFICJAMS — DETECTION SYSTEM")
    print("=" * 50)
    print(f"  Video source : {source}")
    print(f"  Dashboard    : http://localhost:5000")
    print(f"  Press Ctrl+C to stop")
    print("=" * 50)

    # Detector in background thread
    det_thread = threading.Thread(target=start_detector, args=(source,), daemon=True)
    det_thread.start()

    # Flask in main thread (keeps process alive)
    start_dashboard()


if __name__ == "__main__":
    main()
