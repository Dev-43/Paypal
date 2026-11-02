import { NextRequest, NextResponse } from "next/server";
import { gatewayCall } from "../../../../lib/gateway";
import { GatewayCallInputSchema } from "../../../../contracts";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Check x-taut-key header
    const providedKey = req.headers.get("x-taut-key");
    const expectedKey = process.env.DEMO_AGENT_KEY || "taut-demo-agent-key-2026";

    if (!providedKey || providedKey !== expectedKey) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid or missing x-taut-key header." } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = GatewayCallInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Payload does not match GatewayCallInput schema",
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const result = await gatewayCall(parsed.data);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: { code: "GATEWAY_ERROR", message } },
      { status: 500 }
    );
  }
}
