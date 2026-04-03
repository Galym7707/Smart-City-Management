import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Управление городом Алматы",
  description: "Demo-dashboard для городского штаба: карта, очередь рисков, инциденты, задачи и отчёты.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme="day" lang="ru">
      <body>{children}</body>
    </html>
  );
}
