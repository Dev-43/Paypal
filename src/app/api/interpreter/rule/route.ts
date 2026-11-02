import { NextRequest, NextResponse } from "next/server";
import { draftRule } from "../../../../lib/interpreter";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { runId, text } = body;

    if (!runId || !text) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "runId and text are required" } },
        { status: 400 }
      );
    }

    try {
      const rule = await draftRule(runId, text);
      return NextResponse.json({ rule });
    } catch (draftErr: unknown) {
      return NextResponse.json(
        { error: { code: "UNSAFE_RULE", message: "Could not turn that into a safe rule." } },
        { status: 422 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
