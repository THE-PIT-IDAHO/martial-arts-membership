const { PrismaClient } = require("@prisma/client");
const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

p.signedWaiver
  .findMany({
    select: {
      id: true,
      templateName: true,
      signedAt: true,
      memberId: true,
      signatureData: true,
    },
    orderBy: { signedAt: "desc" },
  })
  .then(async (waivers) => {
    console.log(`Found ${waivers.length} signed waiver(s).\n`);
    for (const w of waivers) {
      const sig = w.signatureData;
      const len = sig ? sig.length : 0;
      const looksLikeDataUri = sig && sig.startsWith("data:image");
      const member = await p.member.findUnique({
        where: { id: w.memberId },
        select: { firstName: true, lastName: true },
      }).catch(() => null);
      const name = member ? `${member.firstName} ${member.lastName}` : "(unknown)";
      console.log(`Waiver ${w.id.slice(0, 8)}…  member: ${name}  template: ${w.templateName}`);
      console.log(`  signedAt:        ${w.signedAt?.toISOString() || "(null)"}`);
      console.log(`  signatureData:   ${sig ? `${len} chars` : "(NULL/EMPTY)"}`);
      console.log(`  valid data URI:  ${looksLikeDataUri ? "yes" : "no"}`);
      if (sig) {
        console.log(`  starts with:     ${sig.slice(0, 50)}…`);
      }
      console.log("");
    }
    await p.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    p.$disconnect();
    process.exit(1);
  });
