// ===== CONFIG =====
const API_URL = 'https://api.air.org.kz/api/city/average';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ===== AQI HELPERS =====
function getAqiLevel(aqi) {
    if (aqi <= 50) return { level: 'good', label: 'Хорошо', color: '#00b894' };
    if (aqi <= 100) return { level: 'moderate', label: 'Умеренно', color: '#fdcb6e' };
    if (aqi <= 150) return { level: 'sensitive', label: 'Вредно для чувствительных групп', color: '#e17055' };
    if (aqi <= 200) return { level: 'unhealthy', label: 'Вредно для здоровья', color: '#d63031' };
    if (aqi <= 300) return { level: 'very-unhealthy', label: 'Очень вредно', color: '#6c5ce7' };
    return { level: 'hazardous', label: 'Опасно', color: '#2d1f4e' };
}

function getPmStatus(value, type) {
    const limits = type === 'pm25'
        ? [12, 35.4, 55.4, 150.4]
        : [54, 154, 254, 354];
    const labels = ['good', 'moderate', 'sensitive', 'unhealthy'];
    const textLabels = ['Норма', 'Умеренно', 'Повышено', 'Опасно'];

    for (let i = 0; i < limits.length; i++) {
        if (value <= limits[i]) return { cls: labels[i], text: textLabels[i] };
    }
    return { cls: 'unhealthy', text: 'Опасно' };
}

function getRecommendations(data) {
    const aqi = data.aqi_avg;
    const recs = [];

    if (aqi <= 50) {
        recs.push({
            icon: 'ri-run-fill',
            title: 'Активности на улице',
            desc: 'Воздух чистый. Отличное время для прогулок и занятий спортом на свежем воздухе.'
        });
        recs.push({
            icon: 'ri-window-fill',
            title: 'Проветривание',
            desc: 'Рекомендуется проветрить помещения для обновления воздуха.'
        });
    } else if (aqi <= 100) {
        recs.push({
            icon: 'ri-walk-fill',
            title: 'Умеренная активность',
            desc: 'Качество воздуха приемлемое. Чувствительным людям стоит ограничить длительные нагрузки.'
        });
        recs.push({
            icon: 'ri-surgical-mask-fill',
            title: 'Маска для чувствительных',
            desc: 'Людям с астмой и аллергией рекомендуется использовать маску при длительном пребывании на улице.'
        });
        recs.push({
            icon: 'ri-home-4-fill',
            title: 'Очиститель воздуха',
            desc: 'Включите очиститель воздуха дома, особенно если PM2.5 выше нормы ВОЗ (15 μg/m³).'
        });
    } else if (aqi <= 150) {
        recs.push({
            icon: 'ri-alarm-warning-fill',
            title: 'Ограничьте пребывание на улице',
            desc: 'Сократите время на улице. Чувствительные группы должны оставаться в помещении.'
        });
        recs.push({
            icon: 'ri-surgical-mask-fill',
            title: 'Используйте маску N95',
            desc: 'При необходимости выхода наденьте маску N95/FFP2 для защиты от мелких частиц.'
        });
        recs.push({
            icon: 'ri-window-fill',
            title: 'Закройте окна',
            desc: 'Держите окна закрытыми и используйте кондиционер с фильтром или очиститель воздуха.'
        });
    } else {
        recs.push({
            icon: 'ri-error-warning-fill',
            title: 'Оставайтесь в помещении',
            desc: 'Качество воздуха опасное. Избегайте любых занятий на улице.'
        });
        recs.push({
            icon: 'ri-surgical-mask-fill',
            title: 'Маска обязательна',
            desc: 'Если нужно выйти — обязательно наденьте респиратор N95/FFP2.'
        });
        recs.push({
            icon: 'ri-hospital-fill',
            title: 'Следите за здоровьем',
            desc: 'При затрудненном дыхании, кашле или дискомфорте обратитесь к врачу.'
        });
        recs.push({
            icon: 'ri-car-fill',
            title: 'Не открывайте окна в авто',
            desc: 'Используйте режим рециркуляции воздуха в автомобиле.'
        });
    }

    // Always add WHO note if pm25 is above WHO guideline
    if (data.pm25_avg > 15) {
        recs.push({
            icon: 'ri-heart-pulse-fill',
            title: `PM2.5 выше нормы ВОЗ`,
            desc: `Текущий уровень PM2.5 (${data.pm25_avg} μg/m³) превышает рекомендацию ВОЗ (15 μg/m³) в ${(data.pm25_avg / 15).toFixed(1)}×.`
        });
    }

    return recs;
}

