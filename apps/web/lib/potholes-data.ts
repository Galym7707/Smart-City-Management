export type PotholeSeverity = "critical" | "high" | "medium" | "low";

export type PotholeRecord = {
  id: number;
  name: string;
  image: string;
  lat: number;
  lng: number;
  severity: PotholeSeverity;
  severityLabel: string;
  depthLabel: string;
  depthCm: number;
  district: string;
  address: string;
  date: string;
  costLabel: string;
  costKzt: number;
  description: string;
  priority: number;
  color: string;
  radius: number;
};

export const POTHOLES: PotholeRecord[] = [
  {
    id: 1,
    name: "Яма #1 — Трасса",
    image: "/images/potholes/Pothole1.jpg",
    lat: 43.222,
    lng: 76.8512,
    severity: "medium",
    severityLabel: "Средняя",
    depthLabel: "~12 см",
    depthCm: 12,
    district: "Медеуский",
    address: "пр. Аль-Фараби, 77",
    date: "02.04.2026",
    costLabel: "₸ 55,000",
    costKzt: 55000,
    description: "Две малые ямы на проезжей части трассы. Обнаружены при мониторинге с видеорегистратора.",
    priority: 45,
    color: "#f59e0b",
    radius: 14,
  },
  {
    id: 2,
    name: "Яма #2 — Критическая",
    image: "/images/potholes/pothhole2.png",
    lat: 43.2565,
    lng: 76.9286,
    severity: "critical",
    severityLabel: "Критическая",
    depthLabel: "~35 см",
    depthCm: 35,
    district: "Алмалинский",
    address: "ул. Жибек Жолы, 50",
    date: "01.04.2026",
    costLabel: "₸ 180,000",
    costKzt: 180000,
    description: "Глубокая яма с разрушенным основанием. Угроза безопасности движения. Требуется немедленный ремонт.",
    priority: 95,
    color: "#ef4444",
    radius: 22,
  },
  {
    id: 3,
    name: "Яма #3 — Глубокая",
    image: "/images/potholes/pothhole3.png",
    lat: 43.238,
    lng: 76.9455,
    severity: "critical",
    severityLabel: "Критическая",
    depthLabel: "~40 см",
    depthCm: 40,
    district: "Бостандыкский",
    address: "ул. Тимирязева, 28А",
    date: "31.03.2026",
    costLabel: "₸ 150,000",
    costKzt: 150000,
    description: "Глубокая яма с обнажённым грунтом. Опасность провала для легковых автомобилей.",
    priority: 98,
    color: "#ef4444",
    radius: 24,
  },
  {
    id: 4,
    name: "Яма #4 — На дороге",
    image: "/images/potholes/pothhole4.png",
    lat: 43.27,
    lng: 76.895,
    severity: "high",
    severityLabel: "Высокая",
    depthLabel: "~22 см",
    depthCm: 22,
    district: "Алмалинский",
    address: "ул. Гоголя, 111",
    date: "02.04.2026",
    costLabel: "₸ 120,000",
    costKzt: 120000,
    description: "Яма на проезжей части рядом с перекрёстком. Высокий трафик. Нужен ускоренный ремонт.",
    priority: 78,
    color: "#f97316",
    radius: 18,
  },
  {
    id: 5,
    name: "Яма #5 — С водой",
    image: "/images/potholes/pothhole5.png",
    lat: 43.21,
    lng: 76.878,
    severity: "critical",
    severityLabel: "Критическая",
    depthLabel: "~30 см",
    depthCm: 30,
    district: "Бостандыкский",
    address: "ул. Сатпаева, 90",
    date: "03.04.2026",
    costLabel: "₸ 120,000",
    costKzt: 120000,
    description: "Яма заполнена водой, поэтому реальная глубина не видна водителям. Это опасный сценарий для плотного потока.",
    priority: 92,
    color: "#ef4444",
    radius: 20,
  },
  {
    id: 6,
    name: "Яма #6 — Малая",
    image: "/images/potholes/pothhole6.png",
    lat: 43.248,
    lng: 76.912,
    severity: "low",
    severityLabel: "Низкая",
    depthLabel: "~7 см",
    depthCm: 7,
    district: "Медеуский",
    address: "ул. Кабанбай Батыра, 162",
    date: "03.04.2026",
    costLabel: "₸ 15,000",
    costKzt: 15000,
    description: "Неглубокая яма малого размера. Достаточно мониторинга и планового ремонта.",
    priority: 20,
    color: "#10b981",
    radius: 10,
  },
];
