import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueKioskQr } from "@/lib/kiosk-qr";

const requestSchema = z.object({
  branchId: z.number().int().positive(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Format permintaan tidak valid." }, { status: 400 });
    }
    throw error;
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "ID cabang tidak valid." }, { status: 400 });
  }

  const branch = await prisma.branch.findUnique({
    where: { id: parsed.data.branchId },
    select: { id: true },
  });
  if (!branch) {
    return Response.json({ error: "Cabang tidak ditemukan." }, { status: 404 });
  }

  return Response.json(
    { qr: issueKioskQr(branch.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