// ===== GAUGE DRAWING =====
function drawAqiGauge(canvas, aqi) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const size = 220;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = 85;
    const lineWidth = 14;
    const startAngle = 0.75 * Math.PI;
    const endAngle = 2.25 * Math.PI;
    const totalAngle = endAngle - startAngle;

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Gradient arc segments
    const segments = [
        { end: 50, color: '#00b894' },
        { end: 100, color: '#fdcb6e' },
        { end: 150, color: '#e17055' },
        { end: 200, color: '#d63031' },
        { end: 300, color: '#6c5ce7' },
        { end: 500, color: '#2d1f4e' }
    ];

    const maxAqi = 500;
    let prevEnd = startAngle;

    segments.forEach(seg => {
        const segStart = prevEnd;
        const segEnd = startAngle + (Math.min(seg.end, maxAqi) / maxAqi) * totalAngle;
        prevEnd = segEnd;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, segStart, segEnd);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'butt';
        ctx.stroke();
    });

    // Needle / indicator
    const clampedAqi = Math.min(Math.max(aqi, 0), maxAqi);
    const needleAngle = startAngle + (clampedAqi / maxAqi) * totalAngle;
    const needleR = radius + 14;
    const needleX = cx + Math.cos(needleAngle) * needleR;
    const needleY = cy + Math.sin(needleAngle) * needleR;

    // Glow
    ctx.beginPath();
    ctx.arc(needleX, needleY, 8, 0, Math.PI * 2);
    ctx.fillStyle = getAqiLevel(aqi).color + '40';
    ctx.fill();

    // Dot
    ctx.beginPath();
    ctx.arc(needleX, needleY, 5, 0, Math.PI * 2);
    ctx.fillStyle = getAqiLevel(aqi).color;
    ctx.fill();

    // Inner dot
    ctx.beginPath();
    ctx.arc(needleX, needleY, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Center text
    ctx.fillStyle = getAqiLevel(aqi).color;
    ctx.font = '700 42px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(aqi), cx, cy - 6);

    ctx.fillStyle = '#8b8fa3';
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillText('из 500', cx, cy + 22);
}

// ===== CHARTS =====
let sourceChartInstance = null;
let pollutantChartInstance = null;

function createSourceChart(data) {
    const ctx = document.getElementById('sourceChart').getContext('2d');

    if (sourceChartInstance) sourceChartInstance.destroy();

    const ag = data.sources.airgradient;
    const iq = data.sources.iqair;

    sourceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['PM2.5 (μg/m³)', 'PM10 (μg/m³)'],
            datasets: [
                {
                    label: 'AirGradient',
                    data: [ag.pm25_avg || 0, ag.pm10_avg || 0],
                    backgroundColor: 'rgba(0, 184, 148, 0.7)',
                    borderColor: '#00b894',
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.6,
                },
                {
                    label: 'IQAir',
                    data: [iq.pm25_avg || 0, iq.pm10_avg || 0],
                    backgroundColor: 'rgba(108, 92, 231, 0.7)',
                    borderColor: '#6c5ce7',
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.6,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#8b8fa3',
                        font: { family: 'Inter', size: 11 },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 16,
                    }
                },
                tooltip: {
                    backgroundColor: '#1a1d27',
                    titleColor: '#e4e6f0',
                    bodyColor: '#8b8fa3',
                    borderColor: '#2a2d3a',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#8b8fa3', font: { family: 'Inter', size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#8b8fa3', font: { family: 'Inter', size: 11 } },
                    beginAtZero: true,
                }
            }
        }
    });
}

