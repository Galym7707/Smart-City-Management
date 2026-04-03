"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnomalyMap } from "../components/anomaly-map";
import {
  createUnavailableDashboardState,
  loadDashboardState,
} from "../lib/api";

// ─── Feature types ─────────────────────────────────────────────────────────────
type FeatureId =
  | "ch4-map"
  | "cv-accidents"
  | "air-quality"
  | "risk-workflow"
  | "forecast-center"
  | "report-studio";

type Feature = {
  id: FeatureId;
  icon: string;
  short: string;
  label: string;
  overview: string;
  help: string;
  badge?: string;
  color: string;
};

const FEATURES: Feature[] = [
  {
    id: "ch4-map",
    icon: "◉",
    short: "CH4",
    label: "CH4 карта",
    overview: "Спутниковый контур утечек и flare-событий.",
    help: "Модуль показывает CH4-карту, точки отклонения от базового уровня и зоны, которые стоит проверять первыми.",
    badge: "LIVE",
    color: "#4f8cff",
  },
  {
    id: "cv-accidents",
    icon: "◎",
    short: "CV",
    label: "Computer Vision ДТП",
    overview: "Видеоаналитика аварий, заторов и ETA служб.",
    help: "Этот модуль нужен для видеоаналитики ДТП, перегруженных перекрёстков и оценки времени реакции служб.",
    badge: "AI",
    color: "#ff8c52",
  },
  {
    id: "air-quality",
    icon: "◌",
    short: "AQI",
    label: "Воздух Алматы",
    overview: "Качество воздуха и меры для города.",
    help: "Здесь город видит AQI по районам и рекомендации, которые можно быстро переводить в управленческие меры.",
    color: "#57d18e",
  },
  {
    id: "risk-workflow",
    icon: "◇",
    short: "RCA",
    label: "Очередь рисков",
    overview: "Risk queue, workflow и root cause.",
    help: "Это operational loop: сигнал, очередь, инцидент, задачи, отчёт и краткий разбор вероятных причин.",
    color: "#b289ff",
  },
  {
    id: "forecast-center",
    icon: "△",
    short: "FCST",
    label: "Прогноз города",
    overview: "Сценарный forecast по нагрузке и рискам.",
    help: "Forecast center показывает, где и когда нагрузка на городские сервисы выйдет из нормы и где нужен резерв.",
    color: "#58c5ff",
  },
  {
    id: "report-studio",
    icon: "▣",
    short: "REP",
    label: "Отчёты и качество",
    overview: "Экспорт сводок и контроль данных.",
    help: "Report Studio собирает короткие сводки, расширенные отчёты и показывает, насколько качественно заполнен набор данных.",
    color: "#ffd05a",
  },
];

const FAQ_ITEMS = [
  {
    id: "platform",
    question: "Что это за платформа?",
    answer:
      "Это Smart City Management для Алматы: один экран, где город видит CH4, ДТП, воздух, очередь рисков, прогнозы и отчётный контур.",
  },
  {
    id: "state",
    question: "Чем это полезно государству?",
    answer:
      "Акимат получает не просто аналитику, а рабочий слой принятия решений: где проблема, кто отвечает, что делать дальше и какой пакет уже готов для руководства.",
  },
  {
    id: "modules",
    question: "Почему здесь 6 отдельных модулей?",
    answer:
      "Потому что это не один узкий дашборд, а полноценный городской command center: экология, трафик, воздух, risk queue, прогнозы и отчёты.",
  },
  {
    id: "assistant",
    question: "Что будет делать AI Assistant?",
    answer:
      "После подключения ChatGPT API он станет правой точкой входа для сводок, объяснений по районам, управленческих рекомендаций и генерации коротких отчётов.",
  },
  {
    id: "demo",
    question: "Данные на экране реальные?",
    answer:
      "Сейчас это demo-макет с mock-данными, чтобы показать конечный интерфейс и весь operational loop без пустых состояний.",
  },
] as const;

