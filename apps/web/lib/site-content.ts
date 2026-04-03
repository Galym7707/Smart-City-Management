import { type Anomaly, type Incident } from "./dashboard-types";

export type StepId = "signal" | "incident" | "verification" | "report";
export type ThemeMode = "day" | "night";
export type Locale = "en" | "ru";
export type NavTarget = StepId | "faq";

export const stepOrder: StepId[] = ["signal", "incident", "verification", "report"];

type CopyShape = {
  brand: string;
  tagline: string;
  nav: Record<StepId | "faq", string>;
  controls: {
    language: string;
    theme: string;
  };
  status: {
    loading: string;
    api: string;
    fallback: string;
    apiNote: string;
    fallbackNote: string;
  };
  stats: {
    signal: string;
    impact: string;
    workflow: string;
  };
  summary: {
    confidence: string;
    coordinates: string;
    detected: string;
    facility: string;
    generated: string;
    nearestAddress: string;
    nearestLandmark: string;
    noReport: string;
    owner: string;
    priority: string;
    progress: string;
    recommendation: string;
    region: string;
    reportSections: string;
    screening: string;
    tasks: string;
    verificationArea: string;
    window: string;
  };
  steps: Record<
    StepId,
    {
      eyebrow: string;
      title: string;
      subtitle: string;
    }
  >;
  panels: {
    assets: string;
    incidentNarrative: string;
    map: string;
    noIncident: string;
    noIncidentHint: string;
    noReportHint: string;
  };
  actions: {
    backToSignal: string;
    completed: string;
    downloadPdf: string;
    downloadWord: string;
    exporting: string;
    generateReport: string;
    generating: string;
    markDone: string;
    openIncident: string;
    openVerification: string;
    printView: string;
    promote: string;
    promoting: string;
    reviewAnother: string;
    saving: string;
  };
  errors: {
    export: string;
  };
  help: {
    confidence: string;
    coordinates: string;
    createIncidentAction: string;
    detected: string;
    impact: string;
    map: string;
    nearestAddress: string;
    nearestLandmark: string;
    openIncidentAction: string;
    score: string;
    severityCheck: string;
    severityUrgent: string;
    severityWatch: string;
    syncEvidence: string;
    verificationArea: string;
  };
  faq: {
    title: string;
    intro: string;
    items: Array<{
      id: string;
      question: string;
      answer: string[];
    }>;
  };
  footer: {
    note: string;
  };
};

