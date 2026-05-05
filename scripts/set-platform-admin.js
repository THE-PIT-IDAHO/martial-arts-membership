const { PrismaClient } = require("@prisma/client");
const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  let client = await p.client.findUnique({ where: { slug: "thepitidaho" } });
  if (!client) client = await p.client.findUnique({ where: { slug: "app" } });
  if (!client) { console.log("Client not found"); return; }

  await p.client.update({ where: { id: client.id }, data: { isPlatformAdmin: true } });
  console.log(`Set "${client.name}" as platform admin`);
  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
