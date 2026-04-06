import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function resolveAnnotatedVideoPath() {
  const candidates = [
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "trafficjams", "traffic_annotated_h264.mp4"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "trafficjams", "traffic_annotated.mp4"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "trafficjams", "traffic_annotated_h264.mp4"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "trafficjams", "traffic_annotated.mp4"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "..", "trafficjams", "traffic_annotated_h264.mp4"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "..", "trafficjams", "traffic_annotated.mp4"),
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

function parseRangeHeader(rangeHeader: string, size: number) {
  const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= size) {
    return null;
  }

  return { start, end };
}

function buildVideoHeaders(size: number, extra?: Record<string, string>) {
  return {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Length": String(size),
    ...extra,
  };
}

export async function GET(request: Request) {
  const filePath = await resolveAnnotatedVideoPath();
  if (!filePath) {
    return NextResponse.json({ error: "Annotated traffic video not found." }, { status: 404 });
  }

  try {
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;
    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const range = parseRangeHeader(rangeHeader, fileSize);
      if (!range) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      const stream = createReadStream(filePath, {
        start: range.start,
        end: range.end,
      });

      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: buildVideoHeaders(range.end - range.start + 1, {
          "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
        }),
      });
    }

    const stream = createReadStream(filePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: buildVideoHeaders(fileSize),
    });
  } catch {
    return NextResponse.json({ error: "Annotated traffic video is unavailable." }, { status: 500 });
  }
}
