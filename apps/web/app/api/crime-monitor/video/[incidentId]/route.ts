import { access, readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

async function resolveCrimeVideoPath() {
  const candidates = [
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "crime.MOV"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "crime.MOV"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "..", "crime.MOV"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await context.params;

  if (apiBaseUrl) {
    try {
      const upstream = await fetch(`${apiBaseUrl}/api/v1/crime/incidents/${incidentId}/video`, {
        cache: "no-store",
      });
      if (upstream.ok && upstream.body) {
        return new Response(upstream.body, {
          headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "video/quicktime",
            "Cache-Control": "no-store",
          },
        });
      }
    } catch {
      // Fallback to local file below when backend is unreachable.
    }
  }

  const filePath = await resolveCrimeVideoPath();
  if (!filePath) {
    return new Response("Crime video not found.", { status: 404 });
  }

  const content = await readFile(filePath);
  return new Response(content, {
    headers: {
      "Content-Type": "video/quicktime",
      "Cache-Control": "no-store",
    },
  });
}
