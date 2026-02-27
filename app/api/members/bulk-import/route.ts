// app/api/members/bulk-import/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

const MIN_MEMBER_NUMBER = 10000000;

function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  // Handle various date formats
  const str = String(value).trim();
  if (!str) return null;

  // Try parsing as-is first
  let d = new Date(str);
  if (!Number.isNaN(d.getTime())) return d;

  // Try MM/DD/YYYY format
  const parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    // If first part looks like year (4 digits)
    if (a.length === 4) {
      d = new Date(`${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`);
    } else {
      // Assume MM/DD/YYYY
      d = new Date(`${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`);
    }
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

// Get next available member numbers starting from a given number
async function getNextMemberNumbers(count: number): Promise<number[]> {
  const existing = await prisma.member.findMany({
    where: {
      memberNumber: {
        gte: MIN_MEMBER_NUMBER,
      },
    },
    select: { memberNumber: true },
    orderBy: { memberNumber: "asc" },
  });

  const existingSet = new Set(existing.map(e => e.memberNumber).filter(n => n !== null));
  const numbers: number[] = [];
  let candidate = MIN_MEMBER_NUMBER;

  while (numbers.length < count) {
    if (!existingSet.has(candidate)) {
      numbers.push(candidate);
    }
    candidate++;
  }

  return numbers;
}

type ImportMember = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  parentGuardianName?: string;
  notes?: string;
  medicalNotes?: string;
  style?: string;
  rank?: string;
  lastPromotionDate?: string;
};

// POST /api/members/bulk-import
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { members: importMembers } = body as { members: ImportMember[] };

    if (!importMembers || !Array.isArray(importMembers) || importMembers.length === 0) {
      return NextResponse.json(
        { error: "No members provided for import" },
        { status: 400 }
      );
    }

    // Validate all members have required fields
    const errors: string[] = [];
    importMembers.forEach((m, idx) => {
      if (!m.firstName || !m.lastName) {
        errors.push(`Row ${idx + 1}: First name and last name are required`);
      }
    });

    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 }
      );
    }

    // Resolve tenant clientId from request header
    const clientId = await getClientId(req);

    // Get member numbers for all imports
    const memberNumbers = await getNextMemberNumbers(importMembers.length);

    // Get all styles with their belt configs for style/rank validation
    const allStyles = await prisma.style.findMany({
      select: {
        id: true,
        name: true,
        beltConfig: true,
      },
    });

    // Build a map of style name (lowercase) -> { id, name, ranks[] }
    const styleMap = new Map<string, { id: string; name: string; ranks: string[] }>();
    for (const style of allStyles) {
      let ranks: string[] = [];
      if (style.beltConfig) {
        try {
          const config = typeof style.beltConfig === "string"
            ? JSON.parse(style.beltConfig)
            : style.beltConfig;
          if (config?.ranks && Array.isArray(config.ranks)) {
            ranks = config.ranks.map((r: any) => r.name).filter((n: any) => typeof n === "string");
          }
        } catch {
          // Ignore parse errors
        }
      }
      styleMap.set(style.name.toLowerCase().trim(), { id: style.id, name: style.name, ranks });
    }

    // Prepare member data with style/rank info
    const memberDataList = importMembers.map((m, idx) => {
      // Process style, rank, and lastPromotionDate if provided
      const styleInput = m.style?.trim();
      const rankInput = m.rank?.trim();
      const lastPromotionDateInput = m.lastPromotionDate?.trim();

      // Only set style/rank data if style is valid and exists in the system
      let primaryStyle: string | null = null;
      let rank: string | null = null;
      let stylesNotes: string | null = null;

      if (styleInput) {
        const styleInfo = styleMap.get(styleInput.toLowerCase());
        if (styleInfo) {
          primaryStyle = styleInfo.name;

          // Validate rank if provided
          if (rankInput) {
            // Case-insensitive rank matching
            const matchedRank = styleInfo.ranks.find(
              r => r.toLowerCase() === rankInput.toLowerCase()
            );
            if (matchedRank) {
              rank = matchedRank;
            }
          }

          // Build stylesNotes JSON with lastPromotionDate if provided
          // Style is set to inactive until a membership is attached
          const styleEntry: any = { name: styleInfo.name, active: false };
          if (rank) {
            styleEntry.rank = rank;
          }
          // Only add lastPromotionDate if we have a valid date
          const promotionDate = toDateOrNull(lastPromotionDateInput);
          if (promotionDate) {
            styleEntry.lastPromotionDate = promotionDate.toISOString().split('T')[0];
          }
          stylesNotes = JSON.stringify([styleEntry]);
        }
      }

      // Build base member data
      const memberData: any = {
        firstName: m.firstName.trim(),
        lastName: m.lastName.trim(),
        email: m.email?.trim() || null,
        phone: m.phone?.trim() || null,
        clientId,
        status: m.status?.toUpperCase().trim() || "PROSPECT",
        memberNumber: memberNumbers[idx],
        dateOfBirth: toDateOrNull(m.dateOfBirth),
        address: m.address?.trim() || null,
        city: m.city?.trim() || null,
        state: m.state?.trim() || null,
        zipCode: m.zipCode?.trim() || null,
        emergencyContactName: m.emergencyContactName?.trim() || null,
        emergencyContactPhone: m.emergencyContactPhone?.trim() || null,
        parentGuardianName: m.parentGuardianName?.trim() || null,
        notes: m.notes?.trim() || null,
        medicalNotes: m.medicalNotes?.trim() || null,
        waiverSigned: false,
      };

      // Only add style/rank fields if we have valid style data
      if (primaryStyle) {
        memberData.primaryStyle = primaryStyle;
        if (rank) {
          memberData.rank = rank;
        }
        if (stylesNotes) {
          memberData.stylesNotes = stylesNotes;
        }
      }

      return memberData;
    });

    // Create all members in a transaction
    const created = await prisma.$transaction(
      memberDataList.map((data) =>
        prisma.member.create({ data })
      )
    );

    return NextResponse.json(
      {
        success: true,
        imported: created.length,
        members: created
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/members/bulk-import error:", err);
    return NextResponse.json(
      { error: "Failed to import members" },
      { status: 500 }
    );
  }
}
