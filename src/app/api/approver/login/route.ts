import { NextRequest, NextResponse } from "next/server";
import {
  verifyApproverPasscode,
  createApproverToken,
  APPROVER_COOKIE_NAME,
} from "../../../../lib/auth/approver";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const passcode = body.passcode as string;

    if (!passcode || !verifyApproverPasscode(passcode)) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid approver passcode" } },
        { status: 401 }
      );
    }

    const token = createApproverToken();
    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: APPROVER_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60, // 12 hours
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
