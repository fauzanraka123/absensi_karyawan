import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { hash } from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username hanya boleh berisi huruf, angka, titik, garis bawah, dan tanda hubung.")
  .transform((username) => username.toLowerCase());

const createSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(1).max(150),
  pin: z.string().min(4).max(16),
  branchId: z.number().int().positive(),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  username: usernameSchema,
  name: z.string().trim().min(1).max(150),
  pin: z.string().min(4).max(16).optional().or(z.literal("")),
  branchId: z.number().int().positive(),
});

async function isAdmin() {
  const session = await auth();
  return session?.user.role === "ADMIN";
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function GET() {
  if (!(await isAdmin())) {
    return Response.json({ error: "Akses khusus admin." }, { status: 403 });
  }

  const [employees, branches] = await Promise.all([
    prisma.user.findMany({
      where: { role: "EMPLOYEE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        username: true,
        name: true,
        branchId: true,
        branch: { select: { name: true } },
      },
    }),
    prisma.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return Response.json(
    {
      employees: employees.map((employee) => ({
        id: employee.id,
        username: employee.username,
        name: employee.name,
        branchId: employee.branchId,
        branchName: employee.branch.name,
      })),
      branches,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Akses khusus admin." }, { status: 403 });
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Data karyawan tidak valid." },
      { status: 400 },
    );
  }
  const branch = await prisma.branch.findUnique({
    where: { id: parsed.data.branchId },
    select: { id: true },
  });
  if (!branch) {
    return Response.json({ error: "Cabang tidak ditemukan." }, { status: 404 });
  }

  try {
    const employee = await prisma.user.create({
      data: {
        username: parsed.data.username,
        name: parsed.data.name,
        pin: await hash(parsed.data.pin, 12),
        role: "EMPLOYEE",
        branchId: branch.id,
      },
      select: {
        id: true,
        username: true,
        name: true,
        branchId: true,
        branch: { select: { name: true } },
      },
    });
    const { branch: employeeBranch, ...employeeData } = employee;
    return Response.json(
      {
        employee: {
          ...employeeData,
          branchName: employeeBranch.name,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return Response.json({ error: "Username tersebut sudah digunakan." }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Akses khusus admin." }, { status: 403 });
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Data karyawan tidak valid." },
      { status: 400 },
    );
  }
  const branch = await prisma.branch.findUnique({
    where: { id: parsed.data.branchId },
    select: { id: true },
  });
  if (!branch) {
    return Response.json({ error: "Cabang tidak ditemukan." }, { status: 404 });
  }

  try {
    const result = await prisma.user.updateMany({
      where: { id: parsed.data.id, role: "EMPLOYEE" },
      data: {
        username: parsed.data.username,
        name: parsed.data.name,
        ...(parsed.data.pin ? { pin: await hash(parsed.data.pin, 12) } : {}),
        branchId: branch.id,
      },
    });
    if (result.count === 0) {
      return Response.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
    }

    const employee = await prisma.user.findUniqueOrThrow({
      where: { id: parsed.data.id },
      select: {
        id: true,
        username: true,
        name: true,
        branchId: true,
        branch: { select: { name: true } },
      },
    });
    return Response.json(
      {
        employee: {
          id: employee.id,
          username: employee.username,
          name: employee.name,
          branchId: employee.branchId,
          branchName: employee.branch.name,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return Response.json({ error: "Username tersebut sudah digunakan." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Akses khusus admin." }, { status: 403 });
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

  const parsed = z.object({ id: z.number().int().positive() }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "ID karyawan tidak valid." }, { status: 400 });
  }
  const employee = await prisma.user.findFirst({
    where: { id: parsed.data.id, role: "EMPLOYEE" },
    select: {
      id: true,
      _count: { select: { attendances: true, leaveRequests: true } },
    },
  });
  if (!employee) {
    return Response.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
  }
  if (employee._count.attendances > 0 || employee._count.leaveRequests > 0) {
    return Response.json(
      {
        error:
          "Akun memiliki riwayat absensi atau cuti sehingga tidak dapat dihapus. Ubah username/PIN atau cabangnya untuk menonaktifkan akses.",
      },
      { status: 409 },
    );
  }

  try {
    await prisma.user.delete({ where: { id: employee.id } });
  } catch (error) {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return Response.json(
        { error: "Akun sudah memiliki riwayat terkait dan tidak dapat dihapus." },
        { status: 409 },
      );
    }
    throw error;
  }

  return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
