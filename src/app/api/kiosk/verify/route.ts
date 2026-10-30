import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyKioskQr } from "@/lib/kiosk-qr";

const requestSchema = z.object({ qr: z.unknown() });

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
    return Response.json({ error: "Data QR tidak ditemukan." }, { status: 400 });
  }

  const result = verifyKioskQr(parsed.data.qr);
  if (!result.valid) {
    return Response.json(
      { valid: false, reason: result.reason },
      {
        status:
          result.reason === "malformed"
            ? 400
            : result.reason === "expired"
              ? 410
              : 401,
      },
    );
  }

  const branch = await prisma.branch.findUnique({
    where: { id: result.payload.branch_id },
    select: { id: true, name: true },
  });
  if (!branch) {
    return Response.json(
      { valid: false, reason: "unknown_branch" },
      { status: 404 },
    );
  }

  return Response.json(
    {
      valid: true,
      branch,
      timestamp: result.payload.timestamp,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
