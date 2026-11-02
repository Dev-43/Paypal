import { NextRequest, NextResponse } from "next/server";
import { briefIncident } from "../../../../lib/interpreter";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const runId = body.runId as string;

    if (!runId) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "runId is required" } },
        { status: 400 }
      );
    }

    const briefing = await briefIncident(runId);
    return NextResponse.json({ briefing });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "BRIEFING_FAILED", message } },
      { status: 500 }
    );
  }
}
