-- AlterTable
ALTER TABLE "POSTransaction" ADD COLUMN "paidByMemberId" TEXT;

-- Backfill: promotion fees charged by card for a member who has a PAYS_FOR
-- payer were charged to the payer's card (chargeStoredPaymentMethod always
-- bills the payer when that relationship exists). Attribute them to the
-- payer and label them "Kid via Parent".
UPDATE "POSTransaction" t
SET "paidByMemberId" = r."fromMemberId",
    "memberName" = TRIM(kid."firstName" || ' ' || kid."lastName") || ' via ' || TRIM(payer."firstName" || ' ' || payer."lastName")
FROM "MemberRelationship" r
JOIN "Member" kid ON kid."id" = r."toMemberId"
JOIN "Member" payer ON payer."id" = r."fromMemberId"
WHERE r."relationship" = 'PAYS_FOR'
  AND r."toMemberId" = t."memberId"
  AND payer."clientId" = t."clientId"
  AND t."transactionNumber" LIKE 'PROMO-%'
  AND t."paymentMethod" = 'CARD'
  AND t."paidByMemberId" IS NULL;