// ─── Chat types ─────────────────────────────────────────────────────────────────
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: Date;
};

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function Page() {
  const [activeFeature, setActiveFeature] = useState<FeatureId>("ch4-map");
  const [chatOpen, setChatOpen] = useState(true);
  const [selectedFaq, setSelectedFaq] = useState<string>(FAQ_ITEMS[0].id);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Я AI Assistant Smart City Management. Сейчас справа demo-rail. После подключения ChatGPT API здесь будут сводки, объяснения и управленческие рекомендации.",
      ts: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [anomalies, setAnomalies] = useState(createUnavailableDashboardState().anomalies);
  const [dashLoaded, setDashLoaded] = useState(false);

  useEffect(() => {
    loadDashboardState()
      .then((state) => {
        setAnomalies(state.anomalies);
        setDashLoaded(true);
      })
      .catch(() => {
        setDashLoaded(true);
      });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: new Date(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatLoading(true);

    // Demo fallback — в реальном проекте заменить на вызов ChatGPT API
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
    const replies: Record<string, string> = {
      ch4: "По данным спутника Sentinel-5P, уровень CH₄ в Бостандыкском районе сейчас на 12% выше базового. Рекомендую проверить газопроводную инфраструктуру.",
      дтп: "За последние 24 часа компьютерное зрение зафиксировало 3 инцидента на пересечении Аль-Фараби и Навои. Средняя задержка прибытия экстренных служб — 8 мин.",
      воздух: "Индекс AQI в Алатауском районе сейчас 142 (Нездоровый). Основные источники: выбросы ТЭЦ-2 и трафик на Рыскулова. Рекомендую временные ограничения движения.",
      риск: "В очереди рисков сейчас лидируют транспорт, коммунальные сети и экология. По красным кейсам нужен owner, SLA и запуск incident workflow.",
      прогноз: "Следующее напряжённое окно ожидается вечером: транспорт и энергетика выходят выше базового профиля. Стоит заранее включить резервные схемы.",
      отч: "Пакет для руководства может включать короткую сводку, расширенный DOCX и экспорт сырых данных с метками качества.",
    };
    const key = Object.keys(replies).find((k) => text.toLowerCase().includes(k));
    const botText =
      key
        ? replies[key]
        : `Анализирую данные по запросу: "${text}". Сейчас город функционирует в штатном режиме. Критических отклонений по выбранным модулям не выявлено.`;

    const botMsg: ChatMessage = {
      id: `b-${Date.now()}`,
      role: "assistant",
      text: botText,
      ts: new Date(),
    };
    setChatMessages((prev) => [...prev, botMsg]);
    setChatLoading(false);
  };

  const activeF = FEATURES.find((f) => f.id === activeFeature)!;
  const selectedFaqItem = FAQ_ITEMS.find((item) => item.id === selectedFaq) ?? FAQ_ITEMS[0];
  const shellStyle = {
    "--feature-color": activeF.color,
  } as CSSProperties;

  return (
    <div className="scm-shell" style={shellStyle}>
      {/* ── LEFT SIDEBAR ─────────────────────────────────────── */}
      <aside className="scm-sidebar">
        <div className="scm-sidebar-brand">
          <div className="scm-brand-dot" />
          <div>
            <strong>Smart City</strong>
            <span>Алматы</span>
          </div>
        </div>

        <nav className="scm-nav">
          {FEATURES.map((f) => (
            <button
              key={f.id}
              className={`scm-nav-item ${activeFeature === f.id ? "scm-nav-item-active" : ""}`}
              onClick={() => setActiveFeature(f.id)}
              style={{ "--feature-color": f.color } as CSSProperties}
              type="button"
            >
              <span className="scm-nav-icon">{f.icon}</span>
              <span className="scm-nav-copy">
                <span className="scm-nav-short">{f.short}</span>
                <span className="scm-nav-label">{f.label}</span>
              </span>
              {f.badge ? <span className="scm-nav-badge">{f.badge}</span> : null}
              {activeFeature === f.id ? <span className="scm-nav-indicator" /> : null}
            </button>
          ))}
        </nav>

        <div className="scm-sidebar-footer">
          <button
            className={`scm-chat-trigger ${chatOpen ? "scm-chat-trigger-active" : ""}`}
            onClick={() => setChatOpen((v) => !v)}
            type="button"
          >
            <span>🤖</span>
            <span>AI Ассистент</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────── */}
      <main className="scm-main">
        {/* Hero */}
        <section className="scm-hero">
          <div className="scm-hero-content">
            <div className="scm-hero-badge">
              <span className="scm-live-dot" />
              Smart City Management
              <HelpHint text="Орбита справа — это навигатор из 6 модулей платформы вокруг ядра Алматы. Каждый цветной узел означает отдельный контур, а активный модуль подсвечен сильнее." />
            </div>
            <h1 className="scm-hero-title">
              Smart City Management
              <span className="scm-hero-accent">Видеть раньше. Решать быстрее.</span>
            </h1>
            <p className="scm-hero-sub">
              Единый command center для Алматы: CH4 карта, Computer Vision ДТП,
              воздух, risk queue, прогнозы и отчёты на одном экране.
            </p>
            <div className="scm-hero-pill-row">
              {FEATURES.map((feature) => (
                <span
                  key={feature.id}
                  className={`scm-hero-pill ${activeFeature === feature.id ? "scm-hero-pill-active" : ""}`}
                >
                  {feature.short}
                </span>
              ))}
            </div>
            <div className="scm-hero-stats">
              <div className="scm-stat">
                <strong>6</strong>
                <span>модулей</span>
              </div>
              <div className="scm-stat">
                <strong>{anomalies.length || 6}</strong>
                <span>кейсов в срезе</span>
              </div>
              <div className="scm-stat">
                <strong>{dashLoaded ? "READY" : "LOAD"}</strong>
                <span>demo workflow</span>
              </div>
            </div>
          </div>
          <div className="scm-hero-visual">
            <HeroGlobe activeFeature={activeFeature} />
            <article className="scm-hero-focus">
              <span>{activeF.short}</span>
              <strong>{activeF.label}</strong>
              <p>{activeF.overview}</p>
            </article>
          </div>
        </section>

        {/* Feature Panel */}
        <section className="scm-feature-panel" key={activeFeature}>
          <div className="scm-feature-header">
            <span className="scm-feature-icon-lg">{activeF.icon}</span>
            <div>
              <div className="scm-title-row">
                <h2 className="scm-feature-title">{activeF.label}</h2>
                <HelpHint text={activeF.help} />
              </div>
              <p className="scm-feature-overview">{activeF.overview}</p>
              {activeF.badge ? (
                <span className="scm-feature-badge" style={{ background: activeF.color + "22", color: activeF.color }}>
                  {activeF.badge}
                </span>
              ) : null}
            </div>
          </div>

          {activeFeature === "ch4-map" && <Ch4Panel anomalies={anomalies} />}
          {activeFeature === "cv-accidents" && <CvAccidentsPanel />}
          {activeFeature === "air-quality" && <AirQualityPanel />}
          {activeFeature === "risk-workflow" && <RiskWorkflowPanel />}
          {activeFeature === "forecast-center" && <ForecastCenterPanel />}
          {activeFeature === "report-studio" && <ReportStudioPanel />}
        </section>

        <section className="scm-faq-shell">
          <div className="scm-faq-header">
            <span className="scm-faq-kicker">
              ЧАВО
              <HelpHint text="Эта секция отвечает коротко и по делу: что за платформа, чем полезна городу и как читать экран без лишнего текста." />
            </span>
            <h2>Что важно понять за 30 секунд</h2>
            <p>Короткие ответы для жюри, акимата и будущего пользователя платформы.</p>
          </div>

          <div className="scm-faq-layout">
            <div className="scm-faq-questions">
              {FAQ_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className={`scm-faq-question ${selectedFaq === item.id ? "scm-faq-question-active" : ""}`}
                  onClick={() => setSelectedFaq(item.id)}
                  type="button"
                >
                  {item.question}
                </button>
              ))}
            </div>

            <article className="scm-faq-answer">
              <span className="scm-faq-answer-badge">Ответ</span>
              <strong>{selectedFaqItem.question}</strong>
              <p>{selectedFaqItem.answer}</p>
            </article>
          </div>
        </section>
      </main>

      {/* ── RIGHT CHATBOT ─────────────────────────────────────── */}
      <aside className={`scm-chatbot ${chatOpen ? "scm-chatbot-open" : ""}`}>
        <div className="scm-chatbot-header">
          <div className="scm-chatbot-avatar">🤖</div>
          <div>
            <strong>
              AI Ассистент
              <HelpHint text="Это правый слайдбар под будущий ChatGPT API. Сейчас здесь demo-режим: можно проверить, как будет выглядеть диалоговый помощник." />
            </strong>
            <span>ChatGPT API позже</span>
          </div>
          <button className="scm-chatbot-close" onClick={() => setChatOpen(false)} type="button">
            ✕
          </button>
        </div>

        <div className="scm-chatbot-chips">
          {["CH4", "ДТП", "Воздух", "Риски", "Прогноз", "Отчёт"].map((chip) => (
            <button
              key={chip}
              className="scm-chat-chip"
              onClick={() => setChatInput(chip)}
              type="button"
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="scm-chatbot-messages">
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`scm-chat-msg scm-chat-msg-${msg.role}`}>
              <p>{msg.text}</p>
            </div>
          ))}
          {chatLoading ? (
            <div className="scm-chat-msg scm-chat-msg-assistant">
              <div className="scm-typing">
                <span /><span /><span />
              </div>
            </div>
          ) : null}
          <div ref={chatEndRef} />
        </div>

        <div className="scm-chatbot-input-row">
          <input
            className="scm-chatbot-input"
            placeholder="Спросите что-нибудь..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void sendChat(); }}
            type="text"
          />
          <button
            className="scm-chatbot-send"
            disabled={chatLoading || !chatInput.trim()}
            onClick={() => void sendChat()}
            type="button"
          >
            ➤
          </button>
        </div>
      </aside>

      {/* Chat FAB (mobile / collapsed) */}
      {!chatOpen && (
        <button
          className="scm-ai-fab"
          onClick={() => setChatOpen(true)}
          type="button"
          aria-label="Открыть AI ассистент"
        >
          🤖
        </button>
      )}
    </div>
  );
}

