import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";

// DELETE /api/portal/payment-methods/[id]
// Disabled for members — they cannot remove their own payment methods from
// the portal. Admin/staff handle card removal from the back office.
export async function DELETE(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(
    { error: "Removing a payment method from the portal is disabled. Please contact the gym." },
    { status: 403 },
  );
}
