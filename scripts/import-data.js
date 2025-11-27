const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function importData() {
  try {
    const rawData = fs.readFileSync('export-data.json', 'utf8');
    const data = JSON.parse(rawData);

    console.log('📦 Importing data...');
    console.log(`   Export date: ${data.exportDate}`);

    // Import styles
    for (const style of data.styles) {
      await prisma.style.upsert({
        where: { id: style.id },
        update: style,
        create: style
      });
    }
    console.log(`✅ Imported ${data.styles.length} styles`);

    // Import members
    for (const member of data.members) {
      await prisma.member.upsert({
        where: { id: member.id },
        update: member,
        create: member
      });
    }
    console.log(`✅ Imported ${data.members.length} members`);

    console.log('🎉 Import complete!');
  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importData();
