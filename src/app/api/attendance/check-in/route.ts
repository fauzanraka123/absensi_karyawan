import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { auth } from "@/auth";
import { getJakartaDayBounds } from "@/lib/jakarta-day";
import { prisma } from "@/lib/prisma";
import { verifyKioskQr } from "@/lib/kiosk-qr";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 7 * 1024 * 1024;
const MAX_SELFIE_BYTES = 5 * 1024 * 1024;

const requestSchema = z.object({
  action: z.enum(["CHECK_IN", "CHECK_OUT"]).default("CHECK_IN"),
  user_id: z.number().int().positive(),
  branch_id: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
  qr: z.unknown(),
  selfie: z.string().min(1).max(MAX_REQUEST_BYTES),
});

class InvalidRequestBodyError extends Error {}
class RequestBodyTooLargeError extends Error {}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) throw new InvalidRequestBodyError();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel().catch((error: unknown) => {
        console.error("Gagal membatalkan pembacaan unggahan berukuran besar:", error);
      });
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) throw new InvalidRequestBodyError();
    throw error;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new InvalidRequestBodyError();
    throw error;
  }
}

function parseSelfie(dataUrl: string) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[1].length % 4 !== 0) return null;

  const image = Buffer.from(match[1], "base64");
  if (
    image.length === 0 ||
    image.length > MAX_SELFIE_BYTES ||
    image[0] !== 0xff ||
    image[1] !== 0xd8 ||
    image[2] !== 0xff
  ) {
    return null;
  }
  return image;
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, branchId: true },
  });
  if (!user) {
    return Response.json({ error: "Akun karyawan tidak ditemukan." }, { status: 401 });
  }

  if (
    request.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase() !== "application/json"
  ) {
    return Response.json(
      { error: "Format unggahan harus berupa JSON." },
      { status: 415 },
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: "Ukuran unggahan melebihi batas 7 MB." }, { status: 413 });
    }
    if (error instanceof InvalidRequestBodyError) {
      return Response.json({ error: "Format permintaan tidak valid." }, { status: 400 });
    }
    throw error;
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Data absensi atau selfie tidak valid." }, { status: 400 });
  }
  if (parsed.data.user_id !== user.id) {
    return Response.json(
      { error: "Absensi hanya dapat dicatat untuk akun yang sedang masuk." },
      { status: 403 },
    );
  }

  const qr = verifyKioskQr(parsed.data.qr);
  if (!qr.valid) {
    return Response.json(
      {
        error:
          qr.reason === "expired"
            ? "QR sudah kedaluwarsa. Pindai QR terbaru di layar kiosk."
            : "QR tidak valid. Silakan pindai ulang dari layar kiosk.",
      },
      { status: qr.reason === "expired" ? 410 : qr.reason === "malformed" ? 400 : 401 },
    );
  }

  if (
    parsed.data.branch_id !== qr.payload.branch_id ||
    parsed.data.timestamp !== qr.payload.timestamp
  ) {
    return Response.json(
      { error: "Data cabang atau waktu tidak sesuai dengan QR." },
      { status: 400 },
    );
  }
  if (user.branchId !== qr.payload.branch_id) {
    return Response.json(
      { error: "QR berasal dari cabang yang berbeda dengan cabang akun Anda." },
      { status: 403 },
    );
  }

  const image = parseSelfie(parsed.data.selfie);
  if (!image) {
    return Response.json(
      { error: "Selfie harus berupa gambar JPEG yang valid dan berukuran maksimal 5 MB." },
      { status: 400 },
    );
  }

  if (parsed.data.action === "CHECK_OUT") {
    const checkOutTime = new Date();
    const { start, end } = getJakartaDayBounds(checkOutTime);
    const openAttendance = await prisma.attendance.findFirst({
      where: {
        userId: user.id,
        branchId: user.branchId,
        checkInTime: { gte: start, lt: end },
        checkOutTime: null,
      },
      orderBy: { checkInTime: "desc" },
      select: { id: true },
    });
    if (!openAttendance) {
      return Response.json(
        { error: "Tidak ada absensi masuk hari ini yang menunggu check-out." },
        { status: 409 },
      );
    }

    const updated = await prisma.attendance.updateMany({
      where: { id: openAttendance.id, userId: user.id, checkOutTime: null },
      data: { checkOutTime },
    });
    if (updated.count === 0) {
      return Response.json(
        { error: "Absensi ini sudah di-check-out. Muat ulang halaman dan coba lagi." },
        { status: 409 },
      );
    }

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { id: openAttendance.id },
      select: {
        id: true,
        checkInTime: true,
        checkOutTime: true,
        status: true,
        selfieUrl: true,
        branch: { select: { name: true } },
      },
    });
    return Response.json(
      {
        attendance: {
          id: attendance.id,
          checkInTime: attendance.checkInTime.toISOString(),
          checkOutTime: attendance.checkOutTime?.toISOString() ?? null,
          status: attendance.status,
          selfieUrl: attendance.selfieUrl,
          branchName: attendance.branch.name,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const uploadDirectory = join(process.cwd(), "public", "uploads");
  const fileName = `${randomUUID()}.jpg`;
  const filePath = join(uploadDirectory, fileName);
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(filePath, image, { flag: "wx" });

  try {
    const attendance = await prisma.attendance.create({
      data: {
        userId: user.id,
        branchId: user.branchId,
        checkInTime: new Date(),
        selfieUrl: `/uploads/${fileName}`,
      },
      select: {
        id: true,
        checkInTime: true,
        checkOutTime: true,
        status: true,
        selfieUrl: true,
        branch: { select: { name: true } },
      },
    });

    return Response.json(
      {
        attendance: {
          id: attendance.id,
          checkInTime: attendance.checkInTime.toISOString(),
          checkOutTime: attendance.checkOutTime?.toISOString() ?? null,
          status: attendance.status,
          selfieUrl: attendance.selfieUrl,
          branchName: attendance.branch.name,
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    try {
      await unlink(filePath);
    } catch (cleanupError) {
      console.error("Gagal membersihkan selfie yang tidak tercatat:", cleanupError);
    }
    throw error;
  }
}
