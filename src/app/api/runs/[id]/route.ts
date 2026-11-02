import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Run ID parameter is missing" } },
        { status: 400 }
      );
    }

    const run = await prisma.run.findUnique({
      where: { id },
    });

    if (!run) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Run with id ${id} not found.` } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      run: {
        id: run.id,
        scenarioId: run.scenarioId,
        mode: run.mode,
        declaredTask: run.declaredTask,
        status: run.status,
        stepCount: run.stepCount,
        heldAction: run.heldAction,
        createdAt: run.createdAt.toISOString(),
      },
      permissionState: run.permissionState,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
