import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("runId");

    if (!runId) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "runId parameter is required" } },
        { status: 400 }
      );
    }

    const messages = await prisma.envOutbox.findMany({
      where: { runId },
      orderBy: { sentAt: "asc" },
    });

    return NextResponse.json({
      outbox: messages.map((m) => ({
        id: m.id,
        runId: m.runId,
        to: m.to,
        subject: m.subject,
        body: m.body,
        sentAt: m.sentAt.toISOString(),
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
