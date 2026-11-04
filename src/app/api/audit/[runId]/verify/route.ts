import { NextRequest, NextResponse } from "next/server";
import { verifyChain } from "../../../../../lib/audit/chain";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const { runId } = params;

    if (!runId) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "runId parameter is required" } },
        { status: 400 }
      );
    }

    const verification = await verifyChain(runId);
    return NextResponse.json({
      valid: verification.ok,
      brokenAtSeq: verification.brokenAtSeq,
      count: verification.count,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
