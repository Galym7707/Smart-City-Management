---
sdk: docker
app_port: 7860
fullWidth: true
---

# Smart City Management

Кратко: это hackathon MVP веб-платформы для городского штаба и акимата Алматы. Проект объединяет визуальный command center на Next.js, operational workflow для кейсов и отчётов, а также AI-сводку в правой панели.

## Что показывает продукт

Текущий frontend собирает 6 пользовательских модулей на одном экране:

1. `CH4 карта` — спутниковый контур аномалий и зон для проверки.
2. `Computer Vision ДТП` — demo-панель по авариям и нагрузке на дороги.
3. `Воздух Алматы` — AQI, качество воздуха по районам и рекомендации для города.
4. `Очередь рисков` — signal-to-incident workflow.
5. `Прогноз города` — forecast-окна и сценарная нагрузка.
6. `Отчёты и качество` — контроль пакета и подготовка выходного отчёта.

Справа работает `AI Summary rail`: краткая интерпретация ситуации, уровень срочности, связь с другими модулями и рекомендуемые действия. Для AI-панели в web-приложении есть server route под Gemini API.

## Базовый workflow

В репозитории сохранён операционный контур, который лежит в основе demo:

`сигнал / anomaly -> risk queue -> incident -> tasks -> report`

На backend это выражено через API для:

- dashboard и activity feed
- списка аномалий и инцидентов
- продвижения аномалии в incident
- создания и закрытия задач
- генерации и экспорта отчёта в `html / pdf / docx`
- статуса и истории pipeline sync

## Стек

- Frontend: `Next.js`, `React`, `TypeScript`, `MapLibre`
- Backend: `FastAPI`, `Pydantic`, `SQLAlchemy`, `APScheduler`
- База данных: `PostgreSQL/PostGIS` или локальный `SQLite` fallback
- Экспорт отчётов: `python-docx`, `reportlab`
- Container runtime: `Docker`

## Структура репозитория

- `apps/web` — Next.js frontend и UI command center
- `apps/web/app/api/ai-assistant/route.ts` — server route для AI-сводки
- `apps/api` — FastAPI backend с workflow, pipeline и export
- `Dockerfile` — сборка frontend + backend в один контейнер на порт `7860`

## Локальный запуск

Frontend:

```bash
npm install
npm run dev:web
```

Backend:

```bash
pip install -e ./apps/api
uvicorn app.main:app --app-dir apps/api --reload
```

Build frontend:

```bash
npm run build:web
```

## Docker / Hugging Face Space

Репозиторий подготовлен под Docker-рантайм:

- сначала собирается static export frontend
- затем FastAPI поднимает backend и, если экспорт frontend существует, монтирует его на `/`
- контейнер слушает порт `7860`

## Переменные окружения

По коду сейчас используются или поддерживаются такие ключи:

- `DATABASE_URL` — если не задан, backend падает обратно на локальный SQLite-файл
- `STATIC_EXPORT_DIR` — путь до экспортированного frontend для монтирования через FastAPI
- `GEMINI_API_KEY` — ключ для AI summary route
- `GEMINI_MODEL` — модель Gemini, по умолчанию route использует `gemini-2.5-flash`

## Статус проекта

Это demo-oriented MVP для хакатона: упор сделан на понятный экран, operational workflow и экспортируемый результат, а не на тяжёлую enterprise-интеграцию.