export const copy: Record<Locale, CopyShape> = {
  en: {
    brand: "Smart City Dashboard",
    tagline: "Clear risk queue, incidents, tasks, and reports.",
    nav: {
      signal: "Risk queue",
      incident: "Incident",
      verification: "Tasks",
      report: "Report",
      faq: "FAQ",
    },
    controls: {
      language: "Switch language",
      theme: "Switch theme",
    },
    status: {
      loading: "Loading",
      api: "System connected",
      fallback: "Demo mode",
      apiNote: "The page is connected to the local backend and can refresh the queue.",
      fallbackNote: "The backend is unavailable. Stable demo data remains visible.",
    },
    stats: {
      signal: "Selected risk",
      impact: "Estimated impact",
      workflow: "Workflow state",
    },
    summary: {
      confidence: "Confidence",
      coordinates: "Coordinates",
      detected: "Observed",
      facility: "Object type",
      generated: "Generated",
      nearestAddress: "Nearest address",
      nearestLandmark: "Nearest landmark",
      noReport: "Report not generated yet",
      owner: "Owner",
      priority: "Priority",
      progress: "Progress",
      recommendation: "Recommended action",
      region: "Region",
      reportSections: "Report sections",
      screening: "Screening review",
      tasks: "Verification tasks",
      verificationArea: "Verification area",
      window: "Response window",
    },
    steps: {
      signal: {
        eyebrow: "Step 1",
        title: "Selected risk",
        subtitle: "Review the strongest facts first.",
      },
      incident: {
        eyebrow: "Step 2",
        title: "Incident",
        subtitle: "Assign ownership and lock the next action.",
      },
      verification: {
        eyebrow: "Step 3",
        title: "Tasks",
        subtitle: "Track who is doing what and how quickly.",
      },
      report: {
        eyebrow: "Step 4",
        title: "Report",
        subtitle: "Prepare a clear management-facing export.",
      },
    },
    panels: {
      assets: "Selected object",
      incidentNarrative: "Why this incident matters",
      map: "Map",
      noIncident: "No incident opened yet",
      noIncidentHint: "Create an incident from the queue to unlock tasks and reporting.",
      noReportHint: "Generate the report after the verification plan is ready.",
    },
    actions: {
      backToSignal: "Back to queue",
      completed: "Completed",
      downloadPdf: "Download PDF",
      downloadWord: "Download Word",
      exporting: "Exporting...",
      generateReport: "Generate report",
      generating: "Generating...",
      markDone: "Mark done",
      openIncident: "Open incident",
      openVerification: "Open tasks",
      printView: "Open print view",
      promote: "Create incident",
      promoting: "Creating...",
      reviewAnother: "Review another risk",
      saving: "Saving...",
    },
    errors: {
      export: "Report export failed. The preview is still available.",
    },
    help: {
      confidence: "Confidence shows how stable and defensible the signal looks across available observations.",
      coordinates: "These coordinates mark the center of the suspected zone, not a proven exact source.",
      createIncidentAction: "Use this button when the signal is strong enough to move into accountable work.",
      detected: "This is the timestamp of the latest observation used on the page.",
      impact: "This block helps compare which case deserves faster attention.",
      map: "The map shows where the queue sits geographically. It is context, not final attribution.",
      nearestAddress: "This address is a route-planning hint near the hotspot center.",
      nearestLandmark: "This landmark helps field teams navigate faster.",
      openIncidentAction: "Open the already created incident to continue the workflow.",
      score: "The score ranks the queue from strongest to weaker cases.",
      severityCheck: "Review soon, but it is not the top emergency on the page.",
      severityUrgent: "Highest-priority case in the current queue.",
      severityWatch: "Keep visible and compare with the next refresh before escalating.",
      syncEvidence: "Refresh the latest screening evidence before making a decision.",
      verificationArea: "This is the practical field area around the hotspot, not a precise leak point.",
    },
    faq: {
      title: "FAQ",
      intro: "Open a question to see the answer.",
      items: [
        {
          id: "goal",
          question: "What does this dashboard do?",
          answer: [
            "It turns a signal on the map into a short risk queue, an accountable incident, verification tasks, and a management-facing report.",
            "The goal is not to drown the user in raw data, but to show what is happening, how serious it is, and what to do next.",
          ],
        },
        {
          id: "queue",
          question: "Why is the queue short?",
          answer: [
            "A short queue is easier for a government or operations team to act on during a live review.",
            "This product deliberately ranks cases instead of showing every possible signal equally.",
          ],
        },
        {
          id: "map",
          question: "Does the map show the exact source?",
          answer: [
            "No. The map gives geographic context for a suspected zone and helps route the next check.",
            "The final source still requires operational verification.",
          ],
        },
        {
          id: "report",
          question: "What is in the report?",
          answer: [
            "The report captures the finding, owner, task progress, and the next recommended step.",
            "It is designed to support management review, internal coordination, and external reporting.",
          ],
        },
      ],
    },
    footer: {
      note: "Hackathon MVP. Current connected module: ecology and incident response.",
    },
  },
  ru: {
    brand: "Контроль MRV",
    tagline: "CH4 и flare",
    nav: {
      signal: "Очередь рисков",
      incident: "Инцидент",
      verification: "Задачи",
      report: "Отчёт",
      faq: "ЧАВО",
    },
    controls: {
      language: "Сменить язык",
      theme: "Сменить тему",
    },
    status: {
      loading: "Загрузка",
      api: "Онлайн",
      fallback: "Ограниченный режим",
      apiNote: "Данные доступны и обновляются.",
      fallbackNote: "Показана последняя доступная версия данных.",
    },
    stats: {
      signal: "Выбранный риск",
      impact: "Оценка воздействия",
      workflow: "Состояние процесса",
    },
    summary: {
      confidence: "Уверенность",
      coordinates: "Координаты",
      detected: "Наблюдение",
      facility: "Тип объекта",
      generated: "Сформирован",
      nearestAddress: "Ближайший адрес",
      nearestLandmark: "Ближайший ориентир",
      noReport: "Отчёт ещё не сформирован",
      owner: "Ответственный",
      priority: "Приоритет",
      progress: "Прогресс",
      recommendation: "Рекомендуемое действие",
      region: "Регион",
      reportSections: "Разделы отчёта",
      screening: "Первичный разбор",
      tasks: "Задачи проверки",
      verificationArea: "Район проверки",
      window: "Срок реакции",
    },
    steps: {
      signal: {
        eyebrow: "Шаг 1",
        title: "Выбранный риск",
        subtitle: "Факты и карта.",
      },
      incident: {
        eyebrow: "Шаг 2",
        title: "Инцидент",
        subtitle: "Ответственный и срок.",
      },
      verification: {
        eyebrow: "Шаг 3",
        title: "Задачи",
        subtitle: "Статус выполнения.",
      },
      report: {
        eyebrow: "Шаг 4",
        title: "Отчёт",
        subtitle: "Готовый документ.",
      },
    },
    panels: {
      assets: "Выбранный объект",
      incidentNarrative: "Почему этот кейс важен",
      map: "Карта",
      noIncident: "Инцидент ещё не открыт",
      noIncidentHint: "Откройте кейс из очереди.",
      noReportHint: "Сформируйте отчёт.",
    },
    actions: {
      backToSignal: "Назад к очереди",
      completed: "Выполнено",
      downloadPdf: "Скачать PDF",
      downloadWord: "Скачать Word",
      exporting: "Экспортируем...",
      generateReport: "Сформировать отчёт",
      generating: "Формируем...",
      markDone: "Отметить выполненным",
      openIncident: "Открыть инцидент",
      openVerification: "Перейти к задачам",
      printView: "Открыть версию для печати",
      promote: "Создать инцидент",
      promoting: "Создаём...",
      reviewAnother: "Разобрать другой риск",
      saving: "Сохраняем...",
    },
    errors: {
      export: "Не удалось выгрузить отчёт. Предпросмотр остаётся доступным.",
    },
    help: {
      confidence: "Показатель помогает понять, насколько сигнал выглядит устойчивым по доступным наблюдениям.",
      coordinates: "Это центр предполагаемой проблемной зоны, а не доказанный точный источник.",
      createIncidentAction: "Используйте кнопку, когда сигнал уже достаточно сильный, чтобы перевести его в рабочий инцидент.",
      detected: "Здесь показано время последнего наблюдения, на котором основан текущий риск.",
      impact: "Этот блок помогает быстро понять, какой кейс требует большего внимания штаба или операционной команды.",
      map: "Карта показывает географический контекст и помогает привязать риск к территории. Это не окончательная атрибуция источника.",
      nearestAddress: "Это ближайший адрес рядом с центром зоны. Используйте его как навигационную подсказку.",
      nearestLandmark: "Это ближайший ориентир, который помогает быстрее вывести команду в нужный район.",
      openIncidentAction: "Открывает уже созданный инцидент, чтобы продолжить процесс без повторного выбора.",
      score: "Скор показывает место кейса в очереди рисков. Чем выше значение, тем быстрее его стоит разобрать.",
      severityCheck: "Кейс требует скорой проверки, но это не самый срочный риск на странице.",
      severityUrgent: "Это самый приоритетный кейс в текущей очереди.",
      severityWatch: "Кейс пока слабее остальных. Его стоит держать на контроле и сверить с новым обновлением.",
      syncEvidence: "Обновляет последние данные перед тем, как принимать решение по кейсу.",
      verificationArea: "Это практический район выездной проверки вокруг зоны, а не точка точного источника.",
    },
    faq: {
      title: "ЧАВО",
      intro: "",
      items: [
        {
          id: "goal",
          question: "Что делает эта панель?",
          answer: [
            "Он превращает сигнал на карте в короткую очередь рисков, рабочий инцидент, задачи проверки и готовый отчёт.",
            "Логика специально сделана простой для руководителя: что происходит, насколько это критично и что делать дальше.",
          ],
        },
        {
          id: "queue",
          question: "Почему очередь рисков короткая, а не бесконечная?",
          answer: [
            "Короткая очередь быстрее читается и лучше подходит для управленческого решения во время демо или оперативного разбора.",
            "Система специально ранжирует случаи, а не пытается одинаково показать все сигналы сразу.",
          ],
        },
        {
          id: "map",
          question: "Карта показывает точный источник проблемы?",
          answer: [
            "Нет. Карта показывает проблемную зону и её контекст, чтобы команде было проще сориентироваться.",
            "Точный источник всё равно требует отдельной проверки и подтверждения на месте.",
          ],
        },
        {
          id: "workflow",
          question: "Зачем нужен контур работы с инцидентом?",
          answer: [
            "Он делает панель не просто экраном с графиками, а рабочим инструментом: у кейса появляется владелец, срок реакции и список задач.",
            "Именно это отличает полезный управленческий продукт от красивой, но пассивной визуализации.",
          ],
        },
        {
          id: "report",
          question: "Что попадает в отчёт?",
          answer: [
            "Отчёт собирает суть сигнала, владельца кейса, прогресс задач и следующий рекомендуемый шаг.",
            "Его можно использовать для внутреннего управления, демонстрации жюри и внешней отчётности.",
          ],
        },
      ],
    },
    footer: {
      note: "Казахстан",
    },
  },
};

