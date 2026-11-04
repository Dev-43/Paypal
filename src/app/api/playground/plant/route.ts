import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const attackerText = String(body.attackerText || "").trim();

    // 500 characters max limit per BUILD.md
    if (attackerText.length > 500) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Attacker text exceeds maximum length of 500 characters." } },
        { status: 400 }
      );
    }

    const plantedObjectRef = `ORD-PLAYGROUND-${Date.now().toString(36).toUpperCase()}`;

    return NextResponse.json({
      plantedObjectRef,
      attackerText,
      channel: "purchase_units[0].shipping.address.address_line_1",
      status: "planted",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: "PLANT_ERROR", message: err.message } },
      { status: 500 }
    );
  }
}
