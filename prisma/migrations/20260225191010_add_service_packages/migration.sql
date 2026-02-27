-- AlterTable
ALTER TABLE "POSLineItem" ADD COLUMN     "servicePackageId" TEXT;

-- AlterTable
ALTER TABLE "ScheduledAppointment" ADD COLUMN     "memberServiceCreditId" TEXT;

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "appointmentId" TEXT,
    "sessionsIncluded" INTEGER NOT NULL DEFAULT 1,
    "priceCents" INTEGER NOT NULL,
    "expirationDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availableOnline" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "clientId" TEXT NOT NULL DEFAULT 'default-client',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberServiceCredit" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "servicePackageId" TEXT NOT NULL,
    "creditsTotal" INTEGER NOT NULL,
    "creditsRemaining" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "clientId" TEXT NOT NULL DEFAULT 'default-client',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberServiceCredit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ScheduledAppointment" ADD CONSTRAINT "ScheduledAppointment_memberServiceCreditId_fkey" FOREIGN KEY ("memberServiceCreditId") REFERENCES "MemberServiceCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberServiceCredit" ADD CONSTRAINT "MemberServiceCredit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberServiceCredit" ADD CONSTRAINT "MemberServiceCredit_servicePackageId_fkey" FOREIGN KEY ("servicePackageId") REFERENCES "ServicePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
