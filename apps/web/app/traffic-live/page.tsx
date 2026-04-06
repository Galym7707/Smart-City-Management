"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import {
  loadTrafficJamSnapshot,
  type TrafficJamSnapshot,
} from "../../lib/city-signals";

type LiveDashboardStatus = {
  available: boolean;
  url: string;
  checkedAt: string;
};

const DEFAULT_LIVE_DASHBOARD_URL = "http://127.0.0.1:5000";
const SOURCE_VIDEO_URL = "/api/traffic-jams/source-video";
const ANNOTATED_VIDEO_URL = "/api/traffic-jams/annotated-video";

function formatAlmatyTime(value?: string) {
  if (!value) {
    return "нет данных";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Almaty",
  }).format(date);
}

function getTrafficState(score: number) {
  if (score >= 65) {
    return { label: "Сильная пробка", color: "#ff5c4d" };
  }
  if (score >= 40) {
    return { label: "Плотный поток", color: "#ff9f3d" };
  }
  if (score >= 20) {
    return { label: "Лёгкая нагрузка", color: "#ffd05a" };
  }
  return { label: "Свободный поток", color: "#4ade80" };
}

function humanizeTrafficClass(className: "car" | "motorcycle" | "bus" | "truck") {
  switch (className) {
    case "car":
      return "Автомобили";
    case "motorcycle":
      return "Мотоциклы";
    case "bus":
      return "Автобусы";
    default:
      return "Грузовики";
  }
}

