import { NextRequest, NextResponse } from "next/server";
import {
  APPROVER_COOKIE_NAME,
  verifyApproverToken,
} from "../../../../../lib/auth/approver";
import { activateRule } from "../../../../../lib/interpreter";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Check approver cookie
    const token = req.cookies.get(APPROVER_COOKIE_NAME)?.value;
    if (!token || !verifyApproverToken(token)) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Approver authentication required to activate rules." } },
        { status: 401 }
      );
    }

    const result = await activateRule(id, "human_approver");
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "RULE_ACTIVATION_FAILED", message } },
      { status: 500 }
    );
  }
}
