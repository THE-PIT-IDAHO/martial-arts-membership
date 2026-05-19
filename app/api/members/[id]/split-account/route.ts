import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { sendEmail, getSetting } from "@/lib/email";

// POST /api/members/[id]/split-account
//
// Used when a dependent reaches the age of majority (typically 18) and
// becomes a fully independent member:
//   - Removes every incoming MemberRelationship pointing at this member
//     (the former parent/guardian loses portal-switcher access).
//   - Clears parentGuardianName so the profile reflects independence.
//   - Emails the now-independent member a link to sign a fresh adult
//     waiver, which gets attached to their existing member id (history,
//     belt progress, payments, attendance all preserved).
//
// Returns 400 if there's no incoming relationship — nothing to split.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const clientId = await getClientId(request);

    const member = await prisma.member.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        clientId: true,
        firstName: true,
        lastName: true,
        email: true,
        parentGuardianName: true,
      },
    });
    if (!member || member.clientId !== clientId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const incoming = await prisma.memberRelationship.findMany({
      where: { toMemberId: member.id },
      include: { fromMember: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    if (incoming.length === 0) {
      return NextResponse.json({ error: "This member isn't linked to a parent/guardian — nothing to split." }, { status: 400 });
    }

    // 1. Remove every incoming relationship → parent loses switcher access.
    await prisma.memberRelationship.deleteMany({
      where: { toMemberId: member.id },
    });

    // 2. Clear parentGuardianName (and minorCommsMode if set to parent_only).
    await prisma.member.update({
      where: { id: member.id },
      data: {
        parentGuardianName: null,
        minorCommsMode: "both",
      },
    });

    // 3. Audit
    const parentSummary = incoming
      .map((r) => `${r.fromMember.firstName} ${r.fromMember.lastName}`)
      .join(", ");
    logAudit({
      entityType: "Member",
      entityId: member.id,
      action: "UPDATE",
      summary: `Split account: ${member.firstName} ${member.lastName} is now independent (was linked to ${parentSummary})`,
    }).catch(() => {});

    // 4. Email the new adult waiver link (if member has an email).
    if (member.email) {
      const origin =
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        "app.dojostormsoftware.com";
      const protocol = request.headers.get("x-forwarded-proto") || "https";
      const waiverUrl = `${protocol}://${origin}/waiver/sign/${member.id}`;
      const gymName = (await getSetting("gymName", clientId)) || "the gym";

      await sendEmail({
        to: member.email,
        subject: `Welcome to your own ${gymName} account — please sign your adult waiver`,
        html: `
          <p>Hi ${member.firstName},</p>
          <p>Your ${gymName} membership has been moved to your own independent account. Your training history, belt rank, and payment info are all preserved — nothing was lost.</p>
          <p>To finish the handoff, please sign a fresh adult waiver. The waiver you signed previously was a guardian waiver, so this one will be on file as the legally responsible adult.</p>
          <p style="margin: 24px 0;">
            <a href="${waiverUrl}" style="display:inline-block;padding:12px 24px;background:#c41111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
              Sign My Adult Waiver
            </a>
          </p>
          <p style="font-size:12px;color:#888;">
            Your previous guardian(s) no longer have access to manage your account from their portal.
          </p>
        `,
        clientId,
        memberId: member.id,
        eventType: "ACCOUNT_SPLIT",
      });
    }

    // 5. Notify the previous parent(s) too — so they know the change happened.
    for (const rel of incoming) {
      if (!rel.fromMember.email) continue;
      const gymName = (await getSetting("gymName", clientId)) || "the gym";
      await sendEmail({
        to: rel.fromMember.email,
        subject: `${member.firstName} ${member.lastName} now has their own ${gymName} account`,
        html: `
          <p>Hi ${rel.fromMember.firstName},</p>
          <p>${member.firstName} ${member.lastName} is now an independent member at ${gymName} and manages their own account.</p>
          <p>You can no longer switch into ${member.firstName}'s portal — they have their own login. If you still want to support their training (e.g. cover billing), they can grant you access on their end.</p>
        `,
        clientId,
        memberId: rel.fromMember.id,
        eventType: "ACCOUNT_SPLIT_PARENT",
      });
    }

    return NextResponse.json({
      success: true,
      memberId: member.id,
      relationshipsRemoved: incoming.length,
      adultWaiverEmailed: !!member.email,
    });
  } catch (err) {
    console.error("Split account error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to split account: ${msg}` }, { status: 500 });
  }
}
