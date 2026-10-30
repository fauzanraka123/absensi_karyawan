import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const requestSchema = z
  .object({
    leaveType: z.enum(["ANNUAL", "SICK", "PERSONAL", "OTHER"]),
    startDate: dateSchema,
    endDate: dateSchema,
    reason: z.string().trim().min(10).max(2000),
  })
  .refine(
    (request) => request.startDate <= request.endDate,
    { path: ["endDate"], message: "Tanggal selesai tidak boleh sebelum tanggal mulai." },
  );

function parseRequestDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = Number(session?.user.id);
  if (
    session?.user.role !== "EMPLOYEE" ||
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    return Response.json({ error: "Silakan masuk sebagai karyawan." }, { status: 401 });
  }

  const employee = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!employee) {
    return Response.json({ error: "Akun karyawan tidak ditemukan." }, { status: 401 });
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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Data pengajuan cuti tidak valid." },
      { status: 400 },
    );
  }

  const startDate = parseRequestDate(parsed.data.startDate);
  const endDate = parseRequestDate(parsed.data.endDate);
  const overlappingRequest = await prisma.leaveRequest.findFirst({
    where: {
      userId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });
  if (overlappingRequest) {
    return Response.json(
      { error: "Tanggal tersebut bertumpang tindih dengan pengajuan cuti aktif Anda." },
      { status: 409 },
    );
  }

  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      userId,
      leaveType: parsed.data.leaveType,
      startDate,
      endDate,
      reason: parsed.data.reason,
    },
    select: {
      id: true,
      leaveType: true,
      startDate: true,
      endDate: true,
      reason: true,
      status: true,
      adminNotes: true,
    },
  });

  return Response.json(
    {
      leaveRequest: {
        ...leaveRequest,
        startDate: leaveRequest.startDate.toISOString(),
        endDate: leaveRequest.endDate.toISOString(),
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
