import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/classes/rename-type
// Renames a class type and updates all styles' beltConfig that reference it
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { oldClassType, newClassType } = body;

    if (!oldClassType || !newClassType) {
      return NextResponse.json(
        { error: "Both oldClassType and newClassType are required" },
        { status: 400 }
      );
    }

    if (oldClassType === newClassType) {
      return NextResponse.json({ success: true, message: "No change needed" });
    }

    // Update all classes with the old class type (legacy single field)
    const updatedClasses = await prisma.classSession.updateMany({
      where: {
        clientId,
        classType: oldClassType,
      },
      data: {
        classType: newClassType.trim(),
      },
    });

    // Also update classTypes JSON arrays that contain the old name
    const classesWithTypes = await prisma.classSession.findMany({
      where: {
        clientId,
        classTypes: { not: null },
      },
      select: { id: true, classTypes: true },
    });

    for (const cls of classesWithTypes) {
      try {
        const types: string[] = JSON.parse(cls.classTypes!);
        const idx = types.indexOf(oldClassType);
        if (idx !== -1) {
          types[idx] = newClassType.trim();
          await prisma.classSession.update({
            where: { id: cls.id },
            data: { classTypes: JSON.stringify(types) },
          });
        }
      } catch { /* ignore parse errors */ }
    }

    // Update all styles' beltConfig that reference the old class type
    const styles = await prisma.style.findMany({
      where: {
        beltConfig: {
          not: null,
        },
      },
      select: {
        id: true,
        beltConfig: true,
      },
    });

    let stylesUpdated = 0;
    for (const style of styles) {
      try {
        let config: any = null;
        if (typeof style.beltConfig === "string") {
          config = JSON.parse(style.beltConfig);
        } else if (style.beltConfig && typeof style.beltConfig === "object") {
          config = style.beltConfig;
        }

        if (!config || !config.ranks || !Array.isArray(config.ranks)) continue;

        let hasChanges = false;
        const updatedRanks = config.ranks.map((rank: any) => {
          if (!rank.classRequirements || !Array.isArray(rank.classRequirements)) {
            return rank;
          }
          const updatedReqs = rank.classRequirements.map((req: any) => {
            if (req.label === oldClassType) {
              hasChanges = true;
              return { ...req, label: newClassType.trim() };
            }
            return req;
          });
          return { ...rank, classRequirements: updatedReqs };
        });

        if (hasChanges) {
          const updatedConfig = { ...config, ranks: updatedRanks };
          await prisma.style.update({
            where: { id: style.id },
            data: {
              beltConfig: JSON.stringify(updatedConfig),
            },
          });
          stylesUpdated++;
        }
      } catch (e) {
        console.error(`Error updating beltConfig for style ${style.id}:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      classesUpdated: updatedClasses.count,
      stylesUpdated,
    });
  } catch (error) {
    console.error("Error renaming class type:", error);
    return NextResponse.json(
      { error: "Failed to rename class type" },
      { status: 500 }
    );
  }
}
