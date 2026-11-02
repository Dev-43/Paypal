import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("runId");
    const after = parseInt(searchParams.get("after") || "-1", 10);

    if (!runId) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "runId parameter is required" } },
        { status: 400 }
      );
    }

    const events = await prisma.event.findMany({
      where: {
        runId,
        seq: {
          gt: after,
        },
      },
      orderBy: {
        seq: "asc",
      },
    });

    const formattedEvents = events.map((e) => ({
      id: e.id,
      runId: e.runId,
      seq: e.seq,
      type: e.type,
      at: e.at.toISOString(),
      payload: e.payload,
      prevHash: e.prevHash,
      hash: e.hash,
    }));

    return NextResponse.json({ events: formattedEvents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
