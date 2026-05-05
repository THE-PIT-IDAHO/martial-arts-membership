import { prisma } from "@/lib/prisma";

type TrialLimits = {
  maxMembers: number;
  maxStyles: number;
  maxRanksPerStyle: number;
  maxMembershipPlans: number;
  maxClasses: number;
  maxUsers: number;
  maxLocations: number;
  maxReports: number;
  maxPOSItems: number;
};

type TrialStatus = {
  isTrial: boolean;
  expired: boolean;
  daysRemaining: number | null;
  limits: TrialLimits;
};

const NO_LIMITS: TrialLimits = {
  maxMembers: Infinity,
  maxStyles: Infinity,
  maxRanksPerStyle: Infinity,
  maxMembershipPlans: Infinity,
  maxClasses: Infinity,
  maxUsers: Infinity,
  maxLocations: Infinity,
  maxReports: Infinity,
  maxPOSItems: Infinity,
};

/**
 * Get trial status for a client. If trialExpiresAt is null, the client
 * is on a full plan with no limits.
 */
export async function getTrialStatus(clientId: string): Promise<TrialStatus> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      maxMembers: true,
      maxStyles: true,
      maxRanksPerStyle: true,
      maxMembershipPlans: true,
      maxClasses: true,
      maxUsers: true,
      maxLocations: true,
      maxReports: true,
      maxPOSItems: true,
      trialExpiresAt: true,
    },
  });

  if (!client || !client.trialExpiresAt) {
    return { isTrial: false, expired: false, daysRemaining: null, limits: NO_LIMITS };
  }

  const now = new Date();
  const expires = new Date(client.trialExpiresAt);
  const expired = now > expires;
  const daysRemaining = expired ? 0 : Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    isTrial: true,
    expired,
    daysRemaining,
    limits: {
      maxMembers: client.maxMembers,
      maxStyles: client.maxStyles,
      maxRanksPerStyle: client.maxRanksPerStyle,
      maxMembershipPlans: client.maxMembershipPlans,
      maxClasses: client.maxClasses,
      maxUsers: client.maxUsers,
      maxLocations: client.maxLocations,
      maxReports: client.maxReports,
      maxPOSItems: client.maxPOSItems,
    },
  };
}

// Generic limit checker
async function checkLimit(
  clientId: string,
  limitKey: keyof TrialLimits,
  currentCount: number,
  label: string
): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getTrialStatus(clientId);
  if (!status.isTrial) return { allowed: true };

  if (status.expired) {
    return { allowed: false, reason: "Trial expired. Contact us to upgrade your plan." };
  }

  const max = status.limits[limitKey];
  if (currentCount >= max) {
    return { allowed: false, reason: `${label} limit reached (${max}). Upgrade your plan to add more.` };
  }

  return { allowed: true };
}

export async function canAddMember(clientId: string): Promise<{ allowed: boolean; reason?: string }> {
  const count = await prisma.member.count({ where: { clientId } });
  return checkLimit(clientId, "maxMembers", count, "Member");
}

export async function canAddStyle(clientId: string): Promise<{ allowed: boolean; reason?: string }> {
  const count = await prisma.style.count({ where: { clientId } });
  return checkLimit(clientId, "maxStyles", count, "Style");
}

export async function canAddRank(clientId: string, styleId: string): Promise<{ allowed: boolean; reason?: string }> {
  const count = await prisma.rank.count({ where: { styleId } });
  return checkLimit(clientId, "maxRanksPerStyle", count, "Rank");
}

export async function canAddMembershipPlan(clientId: string): Promise<{ allowed: boolean; reason?: string }> {
  const count = await prisma.membershipPlan.count({ where: { clientId } });
  return checkLimit(clientId, "maxMembershipPlans", count, "Membership plan");
}

export async function canAddClass(clientId: string): Promise<{ allowed: boolean; reason?: string }> {
  const count = await prisma.classSession.count({ where: { clientId } });
  return checkLimit(clientId, "maxClasses", count, "Class");
}

export async function canAddUser(clientId: string): Promise<{ allowed: boolean; reason?: string }> {
  const count = await prisma.user.count({ where: { clientId } });
  return checkLimit(clientId, "maxUsers", count, "Staff account");
}

export async function canAddLocation(clientId: string): Promise<{ allowed: boolean; reason?: string }> {
  const count = await prisma.location.count({ where: { clientId } });
  return checkLimit(clientId, "maxLocations", count, "Location");
}

export async function canAddPOSItem(clientId: string): Promise<{ allowed: boolean; reason?: string }> {
  const count = await prisma.pOSItem.count({ where: { clientId } });
  return checkLimit(clientId, "maxPOSItems", count, "Inventory item");
}
