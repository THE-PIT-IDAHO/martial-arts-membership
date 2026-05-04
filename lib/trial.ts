import { prisma } from "@/lib/prisma";

type TrialStatus = {
  isTrial: boolean;
  expired: boolean;
  daysRemaining: number | null;
  maxMembers: number;
  maxStyles: number;
  currentMembers?: number;
  currentStyles?: number;
};

/**
 * Get trial status for a client. If trialExpiresAt is null, the client
 * is on a full plan with no limits.
 */
export async function getTrialStatus(clientId: string): Promise<TrialStatus> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { maxMembers: true, maxStyles: true, trialExpiresAt: true },
  });

  if (!client || !client.trialExpiresAt) {
    return { isTrial: false, expired: false, daysRemaining: null, maxMembers: Infinity, maxStyles: Infinity };
  }

  const now = new Date();
  const expires = new Date(client.trialExpiresAt);
  const expired = now > expires;
  const daysRemaining = expired ? 0 : Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    isTrial: true,
    expired,
    daysRemaining,
    maxMembers: client.maxMembers,
    maxStyles: client.maxStyles,
  };
}

/**
 * Check if a trial client can add another member.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export async function canAddMember(clientId: string): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getTrialStatus(clientId);
  if (!status.isTrial) return { allowed: true };

  if (status.expired) {
    return { allowed: false, reason: `Trial expired. Contact us to upgrade your plan.` };
  }

  const count = await prisma.member.count({ where: { clientId } });
  if (count >= status.maxMembers) {
    return { allowed: false, reason: `Member limit reached (${status.maxMembers}). Upgrade your plan to add more members.` };
  }

  return { allowed: true };
}

/**
 * Check if a trial client can add another style.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export async function canAddStyle(clientId: string): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getTrialStatus(clientId);
  if (!status.isTrial) return { allowed: true };

  if (status.expired) {
    return { allowed: false, reason: `Trial expired. Contact us to upgrade your plan.` };
  }

  const count = await prisma.style.count();
  if (count >= status.maxStyles) {
    return { allowed: false, reason: `Style limit reached (${status.maxStyles}). Upgrade your plan to add more styles.` };
  }

  return { allowed: true };
}
