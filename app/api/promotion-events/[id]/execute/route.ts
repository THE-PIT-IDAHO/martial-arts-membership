import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPromotionCongratsEmail } from "@/lib/notifications";

type MemberStyle = {
  name: string;
  rank?: string;
  startDate?: string;
  lastPromotionDate?: string;
  active?: boolean;
  attendanceResetDate?: string;
};

type StyleDocument = {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
};

type RankPdf = {
  name: string;
  url: string;
};

type BeltRank = {
  name: string;
  order: number;
  pdfDocuments?: RankPdf[];
};

// Rank PDFs are sourced from Rank.pdfDocument and shown on the portal Styles
// page. We no longer copy them into member.styleDocuments on promotion.
async function addRankPdfsToMember(
  _memberId: string,
  _styleName: string,
  _targetRankName: string,
  currentStyleDocuments: string | null
): Promise<string> {
  return currentStyleDocuments || "[]";
}

// POST /api/promotion-events/[id]/execute - Execute promotions for all registered participants
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { participantIds, promotionDate } = body;

    // Get the event with participants
    const event = await prisma.promotionEvent.findUnique({
      where: { id },
      include: {
        participants: true,
      },
    });

    if (!event) {
      return new NextResponse("Promotion event not found", { status: 404 });
    }

    // Filter to only specified participants if provided, otherwise promote all REGISTERED
    let participantsToPromote = event.participants.filter(p => p.status === "REGISTERED");
    if (participantIds && Array.isArray(participantIds) && participantIds.length > 0) {
      participantsToPromote = participantsToPromote.filter(p => participantIds.includes(p.id));
    }

    if (participantsToPromote.length === 0) {
      return new NextResponse("No participants to promote", { status: 400 });
    }

    const promotedDate = promotionDate || new Date().toISOString().split("T")[0];
    const results: { memberId: string; memberName: string; success: boolean; error?: string }[] = [];

    for (const participant of participantsToPromote) {
      try {
        if (!participant.promotingToRank) {
          results.push({
            memberId: participant.memberId,
            memberName: participant.memberName,
            success: false,
            error: "No target rank specified",
          });
          continue;
        }

        // Get the member
        const member = await prisma.member.findUnique({
          where: { id: participant.memberId },
          select: { id: true, stylesNotes: true, primaryStyle: true, styleDocuments: true },
        });

        if (!member) {
          results.push({
            memberId: participant.memberId,
            memberName: participant.memberName,
            success: false,
            error: "Member not found",
          });
          continue;
        }

        // Parse and update member styles
        let memberStyles: MemberStyle[] = [];
        try {
          memberStyles = JSON.parse(member.stylesNotes || "[]");
        } catch {
          memberStyles = [];
        }

        // Find and update the style
        const styleIndex = memberStyles.findIndex(
          s => s.name.toLowerCase() === event.styleName.toLowerCase()
        );

        let styleWasAdded = false;
        if (styleIndex >= 0) {
          memberStyles[styleIndex] = {
            ...memberStyles[styleIndex],
            rank: participant.promotingToRank,
            lastPromotionDate: promotedDate,
            attendanceResetDate: promotedDate, // Reset attendance tracking for next rank
          };
        } else {
          // Add the style if not found
          memberStyles.push({
            name: event.styleName,
            rank: participant.promotingToRank,
            lastPromotionDate: promotedDate,
            attendanceResetDate: promotedDate,
            active: true,
          });
          styleWasAdded = true;
        }

        // Check if the promoted style is the member's primary style
        const isPrimaryStyle = member.primaryStyle?.toLowerCase() === event.styleName.toLowerCase();
        // If member has no primary style and we added a new style, set it as primary
        const shouldSetAsPrimary = !member.primaryStyle && styleWasAdded;

        // Add rank PDFs to member's style documents
        const updatedStyleDocuments = await addRankPdfsToMember(
          participant.memberId,
          event.styleName,
          participant.promotingToRank,
          member.styleDocuments
        );

        // Update member - also update the rank field if this is their primary style
        await prisma.member.update({
          where: { id: participant.memberId },
          data: {
            stylesNotes: JSON.stringify(memberStyles),
            styleDocuments: updatedStyleDocuments,
            ...((isPrimaryStyle || shouldSetAsPrimary) && { rank: participant.promotingToRank }),
            ...(shouldSetAsPrimary && { primaryStyle: event.styleName }),
          },
        });

        // Update participant status
        await prisma.promotionParticipant.update({
          where: { id: participant.id },
          data: {
            status: "PROMOTED",
            promotedAt: new Date(promotedDate + "T00:00:00"),
          },
        });

        results.push({
          memberId: participant.memberId,
          memberName: participant.memberName,
          success: true,
        });

        // Send promotion congrats email (fire and forget)
        sendPromotionCongratsEmail({
          memberId: participant.memberId,
          memberName: participant.memberName,
          newRank: participant.promotingToRank,
          styleName: event.styleName,
        }).catch(() => {});
      } catch (err) {
        console.error(`Error promoting ${participant.memberName}:`, err);
        results.push({
          memberId: participant.memberId,
          memberName: participant.memberName,
          success: false,
          error: "Failed to update member",
        });
      }
    }

    // Check if all participants are promoted
    const updatedEvent = await prisma.promotionEvent.findUnique({
      where: { id },
      include: { participants: true },
    });

    const allPromoted = updatedEvent?.participants.every(p => p.status === "PROMOTED" || p.status === "CANCELLED");

    if (allPromoted) {
      await prisma.promotionEvent.update({
        where: { id },
        data: { status: "COMPLETED" },
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      promoted: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error("Error executing promotions:", error);
    return new NextResponse("Failed to execute promotions", { status: 500 });
  }
}
