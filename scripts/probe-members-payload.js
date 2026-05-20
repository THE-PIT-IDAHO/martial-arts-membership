// Pinpoints which field(s) in the /api/members response are eating bytes.
// Runs the exact same select the API uses, then reports per-field totals.
//
// Usage:
//   node scripts/probe-members-payload.js                     (uses local .env DB)
//   node scripts/probe-members-payload.js "postgres://..."    (uses passed DB URL)
const { PrismaClient } = require("@prisma/client");

const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  console.log("=".repeat(64));
  console.log("/api/members payload breakdown (using lean select)");
  console.log("=".repeat(64));

  const members = await p.member.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      photoUrl: true,
      primaryStyle: true,
      stylesNotes: true,
      status: true,
      dateOfBirth: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      parentGuardianName: true,
      minorCommsMode: true,
      startDate: true,
      rank: true,
      uniformSize: true,
      waiverSigned: true,
      waiverSignedAt: true,
      emailOptIn: true,
      membershipType: true,
      clientId: true,
      createdAt: true,
      updatedAt: true,
      memberNumber: true,
      accountCreditCents: true,
      accessRole: true,
      stripeCustomerId: true,
      defaultPaymentMethodId: true,
      paypalPayerId: true,
      squareCustomerId: true,
      leadSource: true,
      referredByMemberId: true,
      memberships: {
        where: { status: { in: ["ACTIVE", "CANCELED", "CANCELLED"] } },
        include: {
          membershipPlan: {
            select: {
              id: true,
              name: true,
              priceCents: true,
              autoRenew: true,
              billingCycle: true,
              allowedStyles: true,
              membershipType: true,
            },
          },
        },
      },
      trialPasses: {
        where: { status: "ACTIVE" },
        select: { id: true, status: true, classesUsed: true, maxClasses: true, expiresAt: true },
      },
    },
  });

  console.log(`\nMember rows returned: ${members.length}`);
  const totalSize = JSON.stringify(members).length;
  console.log(`Total payload size:   ${fmt(totalSize)}\n`);

  // Per-field totals
  const fieldTotals = {};
  for (const m of members) {
    for (const [key, val] of Object.entries(m)) {
      const size = JSON.stringify(val ?? null).length;
      fieldTotals[key] = (fieldTotals[key] || 0) + size;
    }
  }

  console.log("Per-field totals (across all members), sorted heaviest first:");
  const sorted = Object.entries(fieldTotals).sort((a, b) => b[1] - a[1]);
  for (const [field, bytes] of sorted) {
    const pct = ((bytes / totalSize) * 100).toFixed(1);
    console.log(`  ${field.padEnd(28)} ${fmt(bytes).padStart(10)}   (${pct}%)`);
  }

  // Drill into the biggest per-member fields if any single member is heavy
  console.log("\nHeaviest individual members:");
  const memberSizes = members
    .map((m) => ({ name: `${m.firstName} ${m.lastName}`, size: JSON.stringify(m).length, m }))
    .sort((a, b) => b.size - a.size);
  for (const row of memberSizes.slice(0, 5)) {
    console.log(`  ${row.name.padEnd(28)} ${fmt(row.size)}`);
    // Show heaviest fields for this member
    const fieldsOfMember = Object.entries(row.m)
      .map(([k, v]) => [k, JSON.stringify(v ?? null).length])
      .filter(([, sz]) => sz > 1000)
      .sort((a, b) => b[1] - a[1]);
    for (const [k, sz] of fieldsOfMember.slice(0, 4)) {
      console.log(`      ${k.padEnd(24)} ${fmt(sz)}`);
    }
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
