// Public sign URL per template — e.g. /waivers/sign/summer-camp-2026.
//
// Server component that looks up the template by slug and redirects to the
// correct form (adult or guardian) carrying the template slug as a query
// param. The form pages handle the rest: they fetch the template's content
// + options instead of the tenant's global defaults.
//
// We don't render the form here so the URL stays semantic per template and
// 404s for archived/unknown slugs land on the same place as a typo.
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WaiverSignPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const clientId = await getClientId();

  const template = await prisma.waiverTemplate.findFirst({
    where: { clientId, slug, archivedAt: null, isActive: true },
    select: { audience: true, slug: true },
  });
  if (!template || !template.slug) notFound();

  const target = template.audience === "guardian" ? "/waivers/new/guardian" : "/waivers/new/adult";
  const query = new URLSearchParams();
  query.set("template", template.slug);
  // Forward member-prefill params the picker page added on. Adult flow
  // uses memberId, guardian flow uses parentMemberId.
  const memberId = typeof sp.memberId === "string" ? sp.memberId : "";
  const parentMemberId = typeof sp.parentMemberId === "string" ? sp.parentMemberId : "";
  if (template.audience === "guardian" && parentMemberId) query.set("parentMemberId", parentMemberId);
  if (template.audience === "adult" && memberId) query.set("memberId", memberId);

  redirect(`${target}?${query.toString()}`);
}
