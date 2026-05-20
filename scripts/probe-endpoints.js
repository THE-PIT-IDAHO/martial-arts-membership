// Quick diagnostic: hit each slow endpoint via Prisma directly and report
// row counts + payload sizes for the columns most likely to be hidden bloat.
//
// Usage: node scripts/probe-endpoints.js
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
  console.log("=".repeat(60));
  console.log("Endpoint payload probe");
  console.log("=".repeat(60));

  // Members — what /api/members returns by default
  const members = await p.member.findMany();
  const memberJson = JSON.stringify(members);
  console.log(`\nMember rows: ${members.length}`);
  console.log(`  /api/members raw payload: ${fmt(memberJson.length)}`);

  // Per-member breakdown of suspect heavy fields
  let stylesNotesTotal = 0, styleDocumentsTotal = 0, notesTotal = 0, medicalNotesTotal = 0, paymentNotesTotal = 0;
  for (const m of members) {
    stylesNotesTotal += (m.stylesNotes || "").length;
    styleDocumentsTotal += (m.styleDocuments || "").length;
    notesTotal += (m.notes || "").length;
    medicalNotesTotal += (m.medicalNotes || "").length;
    paymentNotesTotal += (m.paymentNotes || "").length;
  }
  console.log(`    stylesNotes total:      ${fmt(stylesNotesTotal)}`);
  console.log(`    styleDocuments total:   ${fmt(styleDocumentsTotal)}  ← biggest suspect`);
  console.log(`    notes total:            ${fmt(notesTotal)}`);
  console.log(`    medicalNotes total:     ${fmt(medicalNotesTotal)}`);
  console.log(`    paymentNotes total:     ${fmt(paymentNotesTotal)}`);

  // Per-member that have anything heavy
  const heavy = members
    .map((m) => ({
      name: `${m.firstName} ${m.lastName}`,
      total: (m.stylesNotes || "").length + (m.styleDocuments || "").length + (m.notes || "").length + (m.medicalNotes || "").length + (m.paymentNotes || "").length,
      doc: (m.styleDocuments || "").length,
      styles: (m.stylesNotes || "").length,
    }))
    .filter((m) => m.total > 10000)
    .sort((a, b) => b.total - a.total);
  if (heavy.length) {
    console.log(`\n  Members with >10KB of text fields:`);
    for (const h of heavy) console.log(`    ${h.name}: ${fmt(h.total)}  (styleDocuments ${fmt(h.doc)}, stylesNotes ${fmt(h.styles)})`);
  }

  // Classes
  const classes = await p.classSession.findMany();
  console.log(`\nClassSession rows: ${classes.length}`);
  console.log(`  /api/classes raw payload: ${fmt(JSON.stringify(classes).length)}`);

  // Membership plans (memberships page)
  const plans = await p.membershipPlan.findMany();
  console.log(`\nMembershipPlan rows: ${plans.length}`);
  console.log(`  /api/membership-plans raw payload: ${fmt(JSON.stringify(plans).length)}`);

  // POS items
  const items = await p.pOSItem.findMany();
  console.log(`\nPOSItem rows: ${items.length}`);
  console.log(`  /api/pos/items raw payload: ${fmt(JSON.stringify(items).length)}`);

  // Signed waivers (waivers page)
  const waivers = await p.signedWaiver.findMany();
  let pdfDataTotal = 0;
  for (const w of waivers) pdfDataTotal += (w.pdfData || "").length;
  console.log(`\nSignedWaiver rows: ${waivers.length}`);
  console.log(`  raw payload (all rows): ${fmt(JSON.stringify(waivers).length)}`);
  console.log(`    pdfData total:        ${fmt(pdfDataTotal)}  ← if waivers page returns this, it's heavy`);

  // Signed contracts
  const contracts = await p.signedContract.findMany();
  let contractPdfTotal = 0;
  for (const c of contracts) contractPdfTotal += (c.pdfData || "").length;
  console.log(`\nSignedContract rows: ${contracts.length}`);
  console.log(`  raw payload: ${fmt(JSON.stringify(contracts).length)}`);
  console.log(`    pdfData total: ${fmt(contractPdfTotal)}`);

  // POS transactions (reports + POS)
  const txns = await p.pOSTransaction.findMany({ include: { POSLineItem: true } });
  console.log(`\nPOSTransaction rows: ${txns.length}`);
  console.log(`  raw payload (incl. line items): ${fmt(JSON.stringify(txns).length)}`);

  // Board posts (Dojo Board)
  const posts = await p.boardPost.findMany({ include: { replies: true, files: true } });
  console.log(`\nBoardPost rows: ${posts.length}`);
  console.log(`  raw payload (incl. replies+files): ${fmt(JSON.stringify(posts).length)}`);

  // Promotions
  const proms = await p.promotionEvent.findMany({ include: { participants: true } });
  console.log(`\nPromotionEvent rows: ${proms.length}`);
  console.log(`  raw payload: ${fmt(JSON.stringify(proms).length)}`);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