export const incidentStatusLabel: Record<Locale, Record<Incident["status"], string>> = {
  en: {
    triage: "Needs triage",
    verification: "In verification",
    mitigation: "Mitigation",
  },
  ru: {
    triage: "Нужна оценка",
    verification: "Идёт проверка",
    mitigation: "Реагирование",
  },
};

export const severityTone: Record<Anomaly["severity"], string> = {
  high: "severity-high",
  medium: "severity-medium",
  watch: "severity-watch",
};

export const severityLabel: Record<Locale, Record<Anomaly["severity"], string>> = {
  en: {
    high: "Urgent",
    medium: "Check",
    watch: "Watch",
  },
  ru: {
    high: "Критично",
    medium: "Проверить",
    watch: "Наблюдение",
  },
};

const REGION_TRANSLATIONS = {
  "Atyrau Region": "Атырауская область",
  "Mangystau Region": "Мангистауская область",
  "Aktobe Region": "Актюбинская область",
  "West Kazakhstan Region": "Западно-Казахстанская область",
  "Kyzylorda Region": "Кызылординская область",
  "Pavlodar Region": "Павлодарская область",
  "Akmola Region": "Акмолинская область",
  "Almaty Region": "Алматинская область",
  "Almaty City": "Алматы",
  "Karaganda Region": "Карагандинская область",
  "Kostanay Region": "Костанайская область",
  "North Kazakhstan Region": "Северо-Казахстанская область",
  "East Kazakhstan Region": "Восточно-Казахстанская область",
  "Turkistan Region": "Туркестанская область",
  "Zhambyl Region": "Жамбылская область",
  "Ulytau Region": "область Улытау",
  Kazakhstan: "Казахстан",
} satisfies Record<string, string>;