function summarizeDetections(detections: TrafficJamSnapshot["detections"]) {
  const order: Array<keyof TrafficJamSnapshot["counts"]> = ["car", "motorcycle", "bus", "truck"];
  const summary = new Map<
    keyof TrafficJamSnapshot["counts"],
    {
      count: number;
      maxConfidence: number;
    }
  >();

  for (const detection of detections) {
    const current = summary.get(detection.className) ?? {
      count: 0,
      maxConfidence: 0,
    };

    summary.set(detection.className, {
      count: current.count + 1,
      maxConfidence: Math.max(current.maxConfidence, detection.confidence),
    });
  }

  return order
    .map((className) => {
      const item = summary.get(className);
      if (!item) {
        return null;
      }

      return {
        className,
        label: humanizeTrafficClass(className),
        count: item.count,
        maxConfidence: Math.round(item.maxConfidence * 100),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export default function TrafficLivePage() {
  const [snapshot, setSnapshot] = useState<TrafficJamSnapshot | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveDashboardStatus | null>(null);
  const [sourceVideoState, setSourceVideoState] = useState<"loading" | "ready" | "error">("loading");
  const [annotatedVideoState, setAnnotatedVideoState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    const refreshSnapshot = async () => {
      const nextSnapshot = await loadTrafficJamSnapshot();
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    };

    const refreshLiveStatus = async () => {
      try {
        const response = await fetch("/api/traffic-jams/live-status", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as LiveDashboardStatus;
        if (!cancelled) {
          setLiveStatus(payload);
        }
      } catch {
        if (!cancelled) {
          setLiveStatus({
            available: false,
            url: DEFAULT_LIVE_DASHBOARD_URL,
            checkedAt: new Date().toISOString(),
          });
        }
      }
    };

    void refreshSnapshot();
    void refreshLiveStatus();

    const snapshotIntervalId = window.setInterval(() => {
      void refreshSnapshot();
    }, 10_000);

    const statusIntervalId = window.setInterval(() => {
      void refreshLiveStatus();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(snapshotIntervalId);
      window.clearInterval(statusIntervalId);
    };
  }, []);

  const trafficState = getTrafficState(snapshot?.jam.score ?? 0);
  const totalCount = snapshot?.totalCount ?? 0;
  const densityPct = Math.round((snapshot?.density ?? 0) * 100);
  const jamScore = Math.round(snapshot?.jam.score ?? 0);
  const updatedAt = formatAlmatyTime(snapshot?.updatedAt);
  const detections = snapshot?.detections.slice(0, 8) ?? [];
  const detectionSummary = summarizeDetections(detections);
  const counts = snapshot?.counts ?? { car: 0, motorcycle: 0, bus: 0, truck: 0 };

  return (
    <main className="traffic-live-shell">
      <header className="traffic-live-header">
        <div className="traffic-live-header-copy">
          <Link className="traffic-live-back" href="/">
            Назад к dashboard
          </Link>
          <span className="traffic-live-eyebrow">trafficjams live monitoring</span>
          <h1>Восточный видеоконтур trafficjams</h1>
          <p>
            Здесь теперь два слоя одновременно: исходное видео как нормальный плеер и AI-поток
            с YOLOv8-разметкой, индексом пробки и детекциями транспорта.
          </p>
        </div>

        <div className="traffic-live-header-meta">
          <div
            className={`traffic-live-badge ${
              liveStatus?.available ? "traffic-live-badge-online" : "traffic-live-badge-offline"
            }`}
          >
            {liveStatus?.available ? "Поток online" : "Поток offline"}
          </div>
          <div className="traffic-live-updated">Обновлено {updatedAt}</div>
        </div>
      </header>

      <section className="traffic-live-grid">
        <div className="traffic-live-stage">
          <div className="traffic-live-stage-head">
            <div>
              <span>исходное видео и annotated feed</span>
              <strong>Trafficjams video monitoring</strong>
            </div>
            <div className="traffic-live-stage-tag" style={{ "--traffic-tone": trafficState.color } as CSSProperties}>
              {trafficState.label}
            </div>
          </div>

          <div className="traffic-live-video-grid">
            <section className="traffic-live-video-panel">
              <div className="traffic-live-video-head">
                <div>
                  <span>исходное видео</span>
                  <strong>traffic_video.MOV</strong>
                </div>
                <div className="traffic-live-video-chip">Видео</div>
              </div>

              <div className="traffic-live-video-shell">
                {sourceVideoState !== "ready" ? (
                  <div className="traffic-live-loading">
                    <strong>
                      {sourceVideoState === "error"
                        ? "Исходное видео не открылось"
                        : "Загружаем исходный видеоряд"}
                    </strong>
                    <p>
                      {sourceVideoState === "error"
                        ? "Браузер не смог открыть локальный source-video поток."
                        : "Это отдельный видео-плеер из файла traffic_video.MOV, а не поток картинок MJPEG."}
                    </p>
                  </div>
                ) : null}

                <video
                  className={`traffic-live-player ${sourceVideoState === "ready" ? "traffic-live-player-ready" : ""}`}
                  src={SOURCE_VIDEO_URL}
                  autoPlay
                  controls
                  loop
                  muted
                  playsInline
                  preload="auto"
                  onLoadedData={() => {
                    setSourceVideoState("ready");
                  }}
                  onError={() => {
                    setSourceVideoState("error");
                  }}
                />
              </div>
            </section>

            <section className="traffic-live-video-panel">
              <div className="traffic-live-video-head">
                <div>
                  <span>AI annotated video</span>
                  <strong>YOLOv8 detections on video</strong>
                </div>
                <div className="traffic-live-video-chip">AI</div>
              </div>

              <div className="traffic-live-video-shell">
                {annotatedVideoState !== "ready" ? (
                  <div className="traffic-live-loading">
                    <strong>
                      {annotatedVideoState === "error"
                        ? "AI-видео не открылось"
                        : "Загружаем AI annotated video"}
                    </strong>
                    <p>
                      {annotatedVideoState === "error"
                        ? "Файл с YOLO-разметкой не открылся в браузере."
                        : "Это уже не MJPEG-картинка, а нормальное видео с движущимися боксами и детекциями на каждом кадре."}
                    </p>
                  </div>
                ) : null}

                <video
                  className={`traffic-live-player ${annotatedVideoState === "ready" ? "traffic-live-player-ready" : ""}`}
                  src={ANNOTATED_VIDEO_URL}
                  autoPlay
                  controls
                  loop
                  muted
                  playsInline
                  preload="auto"
                  onLoadedData={() => {
                    setAnnotatedVideoState("ready");
                  }}
                  onError={() => {
                    setAnnotatedVideoState("error");
                  }}
                />
              </div>
            </section>
          </div>
        </div>

        <aside className="traffic-live-sidebar">
          <div className="traffic-live-card">
            <span>Сводка</span>
            <div className="traffic-live-kpi-grid">
              <div className="traffic-live-kpi">
                <span>Индекс пробки</span>
                <strong>{jamScore}%</strong>
              </div>
              <div className="traffic-live-kpi">
                <span>Плотность</span>
                <strong>{densityPct}%</strong>
              </div>
              <div className="traffic-live-kpi">
                <span>Машин в кадре</span>
                <strong>{totalCount}</strong>
              </div>
              <div className="traffic-live-kpi">
                <span>Статус</span>
                <strong>{trafficState.label}</strong>
              </div>
            </div>
          </div>

          <div className="traffic-live-card">
            <span>Состав потока</span>
            <div className="traffic-live-list">
              <div className="traffic-live-row">
                <strong>Автомобили</strong>
                <span>{counts.car}</span>
              </div>
              <div className="traffic-live-row">
                <strong>Мотоциклы</strong>
                <span>{counts.motorcycle}</span>
              </div>
              <div className="traffic-live-row">
                <strong>Автобусы</strong>
                <span>{counts.bus}</span>
              </div>
              <div className="traffic-live-row">
                <strong>Грузовики</strong>
                <span>{counts.truck}</span>
              </div>
            </div>
          </div>

          <div className="traffic-live-card">
            <span>Детекции в кадре</span>
            <div className="traffic-live-detection-list">
              {detectionSummary.length > 0 ? (
                detectionSummary.map((item) => (
                  <div className="traffic-live-detection-row" key={item.className}>
                    <strong>{item.label}</strong>
                    <span>
                      {item.count} шт. · до {item.maxConfidence}%
                    </span>
                  </div>
                ))
              ) : (
                <div className="traffic-live-empty">Свежие boxes пока не получены.</div>
              )}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
