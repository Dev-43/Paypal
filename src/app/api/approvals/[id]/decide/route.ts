import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  verifyApproverToken,
  APPROVER_COOKIE_NAME,
} from "@/lib/auth/approver";
import { appendEvent } from "@/lib/audit/chain";
import { executeTool } from "@/lib/paypal/executor";
import { performLedgerCheck } from "@/lib/ledger/check";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const { id } = params;
  const body = await req.json();
  const decision = body.decision as "approved" | "rejected";

  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json(
      { error: { code: "INVALID_DECISION", message: "Decision must be 'approved' or 'rejected'." } },
      { status: 400 }
    );
  }

  try {
    const approval = await (prisma as any).approval.findUnique({
      where: { id },
      include: { run: true },
    });

    if (!approval) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Approval with id ${id} not found.` } },
        { status: 404 }
      );
    }

    const updatedApproval = await (prisma as any).approval.update({
      where: { id },
      data: {
        status: decision,
        decidedBy: "human_approver",
        decidedAt: new Date(),
      },
    });

    // Append audit event
    await appendEvent(approval.runId, decision === "approved" ? "approved" as any : "rejected" as any, {
      approvalId: id,
      callId: approval.callId,
      action: approval.action,
      decidedBy: "human_approver",
    });

    let executionResult = null;
    let ledgerCheckResult = null;

    if (decision === "approved") {
      // Execute the approved action!
      const action = approval.action as any;
      const execution = await executeTool({
        runId: approval.runId,
        stepIndex: action.stepIndex || 1,
        tool: action.tool,
        args: action.args,
        rationale: action.rationale || "Human approved action",
      });
      executionResult = execution;

      // Perform Ledger Truth check
      ledgerCheckResult = await performLedgerCheck({
        callId: approval.callId,
        envelope: {
          runId: approval.runId,
          stepIndex: action.stepIndex || 1,
          tool: action.tool,
          args: action.args,
          rationale: action.rationale || "Human approved action",
        },
        executionStatus: execution.status,
        executionResult: execution.result,
        currentPermissionState: approval.run.permissionState as any,
      });

      // Update run status and permission state
      await prisma.run.update({
        where: { id: approval.runId },
        data: {
          status: ledgerCheckResult.check.status === "MISMATCH" ? "frozen" : "running",
          heldAction: Prisma.DbNull,
          permissionState: ledgerCheckResult.nextPermissionState as any,
        },
      });

      // Append executed audit event
      await appendEvent(approval.runId, "executed" as any, {
        callId: approval.callId,
        tool: action.tool,
        status: execution.status,
        ledgerCheck: ledgerCheckResult.check,
      });
    } else {
      // Rejected: unpause run or mark completed/failed
      await prisma.run.update({
        where: { id: approval.runId },
        data: {
          status: "running",
          heldAction: Prisma.DbNull,
        },
      });
    }

    return NextResponse.json(
      {
        approval: updatedApproval,
        execution: executionResult,
        ledgerCheck: ledgerCheckResult?.check || null,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: err.message } },
      { status: 500 }
    );
  }
}
