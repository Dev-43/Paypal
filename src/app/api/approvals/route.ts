import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import {
  verifyApproverToken,
  APPROVER_COOKIE_NAME,
} from "../../../lib/auth/approver";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Check approver authorization
  const cookieToken = req.cookies.get(APPROVER_COOKIE_NAME)?.value;
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token || !verifyApproverToken(token)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Approver authentication required" } },
      { status: 401 }
    );
  }

  try {
    const approvals = await (prisma as any).approval.findMany({
      where: { status: "pending" },
      include: { run: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ approvals }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: err.message } },
      { status: 500 }
    );
  }
}
