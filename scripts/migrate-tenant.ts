/**
 * Migration script: Set up multi-tenancy for existing data.
 *
 * Run with: npx tsx scripts/migrate-tenant.ts
 *
 * What it does:
 * 1. Creates a Client record with slug "app" (the default tenant)
 * 2. Updates all existing records with clientId "default-client" to use the real Client ID
 * 3. Updates the admin User's clientId to point to the new Client
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_SLUG = "app";
const DEFAULT_NAME = "Default Gym";
const OLD_CLIENT_ID = "default-client";

async function main() {
  console.log("Starting multi-tenancy migration...\n");

  // 1. Create or find the default Client
  let client = await prisma.client.findUnique({ where: { slug: DEFAULT_SLUG } });

  if (!client) {
    client = await prisma.client.create({
      data: {
        name: DEFAULT_NAME,
        slug: DEFAULT_SLUG,
      },
    });
    console.log(`Created Client: "${client.name}" (slug: ${client.slug}, id: ${client.id})`);
  } else {
    console.log(`Client already exists: "${client.name}" (slug: ${client.slug}, id: ${client.id})`);
  }

  const newClientId = client.id;

  // 2. Update all models that have clientId = "default-client"
  const models = [
    "member",
    "settings",
    "emailTemplate",
    "location",
    "space",
    "testingEvent",
    "promotionEvent",
    "boardEvent",
    "weeklyFocus",
    "giftCertificate",
    "directConversation",
    "directMessage",
    "invoice",
    "enrollmentSubmission",
    "promoCode",
    "auditLog",
    "waiverTemplate",
    "signedWaiver",
    "signedContract",
    "trialPass",
    "servicePackage",
    "memberServiceCredit",
    "coachAvailability",
    "calendarEvent",
    "pOSItem",
    "pOSTransaction",
    "membershipType",
  ];

  for (const model of models) {
    try {
      // @ts-expect-error - dynamic model access
      const result = await prisma[model].updateMany({
        where: { clientId: OLD_CLIENT_ID },
        data: { clientId: newClientId },
      });
      if (result.count > 0) {
        console.log(`  Updated ${result.count} ${model} records`);
      }
    } catch (error) {
      console.log(`  Skipped ${model} (no clientId field or error)`);
    }
  }

  // 3. Update User records (User.clientId has a foreign key, so we need the Client to exist first)
  const userResult = await prisma.user.updateMany({
    where: { clientId: OLD_CLIENT_ID },
    data: { clientId: newClientId },
  });
  if (userResult.count > 0) {
    console.log(`  Updated ${userResult.count} user records`);
  }

  // 4. Update models that reference Client via foreign key (Member, ClassSession, etc.)
  // These may already be updated above, but let's cover the ones with FK constraints
  const fkModels = ["classSession", "program", "task", "appointment", "membershipPlan"];
  for (const model of fkModels) {
    try {
      // @ts-expect-error - dynamic model access
      const result = await prisma[model].updateMany({
        where: { clientId: OLD_CLIENT_ID },
        data: { clientId: newClientId },
      });
      if (result.count > 0) {
        console.log(`  Updated ${result.count} ${model} records`);
      }
    } catch (error) {
      // These models have FK constraints, so "default-client" may not exist as a Client
      // In that case, they either already have valid clientIds or need manual fixing
      console.log(`  Note: ${model} may need manual clientId update`);
    }
  }

  console.log("\nMigration complete!");
  console.log(`\nYour default tenant URL: https://${DEFAULT_SLUG}.dojostormsoftware.com`);
  console.log(`(Or update the slug to your preferred name, e.g., "thepitidaho")`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
