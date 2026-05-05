const { PrismaClient } = require("@prisma/client");
const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

const tiers = [
  {
    name: "Trial",
    description: "Free trial to explore the software",
    priceCents: 0,
    billingPeriod: "monthly",
    maxMembers: 10,
    maxStyles: 2,
    maxRanksPerStyle: 10,
    maxMembershipPlans: 2,
    maxClasses: 4,
    maxUsers: 1,
    maxLocations: 1,
    maxReports: 1,
    maxPOSItems: 5,
    allowStripe: false,
    allowPaypal: false,
    allowSquare: false,
    sortOrder: 0,
  },
  {
    name: "Starter",
    description: "For small, owner-operated gyms getting started",
    priceCents: 5000,
    billingPeriod: "monthly",
    maxMembers: 50,
    maxStyles: 5,
    maxRanksPerStyle: 20,
    maxMembershipPlans: 5,
    maxClasses: 5,
    maxUsers: 1,
    maxLocations: 1,
    maxReports: 5,
    maxPOSItems: 15,
    allowStripe: true,
    allowPaypal: true,
    allowSquare: true,
    sortOrder: 1,
  },
  {
    name: "Basic",
    description: "Full-featured plan for growing gyms",
    priceCents: 10000,
    billingPeriod: "monthly",
    maxMembers: 100,
    maxStyles: 10,
    maxRanksPerStyle: 25,
    maxMembershipPlans: 10,
    maxClasses: 8,
    maxUsers: 5,
    maxLocations: 1,
    maxReports: 10,
    maxPOSItems: 25,
    allowStripe: true,
    allowPaypal: true,
    allowSquare: true,
    sortOrder: 2,
  },
  {
    name: "Pro",
    description: "For established gyms with multiple styles and staff",
    priceCents: 15000,
    billingPeriod: "monthly",
    maxMembers: 300,
    maxStyles: 15,
    maxRanksPerStyle: 35,
    maxMembershipPlans: 15,
    maxClasses: 15,
    maxUsers: 10,
    maxLocations: 3,
    maxReports: 20,
    maxPOSItems: 75,
    allowStripe: true,
    allowPaypal: true,
    allowSquare: true,
    sortOrder: 3,
  },
  {
    name: "Enterprise",
    description: "Unlimited everything for large or multi-location gyms",
    priceCents: 20000,
    billingPeriod: "monthly",
    maxMembers: 999999,
    maxStyles: 999999,
    maxRanksPerStyle: 999999,
    maxMembershipPlans: 999999,
    maxClasses: 999999,
    maxUsers: 999999,
    maxLocations: 999999,
    maxReports: 999999,
    maxPOSItems: 999999,
    allowStripe: true,
    allowPaypal: true,
    allowSquare: true,
    sortOrder: 4,
  },
];

async function main() {
  // Clear existing tiers
  await p.pricingTier.deleteMany();
  console.log("Cleared existing tiers");

  for (const tier of tiers) {
    await p.pricingTier.create({ data: tier });
    console.log(`Created: ${tier.name} ($${(tier.priceCents / 100).toFixed(2)}/mo)`);
  }

  console.log("\nDone! 5 pricing tiers created.");
  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
