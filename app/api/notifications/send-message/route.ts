import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendCustomMessageEmail } from "@/lib/notifications";

// POST /api/notifications/send-message
// Sends a custom email to specified members.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { memberIds, subject, message } = body;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("memberIds is required", { status: 400 });
    }
    if (!message || typeof message !== "string") {
      return new NextResponse("message is required", { status: 400 });
    }

    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, firstName: true, lastName: true },
    });

    let sent = 0;
    for (const member of members) {
      sendCustomMessageEmail({
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`,
        subject: subject || "Message from your gym",
        message,
      }).catch(() => {});
      sent++;
    }

    return NextResponse.json({ sent });
  } catch (error) {
    console.error("Error sending message:", error);
    return new NextResponse("Failed to send message", { status: 500 });
  }
}
