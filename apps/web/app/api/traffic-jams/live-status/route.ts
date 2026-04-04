import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_LIVE_DASHBOARD_URL = process.env.TRAFFICJAMS_LIVE_URL ?? "http://127.0.0.1:5000";

export async function GET() {
  try {
    const response = await fetch(DEFAULT_LIVE_DASHBOARD_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });

    return NextResponse.json({
      available: response.ok,
      url: DEFAULT_LIVE_DASHBOARD_URL,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      available: false,
      url: DEFAULT_LIVE_DASHBOARD_URL,
      checkedAt: new Date().toISOString(),
    });
  }
}
