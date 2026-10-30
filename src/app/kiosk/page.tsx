import { prisma } from "@/lib/prisma";
import { KioskDisplay } from "./kiosk-display";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const branches = await prisma.branch.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return <KioskDisplay branches={branches} />;
}