function createPollutantChart(data) {
    const ctx = document.getElementById('pollutantChart').getContext('2d');

    if (pollutantChartInstance) pollutantChartInstance.destroy();

    pollutantChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['PM2.5', 'PM10 (крупные частицы)'],
            datasets: [{
                data: [data.pm25_avg, (data.pm10_avg - data.pm25_avg)],
                backgroundColor: [
                    'rgba(108, 92, 231, 0.8)',
                    'rgba(253, 203, 110, 0.8)',
                ],
                borderColor: [
                    '#6c5ce7',
                    '#fdcb6e',
                ],
                borderWidth: 2,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#8b8fa3',
                        font: { family: 'Inter', size: 11 },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 16,
                    }
                },
                tooltip: {
                    backgroundColor: '#1a1d27',
                    titleColor: '#e4e6f0',
                    bodyColor: '#8b8fa3',
                    borderColor: '#2a2d3a',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${context.parsed.toFixed(1)} μg/m³`;
                        }
                    }
                }
            }
        }
    });
}

// ===== UPDATE UI =====
function updateDashboard(data) {
    const aqiInfo = getAqiLevel(data.aqi_avg);

    // Hero card
    const heroCard = document.getElementById('aqiHeroCard');
    heroCard.className = 'aqi-hero-card level-' + aqiInfo.level;

    document.getElementById('aqiBigNumber').textContent = Math.round(data.aqi_avg);

    const categoryEl = document.getElementById('aqiCategory');
    categoryEl.querySelector('.category-dot').style.background = aqiInfo.color;
    categoryEl.querySelector('.category-text').textContent = aqiInfo.label;
    categoryEl.querySelector('.category-text').style.color = aqiInfo.color;

    // Gauge
    drawAqiGauge(document.getElementById('aqiGauge'), data.aqi_avg);

    // Metrics
    document.getElementById('valPm25').textContent = data.pm25_avg;
    document.getElementById('valPm10').textContent = data.pm10_avg;
    document.getElementById('valStations').textContent = data.stations_total;

    const pm25Status = getPmStatus(data.pm25_avg, 'pm25');
    const pm10Status = getPmStatus(data.pm10_avg, 'pm10');
    const statusPm25 = document.getElementById('statusPm25');
    const statusPm10 = document.getElementById('statusPm10');
    statusPm25.textContent = pm25Status.text;
    statusPm25.className = 'metric-status ' + pm25Status.cls;
    statusPm10.textContent = pm10Status.text;
    statusPm10.className = 'metric-status ' + pm10Status.cls;

    // Source details
    const ag = data.sources.airgradient;
    const iq = data.sources.iqair;
    document.getElementById('agStations').textContent = ag.stations_count + ' станций';
    document.getElementById('agPm25').textContent = ag.pm25_avg ?? '—';
    document.getElementById('agPm10').textContent = ag.pm10_avg ?? '—';
    document.getElementById('iqStations').textContent = iq.stations_count + ' станций';
    document.getElementById('iqPm25').textContent = iq.pm25_avg ?? '—';
    document.getElementById('iqAqi').textContent = iq.aqi_avg ?? '—';

    // Charts
    createSourceChart(data);
    createPollutantChart(data);

    // Recommendations
    const recs = getRecommendations(data);
    const recBody = document.getElementById('recommendations');
    recBody.innerHTML = `<div class="rec-grid">${recs.map(r => `
        <div class="rec-item">
            <i class="${r.icon}"></i>
            <div class="rec-item-text">
                <span class="rec-item-title">${r.title}</span>
                <span class="rec-item-desc">${r.desc}</span>
            </div>
        </div>
    `).join('')}</div>`;

    // Last update
    const ts = new Date(data.timestamp);
    const timeStr = ts.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const dateStr = ts.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    document.getElementById('lastUpdate').innerHTML =
        `<i class="ri-time-line"></i><span>Обновлено: ${dateStr}, ${timeStr}</span>`;
}

// ===== FETCH DATA =====
async function fetchData() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        updateDashboard(data);
        removeErrorBanner();
        return data;
    } catch (err) {
        console.error('Failed to fetch data:', err);
        showErrorBanner(`Не удалось загрузить данные. Используем последние доступные.`);
        // Use fallback data
        const fallback = {
            city: "Almaty",
            pm25_avg: 37.6,
            pm10_avg: 56.0,
            aqi_avg: 82.0,
            stations_total: 160,
            timestamp: new Date().toISOString(),
            sources: {
                airgradient: { pm25_avg: 39.1, pm10_avg: 56.0, stations_count: 142 },
                iqair: { pm25_avg: 26.2, pm10_avg: null, aqi_avg: 82.0, stations_count: 18 }
            }
        };
        updateDashboard(fallback);
    }
}

function showErrorBanner(message) {
    removeErrorBanner();
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.id = 'errorBanner';
    banner.innerHTML = `<i class="ri-error-warning-line"></i><span>${message}</span>`;
    document.querySelector('.main').prepend(banner);
}

function removeErrorBanner() {
    const existing = document.getElementById('errorBanner');
    if (existing) existing.remove();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, REFRESH_INTERVAL);

    document.getElementById('btnRefresh').addEventListener('click', () => {
        const btn = document.getElementById('btnRefresh');
        btn.querySelector('i').classList.add('spinning');
        fetchData().finally(() => {
            setTimeout(() => btn.querySelector('i').classList.remove('spinning'), 500);
        });
    });
});
