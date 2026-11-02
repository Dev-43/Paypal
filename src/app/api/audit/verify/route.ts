import { NextRequest, NextResponse } from "next/server";
import { verifyChain } from "../../../../lib/audit/chain";

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

    const verification = await verifyChain(runId);
    return NextResponse.json(verification);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
