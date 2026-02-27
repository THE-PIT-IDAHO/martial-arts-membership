import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/portal/features — returns which portal features are enabled
// Public endpoint (no auth required) so the portal UI can check before rendering
export async function GET() {
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: {
          startsWith: "portal_feature_",
        },
      },
    });

    const features: Record<string, boolean> = {
      classes: true,
      messages: true,
      store_goods: true,
      store_services: true,
      styles: true,
      bookings: true,
      attendance: true,
      memberships: true,
      board: true,
      appointments: true,
    };

    for (const s of settings) {
      const featureName = s.key.replace("portal_feature_", "");
      features[featureName] = s.value !== "false";
    }

    // Legacy: if old "store" key exists and new keys don't, use it for both
    if ("store" in features) {
      if (!settings.some((s) => s.key === "portal_feature_store_goods")) {
        features.store_goods = features.store;
      }
      if (!settings.some((s) => s.key === "portal_feature_store_services")) {
        features.store_services = features.store;
      }
    }

    // Derived: store is visible if either goods or services is on
    features.store = features.store_goods || features.store_services;

    return NextResponse.json({ features });
  } catch (error) {
    console.error("Error fetching portal features:", error);
    return NextResponse.json({
      features: {
        classes: true,
        messages: true,
        store: true,
        store_goods: true,
        store_services: true,
        styles: true,
        bookings: true,
        attendance: true,
        memberships: true,
        board: true,
        appointments: true,
      },
    });
  }
}
