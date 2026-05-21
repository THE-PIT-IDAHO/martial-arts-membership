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

type PageProps = { params: Promise<{ slug: string }> };

export default async function WaiverSignPage({ params }: PageProps) {
  const { slug } = await params;
  const clientId = await getClientId();

  const template = await prisma.waiverTemplate.findFirst({
    where: { clientId, slug, archivedAt: null, isActive: true },
    select: { audience: true, slug: true },
  });
  if (!template || !template.slug) notFound();

  const target = template.audience === "guardian" ? "/waivers/new/guardian" : "/waivers/new/adult";
  redirect(`${target}?template=${encodeURIComponent(template.slug)}`);
}