const PLACE_TRANSLATIONS = {
  "Makat District": "Макатский район",
  "Zhanybek District": "Жанибекский район",
  "Martuk District": "Мартукский район",
  "Martok District": "Мартукский район",
  "Bayganin District": "Байганинский район",
  "Bayğanïn District": "Байганинский район",
  "Nura District": "Нуринский район",
  Satbayev: "Сатпаев",
  "Tengiz Field": "месторождение Тенгиз",
} satisfies Record<string, string>;

const ASSET_TRANSLATIONS = {
  "Tengiz satellite cluster": "Тенгизский спутниковый кластер",
  "Karabatan processing block": "Карабатанский перерабатывающий блок",
  "Mangystau export hub": "Мангистауский экспортный узел",
  "Aktobe compressor ring": "Актюбинское компрессорное кольцо",
  "Karachaganak gas train": "Карачаганакская газовая линия",
  "Kumkol gathering node": "Кумкольский узел сбора",
  "Pavlodar refinery corridor": "Павлодарский перерабатывающий коридор",
} satisfies Record<string, string>;

const FACILITY_TRANSLATIONS = {
  "Gathering and compression": "Сбор и компримирование",
  "Processing and flare line": "Переработка и факельная линия",
  "Terminal and flare lane": "Терминал и факельная линия",
  "Methane hotspot with night thermal context": "Метановая аномалия с ночным тепловым контекстом",
  "Methane hotspot without thermal confirmation": "Метановая аномалия без теплового подтверждения",
} satisfies Record<string, string>;

