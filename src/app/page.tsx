import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { EmployeeAttendance } from "@/components/employee/employee-attendance";
import { LeaveRequestPanel } from "@/components/employee/leave-request-panel";
import { LoginForm } from "@/components/auth/login-form";
import { SessionHeader } from "@/components/auth/session-header";
import { getJakartaDayBounds } from "@/lib/jakarta-day";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (session?.user.role === "ADMIN") {
    const { start, end } = getJakartaDayBounds();
    const [
      employeeCount,
      todayAttendanceCount,
      pendingLeaveCount,
      attendances,
      pendingRequests,
      processedRequests,
      employees,
      branches,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "EMPLOYEE" } }),
      prisma.attendance.count({
        where: { checkInTime: { gte: start, lt: end } },
      }),
      prisma.leaveRequest.count({ where: { status: "PENDING" } }),
      prisma.attendance.findMany({
        where: { checkInTime: { gte: start, lt: end } },
        orderBy: { checkInTime: "desc" },
        select: {
          id: true,
          checkInTime: true,
          checkOutTime: true,
          status: true,
          selfieUrl: true,
          user: {
            select: { id: true, name: true, username: true, branchId: true },
          },
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.leaveRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { startDate: "asc" },
        select: {
          id: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          reason: true,
          status: true,
          adminNotes: true,
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              branch: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.leaveRequest.findMany({
        where: { status: { in: ["APPROVED", "REJECTED"] } },
        orderBy: { startDate: "desc" },
        take: 10,
        select: {
          id: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          reason: true,
          status: true,
          adminNotes: true,
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              branch: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.user.findMany({
        where: { role: "EMPLOYEE" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          username: true,
          name: true,
          branchId: true,
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.branch.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    return (
      <>
        <SessionHeader name={session.user.name ?? "Admin"} />
        <AdminDashboard
          attendances={attendances.map((attendance) => ({
            id: attendance.id,
            checkInTime: attendance.checkInTime.toISOString(),
            checkOutTime: attendance.checkOutTime?.toISOString() ?? null,
            status: attendance.status,
            selfieUrl: attendance.selfieUrl,
            employeeName: attendance.user.name,
            username: attendance.user.username,
            branchName: attendance.branch.name,
            branchId: attendance.branch.id,
            employeeId: attendance.user.id,
          }))}
          branches={branches}
          employeeCount={employeeCount}
          employees={employees.map((employee) => ({
            id: employee.id,
            username: employee.username,
            name: employee.name,
            branchId: employee.branchId,
            branchName: employee.branch.name,
          }))}
          leaveRequests={[...pendingRequests, ...processedRequests].map((leave) => ({
            id: leave.id,
            leaveType: leave.leaveType,
            startDate: leave.startDate.toISOString(),
            endDate: leave.endDate.toISOString(),
            reason: leave.reason,
            status: leave.status,
            adminNotes: leave.adminNotes,
            employeeName: leave.user.name,
            username: leave.user.username,
            branchName: leave.user.branch.name,
            employeeId: leave.user.id,
          }))}
          pendingLeaveCount={pendingLeaveCount}
          todayAttendanceCount={todayAttendanceCount}
        />
      </>
    );
  }

  if (session?.user.role === "EMPLOYEE") {
    const userId = Number(session.user.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) redirect("/");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        branchId: true,
        branch: { select: { name: true } },
      },
    });
    if (!user) redirect("/");

    const { start, end } = getJakartaDayBounds();
    const [attendances, activeAttendance, leaveRequests] = await Promise.all([
      prisma.attendance.findMany({
        where: { userId: user.id },
        orderBy: { checkInTime: "desc" },
        take: 10,
        select: {
          id: true,
          checkInTime: true,
          checkOutTime: true,
          status: true,
          selfieUrl: true,
          branch: { select: { name: true } },
        },
      }),
      prisma.attendance.findFirst({
        where: {
          userId: user.id,
          checkInTime: { gte: start, lt: end },
          checkOutTime: null,
        },
        orderBy: { checkInTime: "desc" },
        select: { id: true },
      }),
      prisma.leaveRequest.findMany({
        where: { userId: user.id },
        orderBy: { startDate: "desc" },
        take: 10,
        select: {
          id: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          reason: true,
          status: true,
          adminNotes: true,
        },
      }),
    ]);

    return (
      <>
        <SessionHeader name={user.name} />
        <EmployeeAttendance
          attendances={attendances.map((attendance) => ({
            id: attendance.id,
            checkInTime: attendance.checkInTime.toISOString(),
            checkOutTime: attendance.checkOutTime?.toISOString() ?? null,
            status: attendance.status,
            selfieUrl: attendance.selfieUrl,
            branchName: attendance.branch.name,
          }))}
          initialAction={activeAttendance ? "CHECK_OUT" : "CHECK_IN"}
          branchId={user.branchId}
          branchName={user.branch.name}
          employeeId={user.id}
          employeeName={user.name}
        />
        <div className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
          <LeaveRequestPanel
            requests={leaveRequests.map((leave) => ({
              id: leave.id,
              leaveType: leave.leaveType,
              startDate: leave.startDate.toISOString(),
              endDate: leave.endDate.toISOString(),
              reason: leave.reason,
              status: leave.status,
              adminNotes: leave.adminNotes,
            }))}
          />
        </div>
      </>
    );
  }

  return <LoginForm />;
}
