const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function exportData() {
  try {
    const styles = await prisma.style.findMany();
    const members = await prisma.member.findMany();

    const data = {
      styles,
      members,
      exportDate: new Date().toISOString()
    };

    fs.writeFileSync('export-data.json', JSON.stringify(data, null, 2));
    console.log('✅ Data exported to export-data.json');
    console.log(`   - ${styles.length} styles`);
    console.log(`   - ${members.length} members`);
  } catch (error) {
    console.error('❌ Export failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

exportData();
