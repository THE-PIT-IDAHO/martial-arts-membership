-- CreateTable
CREATE TABLE "MemberDiscount" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT,
    "appliesTo" TEXT NOT NULL,
    "percentOff" DOUBLE PRECISION,
    "flatCents" INTEGER,
    "oneTime" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberDiscount_memberId_active_idx" ON "MemberDiscount"("memberId", "active");

-- CreateIndex
CREATE INDEX "MemberDiscount_clientId_idx" ON "MemberDiscount"("clientId");

-- AddForeignKey
ALTER TABLE "MemberDiscount" ADD CONSTRAINT "MemberDiscount_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberDiscount" ADD CONSTRAINT "MemberDiscount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
