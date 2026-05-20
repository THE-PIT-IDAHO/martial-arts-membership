// Probe the endpoints that the Waivers + Reports pages hit. Reports size +
// approximate query time per endpoint so we can identify what's heavy.
//
// Usage: node scripts/probe-waivers-reports.js "postgres://..."
const fs = require("fs");
const path = require("path");
function loadEnvFile(filename) {
  const fp = path.join(process.cwd(), filename);
  if (!fs.existsSync(fp)) return;
  const content = fs.readFileSync(fp, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

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

async function time(label, fn) {
  const t0 = Date.now();
  const result = await fn();
  const ms = Date.now() - t0;
  const size = JSON.stringify(result).length;
  console.log(`  ${label.padEnd(36)} ${String(ms).padStart(5)}ms   ${fmt(size).padStart(10)}   (${Array.isArray(result) ? result.length + " rows" : "obj"})`);
  return { result, ms, size };
}

async function main() {
  console.log("=".repeat(72));
  console.log("Waivers + Reports endpoint probe");
  console.log("=".repeat(72));

  // ===== Waivers page =====
  console.log("\nWaivers page calls:");
  await time("/api/waivers/pending (current select)", () =>
    p.signedWaiver.findMany({
      where: { confirmed: false },
      orderBy: { signedAt: "desc" },
      select: {
        id: true, memberId: true, templateName: true, signedAt: true,
        ipAddress: true, confirmed: true, confirmedAt: true, clientId: true,
        member: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true } },
      },
    })
  );

  // What it'd look like with default include — for comparison
  await time("  ⚠ if we returned full pdfData", () =>
    p.signedWaiver.findMany({ where: { confirmed: false }, take: 10 })
  );

  // Total signed waivers
  const allWaivers = await p.signedWaiver.findMany({ select: { pdfData: true, signatureData: true } });
  let pdfTotal = 0, sigTotal = 0;
  for (const w of allWaivers) {
    pdfTotal += (w.pdfData || "").length;
    sigTotal += (w.signatureData || "").length;
  }
  console.log(`  SignedWaiver rows: ${allWaivers.length}  pdfData: ${fmt(pdfTotal)}  signatureData: ${fmt(sigTotal)}`);

  // ===== Reports page =====
  console.log("\nReports page calls:");
  await time("/api/reports/attendance?allTime=true", () =>
    p.attendance.findMany({
      select: {
        id: true, memberId: true, attendanceDate: true, source: true,
        member: { select: { id: true, firstName: true, lastName: true } },
        classSession: { select: { id: true, name: true, styleName: true, styleNames: true, classType: true } },
      },
      orderBy: { attendanceDate: "desc" },
    })
  );
  await time("/api/pos/transactions", () =>
    p.pOSTransaction.findMany({ include: { POSLineItem: true }, orderBy: { createdAt: "desc" } })
  );
  await time("/api/invoices?status=PAID", () =>
    p.invoice.findMany({
      where: { status: "PAID" },
      select: {
        id: true, invoiceNumber: true, amountCents: true, status: true,
        billingPeriodStart: true, billingPeriodEnd: true, dueDate: true, paidAt: true,
        paymentMethod: true, transactionId: true, externalPaymentId: true, paymentProcessor: true,
        notes: true, createdAt: true,
        member: { select: { id: true, firstName: true, lastName: true } },
        membership: { select: { id: true, membershipPlan: { select: { name: true, billingCycle: true } } } },
      },
      orderBy: { dueDate: "desc" },
    })
  );
  await time("/api/membership-plans (full)", () => p.membershipPlan.findMany());
  await time("/api/membership-types", () => p.membershipType.findMany());
  await time("/api/styles (lean)", () =>
    p.style.findMany({ include: { ranks: { select: { id: true, name: true, order: true } } } })
  );
  await time("/api/classes?types=true", () => p.classSession.findMany({ select: { id: true, classType: true, classTypes: true, styleName: true } }));

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
