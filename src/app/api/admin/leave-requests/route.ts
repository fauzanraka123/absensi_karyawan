import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const decisionSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["APPROVED", "REJECTED"]),
  adminNotes: z.string().trim().max(2000).optional().default(""),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return Response.json({ error: "Hanya admin yang dapat memproses pengajuan cuti." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Format permintaan tidak valid." }, { status: 400 });
    }
    throw error;
  }

  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Data keputusan cuti tidak valid." }, { status: 400 });
  }

  const result = await prisma.leaveRequest.updateMany({
    where: { id: parsed.data.id, status: "PENDING" },
    data: {
      status: parsed.data.status,
      adminNotes: parsed.data.adminNotes || null,
    },
  });
  if (result.count === 0) {
    const exists = await prisma.leaveRequest.findUnique({
      where: { id: parsed.data.id },
      select: { id: true },
    });
    return exists
      ? Response.json(
          { error: "Pengajuan ini sudah diproses admin lain." },
          { status: 409 },
        )
      : Response.json({ error: "Pengajuan cuti tidak ditemukan." }, { status: 404 });
  }

  return Response.json(
    {
      leaveRequest: {
        id: parsed.data.id,
        status: parsed.data.status,
        adminNotes: parsed.data.adminNotes || null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