const CONFIDENCE_TRANSLATIONS = {
  "High screening confidence / methane uplift plus night thermal context":
    "Высокая уверенность / рост метана подтверждён ночным тепловым контекстом",
  "High screening confidence / methane uplift without thermal confirmation":
    "Высокая уверенность / рост метана виден, но теплового подтверждения нет",
  "Medium screening confidence / uplift confirmed by nearby thermal detections":
    "Средняя уверенность / рост подтверждён ближайшими тепловыми срабатываниями",
  "Medium screening confidence / uplift above rolling baseline":
    "Средняя уверенность / рост превышает скользящий базовый уровень",
  "Watchlist / thermal context without strong methane contrast":
    "Наблюдение / есть тепловой контекст, но контраст метана пока слабый",
  "Watchlist / methane contrast remains modest in the latest valid scene":
    "Наблюдение / контраст метана в последней валидной сцене остаётся умеренным",
} satisfies Record<string, string>;

const OWNER_TRANSLATIONS = {
  "Field integrity desk": "группа полевой целостности",
  "Ops coordinator": "координатор эксплуатации",
  "Reliability engineer": "инженер по надежности",
  "ESG lead": "руководитель ESG",
  "Response lead": "ответственный за реагирование",
  "Remote sensing analyst": "аналитик дистанционного зондирования",
  "Area operations coordinator": "координатор площадки",
  "Compliance lead": "руководитель по соблюдению требований",
  "ESG desk": "команда ESG",
  "MRV response lead": "координатор MRV-реагирования",
  "Earth Engine screening": "скрининг Earth Engine",
} satisfies Record<string, string>;

const TASK_TITLE_TRANSLATIONS = {
  "Dispatch LDAR walkdown request": "Отправить запрос на LDAR-обход",
  "Cross-check flare line maintenance history": "Проверить историю обслуживания факельной линии",
  "Draft regulator-facing MRV note": "Подготовить MRV-заметку для регулятора",
  "Validate signal persistence against 12-week baseline":
    "Проверить устойчивость сигнала по базовому уровню за 12 недель",
  "Assign field verification owner": "Назначить ответственного за выездную проверку",
  "Collect operator comment": "Собрать комментарий оператора",
} satisfies Record<string, string>;

const INCIDENT_NARRATIVE_TRANSLATIONS = {
  "This incident was promoted from the live screening queue. The signal is operationally ranked, but it still requires field verification before source attribution.":
    "Инцидент создан из живой очереди рисков. Сигнал уже операционно приоритизирован, но перед точной атрибуцией источника всё ещё нужна полевая проверка.",
  "This incident was promoted directly from the anomaly queue for manual verification.":
    "Инцидент создан напрямую из очереди аномалий для ручной проверки.",
} satisfies Record<string, string>;