// ─── Hero Globe decoration ───────────────────────────────────────────────────────
function HeroGlobe({ activeFeature }: { activeFeature: FeatureId }) {
  const orbitNodes = [
    { top: "8%", left: "49%", short: FEATURES[0].short, id: FEATURES[0].id, color: FEATURES[0].color },
    { top: "24%", left: "76%", short: FEATURES[1].short, id: FEATURES[1].id, color: FEATURES[1].color },
    { top: "58%", left: "80%", short: FEATURES[2].short, id: FEATURES[2].id, color: FEATURES[2].color },
    { top: "74%", left: "54%", short: FEATURES[3].short, id: FEATURES[3].id, color: FEATURES[3].color },
    { top: "60%", left: "20%", short: FEATURES[4].short, id: FEATURES[4].id, color: FEATURES[4].color },
    { top: "24%", left: "18%", short: FEATURES[5].short, id: FEATURES[5].id, color: FEATURES[5].color },
  ] as const;

  return (
    <div className="scm-globe-wrap">
      <div className="scm-globe">
        <div className="scm-globe-ring scm-globe-ring-1" />
        <div className="scm-globe-ring scm-globe-ring-2" />
        <div className="scm-globe-ring scm-globe-ring-3" />
        <div className="scm-globe-core">
          <strong>ALMATY</strong>
          <span>Ядро города</span>
        </div>
        {orbitNodes.map((dot, i) => (
          <div
            key={dot.id}
            className={`scm-globe-node ${dot.id === activeFeature ? "scm-globe-node-active" : ""}`}
            style={{ top: dot.top, left: dot.left, "--node-color": dot.color, animationDelay: `${i * 0.18}s` } as CSSProperties}
            title={FEATURES.find((feature) => feature.id === dot.id)?.label}
          >
            <div className="scm-globe-dot">
              <span>{dot.short}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CH4 Panel ───────────────────────────────────────────────────────────────────
function Ch4Panel({ anomalies }: { anomalies: any[] }) {
  const [selected, setSelected] = useState(anomalies[0]?.id ?? "");
  const leadAnomaly = anomalies.find((item) => item.id === selected) ?? anomalies[0];
  const deltaValue =
    leadAnomaly?.methaneDeltaPct !== undefined
      ? `+${Math.round(leadAnomaly.methaneDeltaPct)}%`
      : "+12%";

  const kpis = [
    {
      label: "Зон мониторинга",
      value: "7",
      color: "#47a6ff",
      help: "Сколько контуров или районов сейчас попадает в рабочий спутниковый срез.",
    },
    {
      label: "Аномалий",
      value: anomalies.length > 0 ? String(anomalies.length) : "3",
      color: "#ff5c4d",
      help: "Сколько точек на карте выбиваются из обычного уровня и попали в очередь на разбор.",
    },
    {
      label: "К базовому фону CH4",
      value: deltaValue,
      color: "#ff9f3d",
      help: "Это не абстрактный процент. Метрика показывает, на сколько текущий уровень CH4 выше обычного фона для той же зоны и периода.",
    },
    {
      label: "Последнее обновление",
      value: "2 мин назад",
      color: "#4ade80",
      help: "Когда платформа в последний раз пересобрала mock-срез для этой карты.",
    },
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {kpis.map((k) => (
          <div className="scm-kpi-card" key={k.label} style={{ "--kpi-color": k.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{k.label}</span>
              <HelpHint text={k.help} />
            </div>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Карта CH4"
          help="Главная рабочая зона для спутникового мониторинга CH4. Здесь выбирают аномалию и понимают, где отклонение выше фонового уровня."
        />
        <div className="scm-map-wrap">
          {anomalies.length > 0 ? (
            <AnomalyMap
              anomalies={anomalies}
              locale="ru"
              onSelectAnomaly={setSelected}
              selectedAnomalyId={selected}
              tone="live"
              primaryActionLabel="Подробнее"
              primaryActionDisabled={false}
              onPrimaryAction={() => {}}
            />
          ) : (
            <DemoMapPlaceholder />
          )}
        </div>
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Контекст"
          help="Короткий operational context: откуда пришёл сигнал, где проблема и какое действие предлагается прямо сейчас."
        />
        <div className="scm-info-grid">
          <InfoCard
            title="Спутниковые данные"
            desc="Sentinel-5P · TROPOMI — детектируем CH₄ с точностью до 7×7 км"
            icon="🛰️"
            color="#47a6ff"
            help="Источник mock-среза для демонстрации спутникового обнаружения метана."
          />
          <InfoCard
            title="Алатауский район"
            desc="Повышенная концентрация метана +18% от базового уровня"
            icon="⚠️"
            color="#ff5c4d"
            help="Карточка района с приоритетом проверки: здесь текущее значение заметно выше локального фона."
          />
          <InfoCard
            title="Рекомендация"
            desc="Направить инспекцию Газпром Казахстан для проверки сетей"
            icon="✅"
            color="#4ade80"
            help="Следующее действие для штаба: кого отправить и зачем."
          />
        </div>
      </div>
    </div>
  );
}

// ─── CV Accidents Panel ──────────────────────────────────────────────────────────
function CvAccidentsPanel() {
  const incidents = [
    { id: 1, loc: "Аль-Фараби / Навои", type: "Столкновение", time: "14:32", sev: "high" },
    { id: 2, loc: "Достык / Сатпаева", type: "Нарушение ПДД", time: "13:51", sev: "medium" },
    { id: 3, loc: "Рыскулова / Байтурсынова", type: "Пробка 8 км", time: "12:20", sev: "medium" },
  ];

  const stats = [
    {
      label: "Камер активно",
      value: "342",
      color: "#ff9f3d",
      help: "Сколько городских камер сейчас участвуют в computer vision контуре.",
    },
    {
      label: "Инцидентов / 24ч",
      value: "8",
      color: "#ff5c4d",
      help: "Сколько дорожных событий попало в очередь за последние сутки.",
    },
    {
      label: "Ср. время реакции",
      value: "6.2 мин",
      color: "#47a6ff",
      help: "Среднее время между детекцией события и реакцией службы.",
    },
    {
      label: "Нарушений ПДД",
      value: "124",
      color: "#a78bfa",
      help: "Количество зафиксированных нарушений, которые система классифицировала автоматически.",
    },
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {stats.map((s) => (
          <div className="scm-kpi-card" key={s.label} style={{ "--kpi-color": s.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{s.label}</span>
              <HelpHint text={s.help} />
            </div>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Видеопоток"
          help="Демонстрационная сцена computer vision: на ней система выделяет камеры и потенциальные ДТП или нарушения."
        />
        <div className="scm-cv-visual">
          <div className="scm-cv-screen">
            <div className="scm-cv-overlay">
              {[
                { top: "28%", left: "22%", label: "Cam 14" },
                { top: "52%", left: "58%", label: "Cam 07" },
                { top: "68%", left: "35%", label: "Cam 22" },
              ].map((cam) => (
                <div key={cam.label} className="scm-cv-box" style={{ top: cam.top, left: cam.left }}>
                  <span>{cam.label}</span>
                </div>
              ))}
            </div>
            <p className="scm-cv-label">Анализ видеопотока в реальном времени · YOLOv8</p>
          </div>
        </div>
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Лента событий"
          help="Живая очередь detected incidents: где произошло событие, какого оно типа и когда было замечено."
        />
        <div className="scm-incident-list">
          {incidents.map((inc) => (
            <div key={inc.id} className={`scm-incident-row scm-incident-${inc.sev}`}>
              <div className="scm-incident-dot" />
              <div className="scm-incident-info">
                <strong>{inc.loc}</strong>
                <span>{inc.type}</span>
              </div>
              <span className="scm-incident-time">{inc.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Air Quality Panel ───────────────────────────────────────────────────────────
function AirQualityPanel() {
  const districts = [
    { name: "Алатауский", aqi: 142, level: "Нездоровый", color: "#ff5c4d" },
    { name: "Бостандык", aqi: 87, level: "Умеренный", color: "#ff9f3d" },
    { name: "Медеуский", aqi: 55, level: "Приемлемый", color: "#4ade80" },
    { name: "Турксибский", aqi: 118, level: "Нездоровый", color: "#ff5c4d" },
    { name: "Ауэзовский", aqi: 96, level: "Умеренный", color: "#ff9f3d" },
    { name: "Наурызбайский", aqi: 71, level: "Умеренный", color: "#ff9f3d" },
  ];

  const recommendations = [
    "Временные ограничения движения на Рыскулова (08:00–10:00)",
    "Увеличить частоту поливочных машин в Алатауском районе",
    "Предупреждение для жителей: использовать маски на улице",
    "Проверить выбросы ТЭЦ-2 сверх нормативов",
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-section-stack">
        <SectionHeading
          title="Индекс по районам"
          help="Сводка по качеству воздуха в Алматы: общий AQI города и состояние по районам."
        />
        <div className="scm-aq-header-grid">
          <div className="scm-aq-gauge">
            <div className="scm-aq-dial">
              <strong>112</strong>
              <span>AQI Алматы</span>
            </div>
            <div className="scm-aq-status" style={{ color: "#ff9f3d" }}>Нездоровый для уязвимых</div>
          </div>
          <div className="scm-district-grid">
            {districts.map((d) => (
              <div className="scm-district-card" key={d.name}>
                <div className="scm-district-bar-wrap">
                  <div
                    className="scm-district-bar"
                    style={{ width: `${Math.min(100, d.aqi / 2)}%`, background: d.color }}
                  />
                </div>
                <div className="scm-district-info">
                  <span>{d.name}</span>
                  <strong style={{ color: d.color }}>{d.aqi}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="scm-reco-section">
        <div className="scm-title-row">
          <h3 className="scm-reco-title">🏛️ Рекомендации для государства</h3>
          <HelpHint text="Короткие действия для акимата и городских служб: что можно сделать прямо сейчас, чтобы снизить нагрузку на воздух." />
        </div>
        <div className="scm-reco-list">
          {recommendations.map((r, i) => (
            <div className="scm-reco-item" key={i}>
              <span className="scm-reco-num">{i + 1}</span>
              <p>{r}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Risk Workflow Panel ─────────────────────────────────────────────────────────
function RiskWorkflowPanel() {
  const zones = [
    { name: "Бостандык", load: 96, trend: "Исполнение" },
    { name: "Алатау", load: 91, trend: "Проверка" },
    { name: "Турксиб", load: 82, trend: "Разбор" },
    { name: "Медеу", load: 64, trend: "Наблюдение" },
  ];
  const kpis = [
    { label: "В очереди", value: "6", color: "#b289ff", help: "Сколько кейсов сейчас ждут решения в risk queue." },
    { label: "Красных кейсов", value: "3", color: "#ff5c4d", help: "Количество самых приоритетных кейсов, которые требуют немедленной реакции." },
    { label: "Средний SLA", value: "1.8ч", color: "#ff9f3d", help: "Среднее время, за которое кейс должен быть обработан по текущему сценарию." },
    { label: "Отчётов готово", value: "2", color: "#47a6ff", help: "Сколько кейсов уже доведено до итогового отчёта." },
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {kpis.map((k) => (
          <div className="scm-kpi-card" key={k.label} style={{ "--kpi-color": k.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{k.label}</span>
              <HelpHint text={k.help} />
            </div>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Очередь по районам"
          help="Распределение приоритетов по районам: где исполнение уже перегрето, а где кейс ещё в наблюдении."
        />
        <div className="scm-energy-grid">
          {zones.map((z) => (
            <div className="scm-energy-card" key={z.name}>
              <div className="scm-energy-header">
                <span>{z.name}</span>
                <span className="scm-trend scm-trend-up">
                  {z.trend}
                </span>
              </div>
              <div className="scm-energy-bar-wrap">
                <div
                  className="scm-energy-bar"
                  style={{
                    width: `${z.load}%`,
                    background: z.load > 85 ? "#ff5c4d" : z.load > 70 ? "#ff9f3d" : "#b289ff",
                  }}
                />
              </div>
              <strong>{z.load}%</strong>
            </div>
          ))}
        </div>
      </div>

      <InfoCard
        title="Incident workflow"
        desc="Логика модуля: сигнал → risk queue → incident → задачи → отчёт. Это отдельный самостоятельный контур для demo и презентации."
        icon="◇"
        color="#b289ff"
        help="Смысл модуля не в красивом графике, а в завершённом operational workflow от сигнала до отчёта."
      />
    </div>
  );
}

// ─── Forecast Center Panel ───────────────────────────────────────────────────────
function ForecastCenterPanel() {
  const trucks = [
    { id: "18:00–20:00", status: "Пик трафика", district: "Центр", fill: 86 },
    { id: "20:00–22:00", status: "Порог по энергетике", district: "Юг", fill: 91 },
    { id: "06:00–09:00", status: "Инверсия AQI", district: "Алатау", fill: 73 },
    { id: "09:00–11:00", status: "Нормализация", district: "Север", fill: 42 },
  ];
  const kpis = [
    { label: "Окон риска", value: "4", color: "#58c5ff", help: "Сколько временных окон система выделила как рискованные на ближайшем горизонте." },
    { label: "Сценариев", value: "12", color: "#47a6ff", help: "Сколько вариантов развития ситуации просчитано в demo-срезе." },
    { label: "Резерв нужен", value: "2 зоны", color: "#ff9f3d", help: "Где городу стоит заранее подготовить дополнительный ресурс." },
    { label: "Точность", value: "89%", color: "#4ade80", help: "Оценка качества forecast-модуля на историческом mock-наборе." },
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {kpis.map((k) => (
          <div className="scm-kpi-card" key={k.label} style={{ "--kpi-color": k.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{k.label}</span>
              <HelpHint text={k.help} />
            </div>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Окна прогноза"
          help="Прогнозные окна показывают, когда и где город может выйти из нормы и куда нужно заранее направить ресурс."
        />
        <div className="scm-truck-list">
          {trucks.map((t) => (
            <div className="scm-truck-row" key={t.id}>
              <div className="scm-truck-id">△ {t.id}</div>
              <div className="scm-truck-info">
                <span>{t.district}</span>
                <strong>{t.status}</strong>
              </div>
              <div className="scm-truck-fill">
                <div className="scm-fill-bar-wrap">
                  <div
                    className="scm-fill-bar"
                    style={{
                      width: `${t.fill}%`,
                      background: t.fill > 90 ? "#ff5c4d" : t.fill > 60 ? "#ff9f3d" : "#34d399",
                    }}
                  />
                </div>
                <span>{t.fill}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <InfoCard
        title="Forecast center"
        desc="Модуль построен как отдельный сценарный слой: где город выйдет из нормы через час и куда заранее направить ресурс."
        icon="△"
        color="#58c5ff"
        help="Прогноз нужен не ради графика, а чтобы власти действовали до перегруза, а не после."
      />
    </div>
  );
}

// ─── Report Studio Panel ─────────────────────────────────────────────────────────
function ReportStudioPanel() {
  const zones = [
    { name: "Поля инцидента", risk: "96%", level: 96, color: "#ffd05a" },
    { name: "Геокодинг", risk: "94%", level: 94, color: "#47a6ff" },
    { name: "Согласованность SLA", risk: "89%", level: 89, color: "#ff9f3d" },
    { name: "Покрытие данных", risk: "92%", level: 92, color: "#4ade80" },
  ];
  const kpis = [
    { label: "Готовых пакетов", value: "3", color: "#ffd05a", help: "Сколько пакетов уже собрано в формат, пригодный для отправки или показа." },
    { label: "Проверок качества", value: "4", color: "#47a6ff", help: "Сколько quality-check стадий проходит пакет перед экспортом." },
    { label: "Экспортов", value: "PDF / DOCX", color: "#ff9f3d", help: "Какие форматы выходного отчёта сейчас подготовлены в demo." },
    { label: "Готовность", value: "92%", color: "#4ade80", help: "Насколько пакет данных заполнен и пригоден к выпуску." },
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {kpis.map((k) => (
          <div className="scm-kpi-card" key={k.label} style={{ "--kpi-color": k.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{k.label}</span>
              <HelpHint text={k.help} />
            </div>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Контроль пакета"
          help="Здесь видно, насколько отчётный пакет заполнен, согласован и готов к экспорту без ручной доработки."
        />
        <div className="scm-flood-zones">
          {zones.map((z) => (
            <div className="scm-flood-zone" key={z.name}>
              <div className="scm-flood-zone-header">
                <span>▣ {z.name}</span>
                <span className="scm-flood-risk-badge" style={{ color: z.color, borderColor: z.color + "44", background: z.color + "11" }}>
                  {z.risk}
                </span>
              </div>
              <div className="scm-flood-bar-wrap">
                <div className="scm-flood-bar" style={{ width: `${z.level}%`, background: z.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <InfoCard
        title="Report studio"
        desc="Отдельный модуль генерации выходов для штаба, акимата и архива: отчёт, качество набора и экспорт в готовом виде."
        icon="▣"
        color="#ffd05a"
        help="Финальный слой demo-loop: инцидент должен заканчиваться не только карточкой, но и готовым выходным документом."
      />
    </div>
  );
}

// ─── Shared components ───────────────────────────────────────────────────────────
function HelpHint({ text }: { text: string }) {
  return (
    <span
      aria-label={text}
      className="scm-help"
      data-help={text}
      role="note"
      tabIndex={0}
    >
      ?
    </span>
  );
}

function SectionHeading({ title, help }: { title: string; help: string }) {
  return (
    <div className="scm-section-heading">
      <h3>{title}</h3>
      <HelpHint text={help} />
    </div>
  );
}

function InfoCard({
  title,
  desc,
  icon,
  color,
  help,
}: {
  title: string;
  desc: string;
  icon: string;
  color: string;
  help?: string;
}) {
  return (
    <div className="scm-info-card" style={{ "--card-color": color } as CSSProperties}>
      <span className="scm-info-icon">{icon}</span>
      <div className="scm-info-card-body">
        <div className="scm-info-title-row">
          <strong>{title}</strong>
          {help ? <HelpHint text={help} /> : null}
        </div>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function DemoMapPlaceholder() {
  return (
    <div className="scm-map-placeholder">
      <div className="scm-map-grid-lines" />
      {[
        { top: "30%", left: "45%", color: "#ff5c4d" },
        { top: "55%", left: "30%", color: "#ff9f3d" },
        { top: "48%", left: "65%", color: "#47a6ff" },
      ].map((dot, i) => (
        <div key={i} className="scm-map-dot" style={{ top: dot.top, left: dot.left, background: dot.color }} />
      ))}
      <div className="scm-map-placeholder-label">Алматы · Спутниковый снимок CH₄</div>
    </div>
  );
}
