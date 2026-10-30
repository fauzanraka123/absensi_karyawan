import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const branches = await Promise.all([
    prisma.branch.upsert({
      where: { locationCode: "palimanan" },
      update: { name: "Palimanan" },
      create: { name: "Palimanan", locationCode: "palimanan" },
    }),
    prisma.branch.upsert({
      where: { locationCode: "pulasaren" },
      update: { name: "Pulasaren" },
      create: { name: "Pulasaren", locationCode: "pulasaren" },
    }),
    prisma.branch.upsert({
      where: { locationCode: "pasar-caplek" },
      update: { name: "Pasar Caplek" },
      create: { name: "Pasar Caplek", locationCode: "pasar-caplek" },
    }),
    prisma.branch.upsert({
      where: { locationCode: "bode" },
      update: { name: "Bode" },
      create: { name: "Bode", locationCode: "bode" },
    }),
  ]);
  const branchByCode = new Map(
    branches.map((branch) => [branch.locationCode, branch]),
  );
  const pinHash = await hash("123456", 12);

  const users = [
    {
      username: "admin",
      legacyUsername: "ADMIN01",
      name: "Admin",
      role: UserRole.ADMIN,
      branchCode: "palimanan",
    },
    {
      username: "siti_pulasaren",
      legacyUsername: "EMP01",
      name: "Siti Rahma",
      role: UserRole.EMPLOYEE,
      branchCode: "pulasaren",
    },
    {
      username: "budi_bode",
      legacyUsername: "EMP02",
      name: "Budi Santoso",
      role: UserRole.EMPLOYEE,
      branchCode: "bode",
    },
  ] as const;

  for (const user of users) {
    const branch = branchByCode.get(user.branchCode);
    if (!branch) {
      throw new Error(`Seed branch not found: ${user.branchCode}`);
    }

    const existing = await prisma.user.findUnique({
      where: { username: user.username },
      select: { id: true },
    });
    const legacy = existing
      ? null
      : await prisma.user.findUnique({
          where: { username: user.legacyUsername },
          select: { id: true },
        });

    const existingId = existing?.id ?? legacy?.id;
    if (existingId) {
      await prisma.user.update({
        where: { id: existingId },
        data: {
          username: user.username,
          name: user.name,
          pin: pinHash,
          role: user.role,
          branchId: branch.id,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          username: user.username,
          name: user.name,
          pin: pinHash,
          role: user.role,
          branchId: branch.id,
        },
      });
    }
  }

  console.info("Seed selesai: 4 cabang dan 3 akun demo telah disiapkan.");
}

main()
  .catch((error: unknown) => {
    console.error("Seed gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
