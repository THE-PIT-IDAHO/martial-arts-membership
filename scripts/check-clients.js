const { PrismaClient } = require("@prisma/client");
const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

p.client.findMany({ select: { id: true, name: true, slug: true } })
  .then(r => console.log("Clients:", r))
  .then(() => p.style.findMany({ select: { id: true, name: true, clientId: true } }))
  .then(r => console.log("Styles:", r))
  .finally(() => p.$disconnect());
