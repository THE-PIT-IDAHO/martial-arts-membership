/**
 * Migrate data from SQLite (prisma/dev.db) to PostgreSQL using raw SQL.
 *
 * Usage:  node scripts/migrate-sqlite-to-postgres.js
 */

const Database = require("better-sqlite3");
const { PrismaClient } = require("@prisma/client");
const path = require("path");

const SQLITE_PATH = path.join(__dirname, "..", "prisma", "dev.db");

// Tables in insertion order (parents before children to satisfy FKs)
const TABLES = [
  "Client", "Style", "Settings", "AuditLog", "EmailTemplate", "Location",
  "BoardEvent", "WeeklyFocus", "GiftCertificate", "PromoCode",
  "User", "Program", "MembershipType", "Rank", "Appointment", "Task",
  "BoardChannel", "TestingEvent", "PromotionEvent", "WaiverTemplate",
  "DirectConversation",
  "Member", "MembershipPlan", "ClassSession", "RankTest",
  "ScheduledAppointment", "BoardPost", "BoardPoll",
  "DirectConversationMember",
  "Membership", "Attendance", "MemberRelationship", "MemberAuthToken",
  "MemberSession", "ClassBooking", "EnrollmentSubmission",
  "POSItem", "POSTransaction", "SignedWaiver", "TrialPass",
  "RankTestCategory", "BoardFile", "BoardReply", "BoardPollOption",
  "DirectMessage", "TestingParticipant", "PromotionParticipant", "Invoice",
  "POSItemVariant", "POSLineItem", "RankTestItem", "BoardPollVote",
];

const BOOLEAN_FIELDS = new Set([
  "isActive", "isRecurring", "isOngoing", "kioskEnabled", "bookingEnabled",
  "waiverSigned", "emailOptIn", "autoRenew", "firstMonthDiscountOnly",
  "beltSystemEnabled", "required", "showTitleInPdf", "isPriority",
  "allowMultiple", "isAnonymous", "availableOnline", "isCustom", "enabled",
  "isDefault", "confirmed", "requirementOverride", "membersVisible",
  "isRead", "hasUpdates", "feeCharged",
]);

function quoteIdent(name) {
  return `"${name}"`;
}

function formatValue(key, value, pgType) {
  if (value === null || value === undefined) return "NULL";

  if (BOOLEAN_FIELDS.has(key)) {
    return value === 1 || value === true || value === "true" ? "true" : "false";
  }

  // Handle timestamp columns — SQLite may store as epoch ms (bigint) or ISO string
  if (pgType && pgType.includes("timestamp")) {
    if (typeof value === "number" || typeof value === "bigint") {
      // Epoch milliseconds → ISO string
      const d = new Date(Number(value));
      return `'${d.toISOString()}'`;
    }
    if (typeof value === "string") {
      // Already an ISO string, pass through
      const str = value.replace(/'/g, "''");
      return `'${str}'`;
    }
    return "NULL";
  }

  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return String(value);

  // String value — escape quotes
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

async function main() {
  console.log("Opening SQLite database:", SQLITE_PATH);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const prisma = new PrismaClient();

  // Get actual SQLite tables
  const sqliteTables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);

  console.log("SQLite tables found:", sqliteTables.length);

  // Get Postgres column names AND types so we can handle timestamp conversion
  const pgTablesResult = await prisma.$queryRaw`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  const pgColumns = {};   // table -> Set of column names
  const pgColTypes = {};   // table -> { column -> data_type }
  for (const row of pgTablesResult) {
    const t = row.table_name;
    if (!pgColumns[t]) {
      pgColumns[t] = new Set();
      pgColTypes[t] = {};
    }
    pgColumns[t].add(row.column_name);
    pgColTypes[t][row.column_name] = row.data_type;
  }

  let totalRows = 0;
  let migratedTables = 0;

  for (const table of TABLES) {
    if (!sqliteTables.includes(table)) {
      console.log(`  SKIP ${table} (not in SQLite)`);
      continue;
    }
    if (!pgColumns[table]) {
      console.log(`  SKIP ${table} (not in Postgres)`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    if (rows.length === 0) {
      console.log(`  SKIP ${table} (0 rows)`);
      continue;
    }

    // Find columns that exist in BOTH SQLite data and Postgres schema
    const sqliteColumns = Object.keys(rows[0]);
    const validColumns = sqliteColumns.filter((col) => pgColumns[table].has(col));
    const colTypes = pgColTypes[table];

    if (validColumns.length === 0) {
      console.log(`  SKIP ${table} (no matching columns)`);
      continue;
    }

    console.log(`  Migrating ${table}: ${rows.length} rows (${validColumns.length} columns)...`);

    const BATCH = 50;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);

      const colList = validColumns.map(quoteIdent).join(", ");
      const valueRows = batch.map((row) => {
        const vals = validColumns.map((col) => formatValue(col, row[col], colTypes[col]));
        return `(${vals.join(", ")})`;
      });

      const sql = `INSERT INTO "${table}" (${colList}) VALUES ${valueRows.join(",\n")} ON CONFLICT DO NOTHING`;

      try {
        await prisma.$executeRawUnsafe(sql);
        inserted += batch.length;
      } catch (err) {
        // Try one at a time on batch failure
        for (const row of batch) {
          const vals = validColumns.map((col) => formatValue(col, row[col], colTypes[col]));
          const singleSql = `INSERT INTO "${table}" (${colList}) VALUES (${vals.join(", ")}) ON CONFLICT DO NOTHING`;
          try {
            await prisma.$executeRawUnsafe(singleSql);
            inserted++;
          } catch (innerErr) {
            errors++;
            if (errors <= 5) {
              console.log(`    ERR: ${table} id=${row.id}: ${innerErr.message.slice(0, 250)}`);
            }
          }
        }
      }
    }

    if (errors > 5) console.log(`    ... and ${errors - 5} more errors`);
    console.log(`    -> ${inserted} inserted, ${errors} errors`);
    totalRows += inserted;
    if (inserted > 0) migratedTables++;
  }

  console.log(`\nDone! Migrated ${totalRows} rows across ${migratedTables} tables.`);

  await prisma.$disconnect();
  sqlite.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
