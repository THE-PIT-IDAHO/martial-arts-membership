import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // Check if we already have data - don't seed if data exists
  const existingClient = await prisma.client.findFirst();
  if (existingClient) {
    console.log("⏭️  Data already exists, skipping seed.");
    return;
  }

  // Create default client
  const client = await prisma.client.create({
    data: {
      name: "Default Client",
      slug: "default-client",
    },
  });
  console.log("✅ Created default client");

  // Create Kempo style with belt ranks
  const kempoStyle = await prisma.style.create({
    data: {
      name: "Kempo",
      shortName: "Kempo",
      description: "Kickboxing with limited grappling.",
      beltSystemEnabled: true,
      beltConfig: JSON.stringify({
        layers: {
          fabric: true,
          linear: false,
          camo: false,
          patch: false,
          patch2: false,
          stripe1: false,
          stripe2: false,
          stripe3: false,
          stripe4: false,
          stripe5: false,
          stripe6: false,
          stripe7: false,
          stripe8: false,
          stripe9: false,
          stripe10: false,
          fabricColor: "#ffffff",
          linearColor: "#ffffff",
          patchColor: "#000000",
          patch2Color: "#000000",
          stripe1Color: "#ffffff",
          stripe2Color: "#ffffff",
          stripe3Color: "#ffffff",
          stripe4Color: "#ffffff",
          stripe5Color: "#ffffff",
          stripe6Color: "#ffffff",
          stripe7Color: "#ffffff",
          stripe8Color: "#ffffff",
          stripe9Color: "#ffffff",
          stripe10Color: "#ffffff",
        },
        ranks: [
          {
            id: "rank_kempo_1",
            name: "White Belt",
            order: 1,
            classRequirements: [
              { id: "req_k1_1", label: "Kempo", minCount: 20 },
              { id: "req_k1_2", label: "Sparring", minCount: 10 },
            ],
            minDuration: { value: 6, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: false, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#ffffff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_kempo_2",
            name: "Yellow Belt",
            order: 2,
            classRequirements: [
              { id: "req_k2_1", label: "Kempo", minCount: 20 },
              { id: "req_k2_2", label: "Sparring", minCount: 10 },
            ],
            minDuration: { value: 6, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: false, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#ffea00", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_kempo_3",
            name: "Orange Belt",
            order: 3,
            classRequirements: [{ id: "req_k3_1", label: "Kempo", minCount: 20 }],
            minDuration: { value: 6, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: false, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#ff8800", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_kempo_4",
            name: "Purple Belt",
            order: 4,
            classRequirements: [{ id: "req_k4_1", label: "Kempo", minCount: 20 }],
            minDuration: { value: 6, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: false, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#bb00ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_kempo_5",
            name: "Blue Belt",
            order: 5,
            classRequirements: [{ id: "req_k5_1", label: "Kempo", minCount: 20 }],
            minDuration: { value: 6, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: false, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#0400ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_kempo_6",
            name: "Green Belt",
            order: 6,
            classRequirements: [{ id: "req_k6_1", label: "Kempo", minCount: 20 }],
            minDuration: { value: 6, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: false, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#21c700", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_kempo_7",
            name: "Red Belt",
            order: 7,
            classRequirements: [{ id: "req_k7_1", label: "Kempo", minCount: 20 }],
            minDuration: { value: 6, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: false, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#f00000", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_kempo_8",
            name: "Brown Belt",
            order: 8,
            classRequirements: [{ id: "req_k8_1", label: "Kempo", minCount: 20 }],
            minDuration: { value: 6, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: false, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#a34900", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_kempo_9",
            name: "Black Belt",
            order: 9,
            classRequirements: [{ id: "req_k9_1", label: "Kempo", minCount: 20 }],
            minDuration: { value: 6, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: false, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#000000", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
        ],
      }),
    },
  });
  console.log("✅ Created Kempo style");

  // Create Kempo ranks in the Rank table
  const kempoRanks = [
    { name: "White Belt", order: 1, classRequirement: 30 },
    { name: "Yellow Belt", order: 2, classRequirement: 30 },
    { name: "Orange Belt", order: 3, classRequirement: 20 },
    { name: "Purple Belt", order: 4, classRequirement: 20 },
    { name: "Blue Belt", order: 5, classRequirement: 20 },
    { name: "Green Belt", order: 6, classRequirement: 20 },
    { name: "Red Belt", order: 7, classRequirement: 20 },
    { name: "Brown Belt", order: 8, classRequirement: 20 },
    { name: "Black Belt", order: 9, classRequirement: 20 },
  ];

  for (const rank of kempoRanks) {
    await prisma.rank.create({
      data: {
        name: rank.name,
        order: rank.order,
        classRequirement: rank.classRequirement,
        styleId: kempoStyle.id,
      },
    });
  }
  console.log("✅ Created Kempo ranks");

  // Create BJJ style with belt ranks
  const bjjStyle = await prisma.style.create({
    data: {
      name: "Brazilian Jiu-Jitsu",
      shortName: "BJJ",
      description: "Grappling/Wrestling with joint locks and choke holds",
      beltSystemEnabled: true,
      beltConfig: JSON.stringify({
        layers: {
          fabric: true,
          linear: false,
          camo: false,
          patch: false,
          patch2: false,
          stripe1: false,
          stripe2: false,
          stripe3: false,
          stripe4: false,
          stripe5: false,
          stripe6: false,
          stripe7: false,
          stripe8: false,
          stripe9: false,
          stripe10: false,
          fabricColor: "#ffffff",
          linearColor: "#ffffff",
          patchColor: "#000000",
          patch2Color: "#000000",
          stripe1Color: "#ffffff",
          stripe2Color: "#ffffff",
          stripe3Color: "#ffffff",
          stripe4Color: "#ffffff",
          stripe5Color: "#ffffff",
          stripe6Color: "#ffffff",
          stripe7Color: "#ffffff",
          stripe8Color: "#ffffff",
          stripe9Color: "#ffffff",
          stripe10Color: "#ffffff",
        },
        ranks: [
          // White Belt progression
          {
            id: "rank_bjj_1",
            name: "White Belt",
            order: 1,
            classRequirements: [
              { id: "req_b1_1", label: "Brazilian Jiu-jitsu", minCount: 30 },
              { id: "req_b1_2", label: "No-Gi Jiu-jitsu", minCount: 15 },
            ],
            minDuration: { value: 2, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#ffffff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_2",
            name: "White Belt - 1 stripe",
            order: 2,
            classRequirements: [
              { id: "req_b2_1", label: "Brazilian Jiu-jitsu", minCount: 30 },
              { id: "req_b2_2", label: "No-Gi Jiu-jitsu", minCount: 15 },
            ],
            minDuration: { value: 2, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#ffffff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_3",
            name: "White Belt - 2 stripes",
            order: 3,
            classRequirements: [{ id: "req_b3_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 2, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#ffffff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_4",
            name: "White Belt - 3 stripes",
            order: 4,
            classRequirements: [{ id: "req_b4_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 3, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: true, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#ffffff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_5",
            name: "White Belt - 4 stripes",
            order: 5,
            classRequirements: [{ id: "req_b5_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: true, stripe4: true, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#ffffff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          // Blue Belt progression
          {
            id: "rank_bjj_6",
            name: "Blue Belt",
            order: 6,
            classRequirements: [{ id: "req_b6_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#0400ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_7",
            name: "Blue Belt - 1 stripe",
            order: 7,
            classRequirements: [{ id: "req_b7_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#0400ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_8",
            name: "Blue Belt - 2 stripes",
            order: 8,
            classRequirements: [{ id: "req_b8_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#0400ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_9",
            name: "Blue Belt - 3 stripes",
            order: 9,
            classRequirements: [{ id: "req_b9_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: true, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#0400ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_10",
            name: "Blue Belt - 4 stripes",
            order: 10,
            classRequirements: [{ id: "req_b10_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: true, stripe4: true, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#0400ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          // Purple Belt progression
          {
            id: "rank_bjj_11",
            name: "Purple Belt",
            order: 11,
            classRequirements: [{ id: "req_b11_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#bb00ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_12",
            name: "Purple Belt - 1 stripe",
            order: 12,
            classRequirements: [{ id: "req_b12_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#bb00ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_13",
            name: "Purple Belt - 2 stripes",
            order: 13,
            classRequirements: [{ id: "req_b13_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#bb00ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_14",
            name: "Purple Belt - 3 stripes",
            order: 14,
            classRequirements: [{ id: "req_b14_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: true, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#bb00ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_15",
            name: "Purple Belt - 4 stripes",
            order: 15,
            classRequirements: [{ id: "req_b15_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 5, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: true, stripe4: true, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#bb00ff", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          // Brown Belt progression
          {
            id: "rank_bjj_16",
            name: "Brown Belt",
            order: 16,
            classRequirements: [{ id: "req_b16_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 12, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#a34900", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_17",
            name: "Brown Belt - 1 stripe",
            order: 17,
            classRequirements: [{ id: "req_b17_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 12, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#a34900", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_18",
            name: "Brown Belt - 2 stripes",
            order: 18,
            classRequirements: [{ id: "req_b18_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 12, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#a34900", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_19",
            name: "Brown Belt - 3 stripes",
            order: 19,
            classRequirements: [{ id: "req_b19_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 12, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: true, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#a34900", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          {
            id: "rank_bjj_20",
            name: "Brown Belt - 4 stripes",
            order: 20,
            classRequirements: [{ id: "req_b20_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 12, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: true, stripe2: true, stripe3: true, stripe4: true, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#a34900", linearColor: "#ffffff", patchColor: "#000000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
          // Black Belt
          {
            id: "rank_bjj_21",
            name: "Black Belt",
            order: 21,
            classRequirements: [{ id: "req_b21_1", label: "Brazilian Jiu-jitsu", minCount: 30 }],
            minDuration: { value: 36, unit: "months" },
            notes: null,
            layers: {
              fabric: true, linear: false, camo: false, patch: true, patch2: false,
              stripe1: false, stripe2: false, stripe3: false, stripe4: false, stripe5: false,
              stripe6: false, stripe7: false, stripe8: false, stripe9: false, stripe10: false,
              fabricColor: "#000000", linearColor: "#ffffff", patchColor: "#f00000", patch2Color: "#000000",
              stripe1Color: "#ffffff", stripe2Color: "#ffffff", stripe3Color: "#ffffff", stripe4Color: "#ffffff",
              stripe5Color: "#ffffff", stripe6Color: "#ffffff", stripe7Color: "#ffffff", stripe8Color: "#ffffff",
              stripe9Color: "#ffffff", stripe10Color: "#ffffff",
            },
          },
        ],
      }),
    },
  });
  console.log("✅ Created Brazilian Jiu-Jitsu style");

  // Create BJJ ranks in the Rank table
  const bjjRanks = [
    { name: "White Belt", order: 1, classRequirement: 45 },
    { name: "White Belt - 1 stripe", order: 2, classRequirement: 45 },
    { name: "White Belt - 2 stripes", order: 3, classRequirement: 30 },
    { name: "White Belt - 3 stripes", order: 4, classRequirement: 30 },
    { name: "White Belt - 4 stripes", order: 5, classRequirement: 30 },
    { name: "Blue Belt", order: 6, classRequirement: 30 },
    { name: "Blue Belt - 1 stripe", order: 7, classRequirement: 30 },
    { name: "Blue Belt - 2 stripes", order: 8, classRequirement: 30 },
    { name: "Blue Belt - 3 stripes", order: 9, classRequirement: 30 },
    { name: "Blue Belt - 4 stripes", order: 10, classRequirement: 30 },
    { name: "Purple Belt", order: 11, classRequirement: 30 },
    { name: "Purple Belt - 1 stripe", order: 12, classRequirement: 30 },
    { name: "Purple Belt - 2 stripes", order: 13, classRequirement: 30 },
    { name: "Purple Belt - 3 stripes", order: 14, classRequirement: 30 },
    { name: "Purple Belt - 4 stripes", order: 15, classRequirement: 30 },
    { name: "Brown Belt", order: 16, classRequirement: 30 },
    { name: "Brown Belt - 1 stripe", order: 17, classRequirement: 30 },
    { name: "Brown Belt - 2 stripes", order: 18, classRequirement: 30 },
    { name: "Brown Belt - 3 stripes", order: 19, classRequirement: 30 },
    { name: "Brown Belt - 4 stripes", order: 20, classRequirement: 30 },
    { name: "Black Belt", order: 21, classRequirement: 30 },
  ];

  for (const rank of bjjRanks) {
    await prisma.rank.create({
      data: {
        name: rank.name,
        order: rank.order,
        classRequirement: rank.classRequirement,
        styleId: bjjStyle.id,
      },
    });
  }
  console.log("✅ Created Brazilian Jiu-Jitsu ranks");

  // Create default sample members
  const defaultMembers = [
    {
      firstName: "John",
      lastName: "Smith",
      email: "john.smith@example.com",
      phone: "(555) 123-4567",
      status: "ACTIVE",
      memberNumber: 10000001,
      primaryStyle: "Kempo",
      rank: "Green Belt",
    },
    {
      firstName: "Sarah",
      lastName: "Johnson",
      email: "sarah.j@example.com",
      phone: "(555) 234-5678",
      status: "ACTIVE",
      memberNumber: 10000002,
      primaryStyle: "Kempo",
      rank: "Blue Belt",
    },
    {
      firstName: "Michael",
      lastName: "Williams",
      email: "m.williams@example.com",
      phone: "(555) 345-6789",
      status: "ACTIVE,COACH",
      memberNumber: 10000003,
      primaryStyle: "Brazilian Jiu-Jitsu",
      rank: "Brown Belt",
    },
    {
      firstName: "Emily",
      lastName: "Brown",
      email: "emily.b@example.com",
      phone: "(555) 456-7890",
      status: "PROSPECT",
      memberNumber: 10000004,
    },
    {
      firstName: "David",
      lastName: "Garcia",
      email: "d.garcia@example.com",
      phone: "(555) 567-8901",
      status: "ACTIVE",
      memberNumber: 10000005,
      primaryStyle: "Kempo",
      rank: "Yellow Belt",
    },
    {
      firstName: "Jessica",
      lastName: "Martinez",
      email: "jessica.m@example.com",
      phone: "(555) 678-9012",
      status: "ACTIVE,PARENT",
      memberNumber: 10000006,
      primaryStyle: "Brazilian Jiu-Jitsu",
      rank: "White Belt",
    },
    {
      firstName: "Tommy",
      lastName: "Martinez",
      email: null,
      phone: null,
      status: "ACTIVE",
      memberNumber: 10000007,
      primaryStyle: "Kempo",
      rank: "Orange Belt",
      dateOfBirth: new Date("2015-03-15"),
      parentGuardianName: "Jessica Martinez",
    },
    {
      firstName: "Robert",
      lastName: "Anderson",
      email: "r.anderson@example.com",
      phone: "(555) 789-0123",
      status: "INACTIVE",
      memberNumber: 10000008,
      primaryStyle: "Kempo",
      rank: "Purple Belt",
    },
    {
      firstName: "Amanda",
      lastName: "Taylor",
      email: "amanda.t@example.com",
      phone: "(555) 890-1234",
      status: "ACTIVE",
      memberNumber: 10000009,
      primaryStyle: "Brazilian Jiu-Jitsu",
      rank: "Blue Belt",
    },
    {
      firstName: "James",
      lastName: "Wilson",
      email: "j.wilson@example.com",
      phone: "(555) 901-2345",
      status: "PROSPECT",
      memberNumber: 10000010,
    },
  ];

  for (const member of defaultMembers) {
    await prisma.member.create({
      data: {
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone,
        status: member.status,
        memberNumber: member.memberNumber,
        primaryStyle: member.primaryStyle || null,
        rank: member.rank || null,
        dateOfBirth: member.dateOfBirth || null,
        parentGuardianName: member.parentGuardianName || null,
        clientId: client.id,
      },
    });
  }
  console.log("✅ Created default sample members");

  // Create relationship between Tommy and Jessica (parent/child)
  const jessica = await prisma.member.findFirst({
    where: { firstName: "Jessica", lastName: "Martinez" },
  });
  const tommy = await prisma.member.findFirst({
    where: { firstName: "Tommy", lastName: "Martinez" },
  });

  if (jessica && tommy) {
    await prisma.memberRelationship.create({
      data: {
        fromMemberId: jessica.id,
        toMemberId: tommy.id,
        relationship: "PARENT",
      },
    });
    console.log("✅ Created parent/child relationship");
  }

  console.log("🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