const EVIDENCE_SOURCE_TRANSLATIONS = {
  "Google Earth Engine / Sentinel-5P + VIIRS thermal context":
    "Google Earth Engine / Sentinel-5P + тепловой контекст VIIRS",
  "Google Earth Engine / Sentinel-5P": "Google Earth Engine / Sentinel-5P",
} satisfies Record<string, string>;

const RECOMMENDED_ACTION_TRANSLATIONS = {
  "Promote this candidate into an incident and send it to field verification. The signal is strong enough for operational review.":
    "Переведите этот кандидат в инцидент и отправьте на выездную проверку. Сигнал уже достаточно сильный для операционного разбора.",
  "Keep this candidate near the top of the queue and verify whether thermal context repeats on the next pass.":
    "Оставьте этот кейс в верхней части очереди и проверьте, повторится ли тепловой контекст на следующем проходе.",
  "Keep this candidate in the manual review queue and confirm it with the next valid CH4 scene before escalation.":
    "Оставьте эту зону в очереди ручного разбора и подтвердите её по следующей валидной сцене CH4 перед эскалацией.",
  "Keep this candidate visible as a watch item. It is useful for screening, but not strong enough for immediate escalation.":
    "Оставьте этот кейс видимым как элемент наблюдения. Он полезен для скрининга, но пока недостаточно силён для немедленной эскалации.",
  "Review the refreshed satellite comparison, then promote manually if this area still deserves operational verification.":
    "Сначала посмотрите обновлённое спутниковое сравнение, затем вручную откройте инцидент, если зона всё ещё требует операционной проверки.",
  "Retry live sync before making an operational decision from this page.":
    "Повторите живую синхронизацию до того, как принимать управленческое решение с этой страницы.",
  "Live evidence is unavailable. Retry sync before promoting a new operational case.":
    "Живые данные сейчас недоступны. Повторите синхронизацию, прежде чем открывать новый рабочий кейс.",
  "Treat the last verified screening snapshot as context only until live sync succeeds again.":
    "Используйте последний подтверждённый снимок только как контекст, пока живая синхронизация снова не отработает успешно.",
  "Use the last successful screening snapshot as context, then decide manually whether promotion still makes sense.":
    "Используйте последний успешный снимок как контекст, а затем вручную решите, есть ли смысл переводить кейс в инцидент.",
  "Refresh the live methane screening before promoting any operational case.":
    "Обновите живой methane-screening, прежде чем переводить любой кейс в рабочий инцидент.",
} satisfies Record<string, string>;

const SCREENING_CAVEAT_TRANSLATIONS = {
  "Run the first live Earth Engine sync to load methane screening for Kazakhstan.":
    "Запустите первую живую синхронизацию Earth Engine, чтобы загрузить скрининг метана по Казахстану.",
  "Earth Engine query failed.": "Запрос к Earth Engine завершился ошибкой.",
} satisfies Record<string, string>;

const PIPELINE_STATUS_MESSAGE_TRANSLATIONS = {
  "Seeded anomaly set reloaded for demo-safe playback.":
    "Демонстрационный набор аномалий заново загружен для безопасного показа.",
  "Seeded demo pipeline is active until a live sync is requested.":
    "Демонстрационный pipeline активен, пока не запрошена живая синхронизация.",
  "Earth Engine connected, but no Kazakhstan CH4 scenes were returned for the configured collection.":
    "Earth Engine подключён, но по выбранной коллекции не вернул CH4-сцены по Казахстану.",
  "Earth Engine CH4 screening summary fetched successfully.":
    "Сводка CH4 из Earth Engine успешно получена.",
} satisfies Record<string, string>;

const SCREENING_OBSERVED_WINDOW_TRANSLATIONS = {
  "Latest TROPOMI scene compared with Kazakhstan historical mean.":
    "Последняя сцена TROPOMI сопоставлена с историческим средним по Казахстану.",
} satisfies Record<string, string>;

const WINDOW_TRANSLATIONS = {
  "Next 12 hours": "в ближайшие 12 часов",
  "Next 24 hours": "в ближайшие 24 часа",
  "Next 48 hours": "в ближайшие 48 часов",
} satisfies Record<string, string>;

