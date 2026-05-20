const { PrismaClient } = require("@prisma/client");
const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  const clients = await p.client.findMany({ select: { id: true, name: true, slug: true } });
  console.log("Clients:", clients);

  const membersByClient = await p.member.groupBy({ by: ["clientId"], _count: true });
  console.log("Members by clientId:", membersByClient);

  const stylesByClient = await p.style.groupBy({ by: ["clientId"], _count: true });
  console.log("Styles by clientId:", stylesByClient);

  const settingsByClient = await p.settings.groupBy({ by: ["clientId"], _count: true });
  console.log("Settings by clientId:", settingsByClient);

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
