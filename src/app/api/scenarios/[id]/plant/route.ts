import { NextRequest, NextResponse } from "next/server";
import { getScenario } from "../../../../lib/scenarios/definitions";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const scenario = getScenario(id);

    // In a live sandbox environment, this writes into the PayPal object's shipping address.
    // In local/simulated environment, it attaches to the scenario definition and planted ref.
    const plantedObjectRef = scenario.plantedObjectRef || `ORD-${id}-PLANTED`;

    return NextResponse.json({
      plantedObjectRef,
      scenarioId: id,
      attackerText: scenario.attackerText || null,
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
