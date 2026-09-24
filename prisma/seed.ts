import { PrismaClient } from "@prisma/client";
import { defaultCareerProfile } from "@homebase/career-engine";

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.userSettings.findFirst();
  if (!settings) await prisma.userSettings.create({ data: {} });
  await prisma.careerProfile.upsert({
    where: { id: defaultCareerProfile.id },
    create: defaultCareerProfile,
    update: {},
  });

  const integrations = [
    { key: "proxmox", name: "Proxmox" },
    { key: "docker", name: "Docker" },
    { key: "home-assistant", name: "Home Assistant" },
    { key: "pihole", name: "Pi-hole" },
    { key: "plex", name: "Plex" },
    { key: "security-intelligence", name: "Security Intelligence" },
    { key: "career-radar", name: "Career Radar" },
  ];

  for (const integration of integrations) {
    await prisma.integration.upsert({
      where: { key: integration.key },
      update: { name: integration.name },
      create: integration,
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Database seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
