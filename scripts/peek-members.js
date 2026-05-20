const { PrismaClient } = require("@prisma/client");
const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

p.member
  .findMany({
    select: {
      firstName: true,
      lastName: true,
      email: true,
      memberNumber: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })
  .then((m) => {
    console.log(`Found ${m.length} member(s):\n`);
    m.forEach((row, i) => {
      console.log(
        `${i + 1}. ${row.firstName} ${row.lastName}  #${row.memberNumber || "?"}  [${row.status}]  ${row.email || "(no email)"}  created ${row.createdAt.toISOString().split("T")[0]}`
      );
    });
    p.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    p.$disconnect();
    process.exit(1);
  });
