"""
Vehicle detector and counter using YOLOv8.
Processes video input, detects vehicles, counts them per frame,
and provides data for traffic jam analysis.
"""

import cv2
import numpy as np
from ultralytics import YOLO
import time
import json
import os

# YOLO class IDs for vehicles
VEHICLE_CLASSES = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}


class VehicleDetector:
    def __init__(self, model_path="yolov8n.pt", confidence=0.4):
        """
        Initialize detector.
        Args:
            model_path: path to YOLO weights (will auto-download if not present)
            confidence: minimum detection confidence threshold
        """
        self.model = YOLO(model_path)
        self.confidence = confidence
        self.data_file = os.path.join(os.path.dirname(__file__), "traffic_data.json")

    def detect_vehicles(self, frame):
        """
        Run detection on a single frame.
        Returns list of detections: [{"class": str, "confidence": float, "bbox": [x1,y1,x2,y2]}]
        """
        results = self.model(frame, conf=self.confidence, verbose=False)[0]
        detections = []

        for box in results.boxes:
            cls_id = int(box.cls[0])
            if cls_id in VEHICLE_CLASSES:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                detections.append({
                    "class": VEHICLE_CLASSES[cls_id],
                    "confidence": float(box.conf[0]),
                    "bbox": [int(x1), int(y1), int(x2), int(y2)],
                })

        return detections

    def analyze_frame(self, frame):
        """
        Detect vehicles and compute density metrics for a single frame.
        Returns dict with counts and density info.
        """
        detections = self.detect_vehicles(frame)
        h, w = frame.shape[:2]
        frame_area = h * w

        total_vehicle_area = 0
        counts = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}

        for det in detections:
            counts[det["class"]] += 1
            x1, y1, x2, y2 = det["bbox"]
            total_vehicle_area += (x2 - x1) * (y2 - y1)

        total_count = sum(counts.values())
        density = total_vehicle_area / frame_area if frame_area > 0 else 0

        return {
            "total_count": total_count,
            "counts": counts,
            "density": round(density, 4),
            "detections": detections,
        }

    def draw_detections(self, frame, analysis, jam_info=None):
        """Draw bounding boxes and labels on frame."""
        annotated = frame.copy()

        CLASS_COLORS = {
            "car": (246, 130, 59),       # blue
            "motorcycle": (246, 92, 139), # purple
            "bus": (11, 158, 245),        # yellow/orange
            "truck": (68, 68, 239),       # red
        }

        for det in analysis["detections"]:
            x1, y1, x2, y2 = det["bbox"]
            label = f'{det["class"]} {det["confidence"]:.0%}'
            color = CLASS_COLORS.get(det["class"], (0, 255, 0))

            # Filled rectangle header
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(annotated, (x1, y1 - th - 8), (x1 + tw + 8, y1), color, -1)
            cv2.putText(annotated, label, (x1 + 4, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

        # Bottom overlay bar
        h, w = annotated.shape[:2]
        overlay = annotated.copy()
        cv2.rectangle(overlay, (0, h - 48), (w, h), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.6, annotated, 0.4, 0, annotated)

        count_text = f"Vehicles: {analysis['total_count']}  |  Density: {analysis['density']:.1%}"
        cv2.putText(annotated, count_text, (14, h - 16),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)

        if jam_info:
            status_text = f"{jam_info['status']}  ({jam_info['score']:.0f}%)"
            (sw, _), _ = cv2.getTextSize(status_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
            status_color = (0, 0, 255) if jam_info["is_jam"] else (0, 210, 80)
            cv2.putText(annotated, status_text, (w - sw - 14, h - 16),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, status_color, 1, cv2.LINE_AA)

        return annotated

    def save_traffic_data(self, data):
        """Save analysis snapshot to JSON for the dashboard."""
        data["timestamp"] = time.time()
        with open(self.data_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

    def process_video(self, source, show=False, save_interval=1.0, frame_callback=None):
        """
        Process a video file or camera stream.
        Args:
            source: video file path or camera index (0 for webcam)
            show: whether to display the video window (requires GUI)
            save_interval: how often (seconds) to save data for dashboard
            frame_callback: callable(jpeg_bytes) to push annotated frames
        """
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            print(f"Error: cannot open video source '{source}'")
            return

        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        frame_delay = 1.0 / fps
        print(f"Processing video: {source} | FPS: {fps:.1f}")

        last_save = 0
        frame_count = 0
        history = []

        while True:
            frame_start = time.time()

            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap.read()
                if not ret:
                    break

            frame_count += 1
            analysis = self.analyze_frame(frame)

            history.append({
                "frame": frame_count,
                "total_count": analysis["total_count"],
                "density": analysis["density"],
                "counts": analysis["counts"],
            })
            if len(history) > 300:
                history.pop(0)

            jam_info = self._evaluate_jam(history)
            analysis["jam"] = jam_info

            now = time.time()
            if now - last_save >= save_interval:
                self.save_traffic_data(analysis)
                last_save = now

            # Draw annotated frame and push to stream
            annotated = self.draw_detections(frame, analysis, jam_info)
            if frame_callback:
                _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_callback(buf.tobytes())

            if show:
                cv2.imshow("Traffic Jam Detector", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

            # Throttle to match original video FPS
            elapsed = time.time() - frame_start
            if elapsed < frame_delay:
                time.sleep(frame_delay - elapsed)

        cap.release()
        if show:
            cv2.destroyAllWindows()
        print(f"Processed {frame_count} frames.")

    def _evaluate_jam(self, history, window=60):
        """
        Evaluate traffic jam from recent history.
        Uses vehicle count and density over recent frames.
        Returns: {"is_jam": bool, "status": str, "score": float 0-100}
        """
        recent = history[-window:] if len(history) >= window else history

        avg_count = np.mean([h["total_count"] for h in recent])
        avg_density = np.mean([h["density"] for h in recent])

        # Score formula: weighted combination of count and density
        # Thresholds tuned for typical urban traffic camera
        count_score = min(avg_count / 15.0, 1.0) * 50   # up to 50 pts from count
        density_score = min(avg_density / 0.25, 1.0) * 50  # up to 50 pts from density
        score = count_score + density_score

        if score >= 65:
            status = "HEAVY JAM"
            is_jam = True
        elif score >= 40:
            status = "MODERATE"
            is_jam = True
        elif score >= 20:
            status = "LIGHT"
            is_jam = False
        else:
            status = "FREE FLOW"
            is_jam = False

        return {"is_jam": is_jam, "status": status, "score": round(score, 1)}


if __name__ == "__main__":
    import sys

    video_source = sys.argv[1] if len(sys.argv) > 1 else 0
    # If numeric string, convert to int (camera index)
    if isinstance(video_source, str) and video_source.isdigit():
        video_source = int(video_source)

    detector = VehicleDetector(model_path="yolov8n.pt", confidence=0.4)
    detector.process_video(video_source, show=True)
