import type { NextConfig } from "next";

const isStaticExport = process.env.HF_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  ...(isStaticExport
    ? {
        output: "export",
      }
    : {}),
};

export default nextConfig;
