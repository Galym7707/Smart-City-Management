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

export default function TrafficLivePage() {
  const [snapshot, setSnapshot] = useState<TrafficJamSnapshot | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveDashboardStatus | null>(null);

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
  const liveUrl = liveStatus?.url ?? DEFAULT_LIVE_DASHBOARD_URL;
  const detections = snapshot?.detections.slice(0, 8) ?? [];
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
            Отдельный экран для видео, индекса пробки и текущих CV-детекций по
            подключённому рабочему узлу.
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
              <span>видео и annotated feed</span>
              <strong>Live dashboard trafficjams</strong>
            </div>
            <div className="traffic-live-stage-tag" style={{ "--traffic-tone": trafficState.color } as CSSProperties}>
              {trafficState.label}
            </div>
          </div>

          {liveStatus?.available ? (
            <iframe
              className="traffic-live-frame"
              src={liveUrl}
              title="trafficjams live dashboard"
            />
          ) : (
            <div className="traffic-live-fallback">
              <strong>Локальный видеоконтур сейчас недоступен</strong>
              <p>
                Snapshot trafficjams продолжает читаться, но встроенный live-dashboard
                на `127.0.0.1:5000` сейчас не отвечает.
              </p>
            </div>
          )}
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
              {detections.length > 0 ? (
                detections.map((detection, index) => (
                  <div className="traffic-live-detection-row" key={`${detection.className}-${index}`}>
                    <strong>{humanizeTrafficClass(detection.className)}</strong>
                    <span>{Math.round(detection.confidence * 100)}%</span>
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