function translateExact(value: string, locale: Locale, dictionary: Record<string, string>) {
  if (locale === "en") return value;
  return dictionary[value] ?? value;
}

function replaceAdministrativeFragments(value: string, locale: Locale) {
  if (locale === "en") return value;

  let translated = value;
  for (const [source, target] of Object.entries({ ...PLACE_TRANSLATIONS, ...REGION_TRANSLATIONS })) {
    translated = translated.replaceAll(source, target);
  }
  return translated;
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function translateDynamicSummary(summary: string, locale: Locale) {
  if (locale === "en") return summary;

  const withThermalMatch = summary.match(
    /^Latest valid TROPOMI scene shows \+([0-9.]+) ppb \(([0-9.]+)%\) methane uplift in (.+), with (\d+) night-time VIIRS thermal detections inside a 25 km context window\.$/,
  );
  if (withThermalMatch) {
    const [, deltaPpb, deltaPct, region, hits] = withThermalMatch;
    return `Последняя валидная сцена TROPOMI показывает рост метана на ${deltaPpb} ppb (${deltaPct}%) в регионе ${translateRegion(region, locale)}. В радиусе 25 км дополнительно найдено ${hits} ночных VIIRS-срабатываний.`;
  }

  const noThermalMatch = summary.match(
    /^Latest valid TROPOMI scene shows \+([0-9.]+) ppb \(([0-9.]+)%\) methane uplift in (.+)\. No recent night-time VIIRS thermal detections were found inside a 25 km context window\.$/,
  );
  if (noThermalMatch) {
    const [, deltaPpb, deltaPct, region] = noThermalMatch;
    return `Последняя валидная сцена TROPOMI показывает рост метана на ${deltaPpb} ppb (${deltaPct}%) в регионе ${translateRegion(region, locale)}. Свежих ночных VIIRS-срабатываний в радиусе 25 км не найдено.`;
  }

  return replaceAdministrativeFragments(summary, locale);
}

function translateDynamicObservedWindow(windowLabel: string, locale: Locale) {
  if (locale === "en") return windowLabel;

  const recentSceneMatch = windowLabel.match(
    /^Most recent valid TROPOMI scene on (.+?) compared against the previous 84-day Kazakhstan baseline\.$/,
  );
  if (recentSceneMatch) {
    return `Последняя валидная сцена TROPOMI от ${recentSceneMatch[1]} сопоставлена с предыдущим 84-дневным базовым окном по Казахстану.`;
  }

  const baselineWindowMatch = windowLabel.match(
    /^84-day Kazakhstan baseline before (.+?); (\d+) recent valid scenes checked\.$/,
  );
  if (baselineWindowMatch) {
    return `84-дневный базовый уровень по Казахстану до ${baselineWindowMatch[1]}; проверено ${baselineWindowMatch[2]} недавних валидных сцен.`;
  }

  return replaceAdministrativeFragments(windowLabel, locale);
}

export function translateRegion(region: string, locale: Locale) {
  return translateExact(region, locale, REGION_TRANSLATIONS);
}

export function translateFacility(facility: string, locale: Locale) {
  return translateExact(facility, locale, FACILITY_TRANSLATIONS);
}

export function translateAssetName(assetName: string, locale: Locale) {
  const direct = translateExact(assetName, locale, ASSET_TRANSLATIONS);
  if (direct !== assetName) return direct;

  if (locale === "ru") {
    const hotspotMatch = assetName.match(/^(.+?) CH4 hotspot (\d+)$/);
    if (hotspotMatch) {
      return `CH4-очаг ${hotspotMatch[2]}, ${translateRegion(hotspotMatch[1], locale)}`;
    }
  }

  return replaceAdministrativeFragments(assetName, locale);
}

export function translateConfidence(confidence: string, locale: Locale) {
  return translateExact(confidence, locale, CONFIDENCE_TRANSLATIONS);
}

export function translateOwner(owner: string, locale: Locale) {
  return translateExact(owner, locale, OWNER_TRANSLATIONS);
}

export function translateTaskTitle(title: string, locale: Locale) {
  return translateExact(title, locale, TASK_TITLE_TRANSLATIONS);
}

export function translateIncidentNarrative(narrative: string, locale: Locale) {
  return translateExact(narrative, locale, INCIDENT_NARRATIVE_TRANSLATIONS);
}

export function translateAnomalySummary(summary: string, locale: Locale) {
  return translateDynamicSummary(summary, locale);
}

export function translateRecommendedAction(action: string, locale: Locale) {
  return translateExact(action, locale, RECOMMENDED_ACTION_TRANSLATIONS);
}

export function translateScreeningEvidenceSource(source: string, locale: Locale) {
  return translateExact(source, locale, EVIDENCE_SOURCE_TRANSLATIONS);
}

export function translateScreeningObservedWindow(windowLabel: string, locale: Locale) {
  const direct = translateExact(windowLabel, locale, SCREENING_OBSERVED_WINDOW_TRANSLATIONS);
  return direct === windowLabel ? translateDynamicObservedWindow(windowLabel, locale) : direct;
}

export function translateAdministrativeLabel(label: string, locale: Locale) {
  return replaceAdministrativeFragments(label, locale);
}

export function formatVerificationAreaLabel(
  label: string,
  region: string | null | undefined,
  locale: Locale,
) {
  const translatedArea = translateAdministrativeLabel(label, locale);
  if (!region) return translatedArea;

  const translatedRegion = translateRegion(region, locale);
  const suffix = `, ${translatedRegion}`;
  return translatedArea.endsWith(suffix)
    ? translatedArea.slice(0, -suffix.length)
    : translatedArea;
}

export function translateScreeningConfidenceNote(note: string, locale: Locale) {
  return translateConfidence(note, locale);
}

export function translateScreeningCaveat(caveat: string, locale: Locale) {
  if (locale === "ru") {
    if (caveat.startsWith("Latest observation at ")) {
      return caveat
        .replace("Latest observation at ", "Последнее наблюдение: ")
        .replace(". Project: ", ". Проект: ")
        .replace("not reported", "не указан")
        .replace(
          " No previous verified live screening snapshot is available yet.",
          " Предыдущий подтверждённый снимок пока недоступен.",
        );
    }

    if (caveat.startsWith("Project: ")) {
      return caveat.replace("Project: ", "Проект: ").replace("not reported", "не указан");
    }
  }

  return translateExact(caveat, locale, SCREENING_CAVEAT_TRANSLATIONS);
}

export function translateScreeningRecommendation(action: string, locale: Locale) {
  return translateRecommendedAction(action, locale);
}

export function translatePipelineStatusMessage(message: string, locale: Locale) {
  if (locale === "ru") {
    if (message.startsWith("Earth Engine initialization failed:")) {
      return message.replace(
        "Earth Engine initialization failed:",
        "Не удалось инициализировать Earth Engine:",
      );
    }
    if (message.startsWith("Earth Engine CH4 query failed:")) {
      return message.replace("Earth Engine CH4 query failed:", "Ошибка запроса CH4 в Earth Engine:");
    }
  }

  return translateExact(message, locale, PIPELINE_STATUS_MESSAGE_TRANSLATIONS);
}

export function translateWindow(windowLabel: string, locale: Locale) {
  return translateExact(windowLabel, locale, WINDOW_TRANSLATIONS);
}

export function formatTaskProgress(done: number, total: number, locale: Locale) {
  return locale === "ru" ? `${done} из ${total}` : `${done} of ${total}`;
}

export function formatHours(hours: number, locale: Locale) {
  return locale === "ru" ? `${hours} ч` : `${hours}h`;
}

export function formatTimestamp(value: string, locale: Locale) {
  const iso = value.replace(" ", "T");
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMetricNumber(value: number, locale: Locale) {
  return formatNumber(value, locale);
}
