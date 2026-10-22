import { prisma } from "@/lib/prisma";

/**
 * Result-PDF URLs that must NOT be shown to this member yet.
 *
 * When a test is marked complete the admin page copies each result PDF
 * into the member's styleDocuments, which the portal documents tab
 * serves with no testing context. A result stays hidden until its test
 * is COMPLETED *and* the participant's result is published -- so a
 * test that's re-opened, or a result un-published, disappears from the
 * documents tab too, not just from the Testing page.
 */
export async function getHiddenTestResultUrls(memberId: string): Promise<Set<string>> {
  const rows = await prisma.testingParticipant.findMany({
    where: {
      memberId,
      resultPdfUrl: { not: null },
      OR: [
        { resultsPublishedAt: null },
        { testingEvent: { status: { not: "COMPLETED" } } },
      ],
    },
    select: { resultPdfUrl: true },
  });
  return new Set(rows.map((r) => r.resultPdfUrl as string));
}
