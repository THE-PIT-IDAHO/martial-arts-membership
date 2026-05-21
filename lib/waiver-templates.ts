// Server-side helpers for the WaiverTemplate model.
//
// Slug rules: lowercase, [a-z0-9-], collapsed dashes, max 60 chars. The
// public share URL is /waivers/sign/<slug>, so slugs must be readable and
// unique per tenant.
import { prisma } from "@/lib/prisma";

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "waiver"
  );
}

export async function uniqueSlug(
  clientId: string,
  base: string,
  ignoreId?: string,
): Promise<string> {
  let slug = base;
  let i = 1;
  for (;;) {
    const existing = await prisma.waiverTemplate.findFirst({
      where: { clientId, slug, NOT: ignoreId ? { id: ignoreId } : undefined },
      select: { id: true },
    });
    if (!existing) return slug;
    i += 1;
    slug = `${base}-${i}`;
  }
}

// Lazily seed two starter templates per tenant on first read. Pulls
// existing waiver_content + waiver_options out of the Settings table so
// nothing visibly changes for current gyms.
export async function ensureSeedTemplates(clientId: string): Promise<void> {
  const existingCount = await prisma.waiverTemplate.count({ where: { clientId } });
  if (existingCount > 0) return;

  const settings = await prisma.settings.findMany({
    where: {
      clientId,
      key: { in: ["waiver_content", "waiver_options"] },
    },
  });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  const content = map.waiver_content || JSON.stringify(DEFAULT_SECTIONS);
  const options = map.waiver_options || JSON.stringify({ includeMinorSignature: true, includeMinorEmail: true });

  const adultSlug = await uniqueSlug(clientId, "default-adult");
  await prisma.waiverTemplate.create({
    data: {
      clientId,
      name: "Default Adult Waiver",
      slug: adultSlug,
      audience: "adult",
      content,
      options,
      isDefault: true,
      isActive: true,
    },
  });

  const guardianSlug = await uniqueSlug(clientId, "default-guardian");
  await prisma.waiverTemplate.create({
    data: {
      clientId,
      name: "Default Guardian / Dependent Waiver",
      slug: guardianSlug,
      audience: "guardian",
      content,
      options,
      isDefault: true,
      isActive: true,
    },
  });
}

const DEFAULT_SECTIONS = [
  {
    id: "assumption_of_risk",
    title: "ASSUMPTION OF RISK",
    content:
      "I, {{MEMBER_NAME}}, understand that martial arts training at {{GYM_NAME}} involves physical contact and strenuous physical activity. I acknowledge that there are inherent risks associated with martial arts training including, but not limited to, bruises, sprains, strains, fractures, and other injuries that may occur during training, sparring, or practice.",
  },
  {
    id: "waiver_release",
    title: "WAIVER AND RELEASE",
    content:
      "In consideration of being permitted to participate in martial arts classes, training, and related activities at {{GYM_NAME}}, I hereby waive, release, and discharge {{GYM_NAME}}, its owners, instructors, employees, and agents from any and all liability, claims, demands, and causes of action arising out of or related to any loss, damage, or injury that may be sustained by me or my minor child while participating in such activities.",
  },
  {
    id: "medical_authorization",
    title: "MEDICAL AUTHORIZATION",
    content:
      "I authorize the staff of {{GYM_NAME}} to obtain emergency medical treatment for myself or my minor child if necessary. I understand that I am responsible for any medical expenses incurred.",
  },
  {
    id: "photo_video_release",
    title: "PHOTO/VIDEO RELEASE",
    content:
      "I grant {{GYM_NAME}} permission for photographs and/or videos taken during classes or events to be used for promotional purposes, including but not limited to websites, social media, and marketing materials.",
  },
  {
    id: "rules_regulations",
    title: "RULES AND REGULATIONS",
    content:
      "I agree to abide by all rules and regulations of {{GYM_NAME}}. I understand that failure to follow instructions or rules may result in dismissal from the program without refund.",
  },
  {
    id: "health_declaration",
    title: "HEALTH DECLARATION",
    content:
      "I, {{MEMBER_NAME}}, certify that I (or my minor child) am in good physical condition and have no medical conditions that would prevent safe participation in martial arts training. I agree to notify the instructors of any changes in health status.",
  },
  {
    id: "closing_statement",
    title: "",
    content:
      "I, {{MEMBER_NAME}}, HAVE READ THIS WAIVER AND RELEASE, FULLY UNDERSTAND ITS TERMS, AND SIGN IT FREELY AND VOLUNTARILY WITHOUT ANY INDUCEMENT.",
  },
];
