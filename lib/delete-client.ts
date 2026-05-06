import { prisma } from "@/lib/prisma";

/**
 * Delete a client and ALL its related data.
 * Used by admin delete and auto-cleanup of expired trials.
 */
export async function deleteClientAndData(clientId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Attendance & bookings
    await tx.attendance.deleteMany({ where: { classSession: { clientId } } });
    await tx.classBooking.deleteMany({ where: { classSession: { clientId } } });
    await tx.classSession.deleteMany({ where: { clientId } });

    // Members and related
    await tx.memberRelationship.deleteMany({ where: { fromMember: { clientId } } });
    await tx.membership.deleteMany({ where: { member: { clientId } } });
    await tx.invoice.deleteMany({ where: { member: { clientId } } });
    await tx.trialPass.deleteMany({ where: { member: { clientId } } });
    await tx.memberAuthToken.deleteMany({ where: { member: { clientId } } });
    await tx.memberSession.deleteMany({ where: { member: { clientId } } });
    await tx.signedWaiver.deleteMany({ where: { clientId } });
    await tx.member.deleteMany({ where: { clientId } });

    // Styles & curriculum
    await tx.rankTestItem.deleteMany({ where: { category: { rankTest: { rank: { style: { clientId } } } } } });
    await tx.rankTestCategory.deleteMany({ where: { rankTest: { rank: { style: { clientId } } } } });
    await tx.rankTest.deleteMany({ where: { rank: { style: { clientId } } } });
    await tx.rank.deleteMany({ where: { style: { clientId } } });
    await tx.style.deleteMany({ where: { clientId } });

    // Testing & promotions
    await tx.testingParticipant.deleteMany({ where: { testingEvent: { clientId } } });
    await tx.testingEvent.deleteMany({ where: { clientId } });
    await tx.promotionParticipant.deleteMany({ where: { promotionEvent: { clientId } } });
    await tx.promotionEvent.deleteMany({ where: { clientId } });

    // POS
    await tx.pOSLineItem.deleteMany({ where: { POSTransaction: { clientId } } });
    await tx.pOSTransaction.deleteMany({ where: { clientId } });
    await tx.pOSItemVariant.deleteMany({ where: { item: { clientId } } });
    await tx.pOSItem.deleteMany({ where: { clientId } });

    // Board/communication
    await tx.boardReply.deleteMany({ where: { post: { channel: { clientId } } } });
    await tx.boardFile.deleteMany({ where: { post: { channel: { clientId } } } });
    await tx.boardPost.deleteMany({ where: { channel: { clientId } } });
    await tx.boardPollVote.deleteMany({ where: { option: { poll: { channel: { clientId } } } } });
    await tx.boardPollOption.deleteMany({ where: { poll: { channel: { clientId } } } });
    await tx.boardPoll.deleteMany({ where: { channel: { clientId } } });
    await tx.boardEvent.deleteMany({ where: { clientId } });
    await tx.boardChannel.deleteMany({ where: { clientId } });

    // Other
    await tx.waiverTemplate.deleteMany({ where: { clientId } });
    await tx.emailTemplate.deleteMany({ where: { clientId } });
    await tx.enrollmentSubmission.deleteMany({ where: { clientId } });
    await tx.membershipPlan.deleteMany({ where: { clientId } });
    await tx.promoCode.deleteMany({ where: { clientId } });
    await tx.location.deleteMany({ where: { clientId } });
    await tx.program.deleteMany({ where: { clientId } });
    await tx.task.deleteMany({ where: { clientId } });
    await tx.appointment.deleteMany({ where: { clientId } });
    await tx.settings.deleteMany({ where: { clientId } });
    await tx.auditLog.deleteMany({ where: { clientId } });
    await tx.supportTicket.deleteMany({ where: { clientId } });
    await tx.user.deleteMany({ where: { clientId } });
    await tx.client.delete({ where: { id: clientId } });
  });
}
