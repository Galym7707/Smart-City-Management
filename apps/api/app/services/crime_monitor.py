from __future__ import annotations

from pathlib import Path

from app.models import CrimeIncident, CrimeMonitorSnapshot, CrimeRecommendation, PatrolUnit

REPO_ROOT = Path(__file__).resolve().parents[4]
CRIME_VIDEO_FILE = REPO_ROOT / "crime.MOV"

CRIME_INCIDENTS: list[CrimeIncident] = [
    CrimeIncident(
        id=1,
        name="Инцидент #1 — Драка у ТЦ",
        type="Драка",
        latitude=43.2381,
        longitude=76.9457,
        severity="critical",
        severity_label="Критическая",
        district="Бостандыкский",
        address="ул. Абая / Сейфуллина",
        observed_at="2026-04-03T23:14:00+05:00",
        time="23:14",
        description=(
            "Массовая драка с участием 4+ человек у торгового центра. "
            "Зафиксирована камерой видеонаблюдения. Видеозапись доступна для просмотра. "
            "Пострадавшие обратились в скорую помощь."
        ),
        has_video=True,
        video_path="/api/v1/crime/incidents/1/video",
        video_mime_type="video/quicktime",
        color="#dc2626",
        participants="4+",
        camera_label="Камера ТЦ / Сейфуллина",
        response_status="Видео подтверждено",
    ),
    CrimeIncident(
        id=2,
        name="Инцидент #2 — Драка в парке",
        type="Драка",
        latitude=43.2700,
        longitude=76.9620,
        severity="high",
        severity_label="Высокая",
        district="Алмалинский",
        address="Парк 28 Панфиловцев",
        observed_at="2026-04-02T22:47:00+05:00",
        time="22:47",
        description=(
            "Конфликт между двумя группами молодых людей в парке. Очевидцы вызвали полицию. "
            "Камеры парка зафиксировали начало конфликта, но запись на сервере муниципалитета, "
            "ожидается получение."
        ),
        has_video=False,
        video_path=None,
        video_mime_type=None,
        color="#f97316",
        participants="3",
        camera_label="Парк 28 Панфиловцев",
        response_status="Видео на запросе",
    ),
    CrimeIncident(
        id=3,
        name="Инцидент #3 — Конфликт у бара",
        type="Драка",
        latitude=43.2556,
        longitude=76.8732,
        severity="high",
        severity_label="Высокая",
        district="Ауэзовский",
        address="ул. Жандосова, 58",
        observed_at="2026-04-01T01:32:00+05:00",
        time="01:32",
        description=(
            "Драка у ночного заведения. Два участника, один получил лёгкие телесные повреждения. "
            "Наряд полиции прибыл через 8 минут. Видеозапись с камеры заведения запрошена."
        ),
        has_video=False,
        video_path=None,
        video_mime_type=None,
        color="#f97316",
        participants="2",
        camera_label="Бар / Жандосова",
        response_status="Видео на запросе",
    ),
    CrimeIncident(
        id=4,
        name="Инцидент #4 — Драка на остановке",
        type="Драка",
        latitude=43.2180,
        longitude=76.8980,
        severity="medium",
        severity_label="Средняя",
        district="Медеуский",
        address="пр. Достык, 105",
        observed_at="2026-03-31T19:15:00+05:00",
        time="19:15",
        description=(
            "Словесный конфликт, перешедший в физическое столкновение на автобусной остановке. "
            "Два участника разняты прохожими до приезда полиции. Видеозапись отсутствует."
        ),
        has_video=False,
        video_path=None,
        video_mime_type=None,
        color="#f59e0b",
        participants="2",
        camera_label="Остановка / Достык",
        response_status="Видео отсутствует",
    ),
    CrimeIncident(
        id=5,
        name="Инцидент #5 — Драка у метро",
        type="Драка",
        latitude=43.2495,
        longitude=76.9170,
        severity="medium",
        severity_label="Средняя",
        district="Медеуский",
        address="ст. метро Абая",
        observed_at="2026-03-30T20:40:00+05:00",
        time="20:40",
        description=(
            "Конфликт между двумя мужчинами у входа в метро. Охрана метрополитена вмешалась. "
            "Записи камер метрополитена на запросе у управления транспорта."
        ),
        has_video=False,
        video_path=None,
        video_mime_type=None,
        color="#f59e0b",
        participants="2",
        camera_label="Метро Абая",
        response_status="Видео на запросе",
    ),
]

PATROL_UNITS: list[PatrolUnit] = [
    PatrolUnit(
        id="A-17",
        name="Экипаж А-17",
        role="Группа быстрого реагирования",
        status="available",
        status_label="Свободен",
    ),
    PatrolUnit(
        id="B-04",
        name="Экипаж Б-04",
        role="Патрульная полиция",
        status="responding",
        status_label="На вызове",
    ),
    PatrolUnit(
        id="V-12",
        name="Экипаж В-12",
        role="Участковый патруль",
        status="available",
        status_label="Свободен",
    ),
    PatrolUnit(
        id="M-02",
        name="Мотогруппа М-02",
        role="Оперативный отряд",
        status="busy",
        status_label="Занят",
    ),
]

RECOMMENDATIONS: list[CrimeRecommendation] = [
    CrimeRecommendation(
        id="dispatch",
        level="critical",
        title="Срочное реагирование",
        body=(
            "Есть инцидент с подтверждённым видео в районе ул. Сейфуллина. "
            "Приоритет: быстрый выезд патруля и фиксация доказательной базы."
        ),
        priority_pct=92,
    ),
    CrimeRecommendation(
        id="patrol",
        level="warning",
        title="Усилить патрулирование",
        body=(
            "Алмалинский и Ауэзовский контуры уже дали сигналы. "
            "На вечернее окно стоит усилить пешее и мобильное патрулирование."
        ),
        priority_pct=None,
    ),
    CrimeRecommendation(
        id="prevention",
        level="info",
        title="Профилактический обход",
        body=(
            "По Медеускому району incidents не критические, но повторяются. "
            "Нужен обход и проверка качества камер по транспортным узлам."
        ),
        priority_pct=None,
    ),
]


def get_crime_snapshot() -> CrimeMonitorSnapshot:
    incidents = [
        incident.model_copy(
            update={
                "video_path": (
                    incident.video_path
                    if incident.has_video and CRIME_VIDEO_FILE.exists()
                    else None
                ),
            }
        )
        for incident in CRIME_INCIDENTS
    ]
    video_incidents = sum(1 for incident in incidents if incident.video_path)

    return CrimeMonitorSnapshot(
        city="Алматы",
        source_label="CrimeWatch KZ / CCTV incidents",
        updated_at=max(incident.observed_at for incident in incidents),
        coverage_zones=5,
        weekly_delta=3,
        night_risk_share_pct=68,
        peak_window="22:00 — 03:00",
        available_video_incidents=video_incidents,
        incidents=incidents,
        patrol_units=PATROL_UNITS,
        recommendations=RECOMMENDATIONS,
    )


def get_crime_incident(incident_id: int) -> CrimeIncident | None:
    snapshot = get_crime_snapshot()
    for incident in snapshot.incidents:
        if incident.id == incident_id:
            return incident
    return None


def get_crime_video_path(incident_id: int) -> Path | None:
    incident = get_crime_incident(incident_id)
    if not incident or not incident.video_path or not CRIME_VIDEO_FILE.exists():
        return None
    return CRIME_VIDEO_FILE
