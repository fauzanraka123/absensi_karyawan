"use client";

import { useMemo, useState } from "react";
import { Document, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  EmployeeManagement,
  type ManagedEmployee,
} from "@/components/admin/employee-management";

type Branch = {
  id: number;
  name: string;
};

type AttendanceRecord = {
  id: number;
  checkInTime: string;
  checkOutTime: string | null;
  status: string;
  selfieUrl: string | null;
  employeeName: string;
  username: string;
  branchName: string;
  branchId: number;
  employeeId: number;
};

type LeaveRequest = {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNotes: string | null;
  employeeName: string;
  username: string;
  branchName: string;
  employeeId: number;
};

type AdminDashboardProps = {
  attendances: AttendanceRecord[];
  branches: Branch[];
  employeeCount: number;
  employees: ManagedEmployee[];
  leaveRequests: LeaveRequest[];
  pendingLeaveCount: number;
  todayAttendanceCount: number;
};

function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function leaveTypeLabel(type: string) {
  const labels: Record<string, string> = {
    ANNUAL: "Cuti tahunan",
    SICK: "Sakit",
    PERSONAL: "Keperluan pribadi",
    OTHER: "Lainnya",
  };
  return labels[type] ?? type;
}

function leaveStatusLabel(status: LeaveRequest["status"]) {
  if (status === "APPROVED") return "Disetujui";
  if (status === "REJECTED") return "Ditolak";
  return "Menunggu";
}

export function AdminDashboard({
  attendances,
  branches,
  employeeCount,
  employees,
  leaveRequests: initialLeaveRequests,
  pendingLeaveCount,
  todayAttendanceCount,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "report" | "leave">("overview");
  const [leaveRequests, setLeaveRequests] = useState(initialLeaveRequests);
  const [pendingCount, setPendingCount] = useState(pendingLeaveCount);
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [reportError, setReportError] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const pendingRequests = leaveRequests.filter((request) => request.status === "PENDING");
  const processedRequests = leaveRequests.filter((request) => request.status !== "PENDING");

  async function decideLeave(id: number, status: "APPROVED" | "REJECTED") {
    setProcessingId(id);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/leave-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          adminNotes: adminNotes[id] ?? "",
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        leaveRequest?: {
          id: number;
          status: LeaveRequest["status"];
          adminNotes: string | null;
        };
      };

      if (!response.ok || !result.leaveRequest) {
        throw new Error(result.error ?? "Keputusan cuti tidak dapat disimpan.");
      }

      setLeaveRequests((current) =>
        current.map((request) =>
          request.id === id
            ? {
                ...request,
                status: result.leaveRequest!.status,
                adminNotes: result.leaveRequest!.adminNotes,
              }
            : request,
        ),
      );

      setPendingCount((current) => Math.max(0, current - 1));
      setNotice(
        status === "APPROVED" ? "Pengajuan cuti telah disetujui." : "Pengajuan cuti telah ditolak.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Keputusan cuti tidak dapat disimpan.",
      );
    } finally {
      setProcessingId(null);
    }
  }

  const reportRows = useMemo(() => {
    const start = reportStartDate ? new Date(`${reportStartDate}T00:00:00`) : null;
    const end = reportEndDate ? new Date(`${reportEndDate}T23:59:59`) : null;

    return attendances.filter((attendance) => {
      const attendanceDate = new Date(attendance.checkInTime);
      if (start && attendanceDate < start) return false;
      if (end && attendanceDate > end) return false;
      if (selectedBranchId !== "all" && String(attendance.branchId) !== selectedBranchId) return false;
      if (selectedEmployeeId !== "all" && String(attendance.employeeId) !== selectedEmployeeId) return false;
      return true;
    });
  }, [attendances, reportEndDate, reportStartDate, selectedBranchId, selectedEmployeeId]);

  const totalPresent = reportRows.length;

  const totalApprovedLeave = leaveRequests.filter((request) => {
    if (request.status !== "APPROVED") return false;
    if (selectedBranchId !== "all") {
      const branchName = branches.find((branch) => String(branch.id) === selectedBranchId)?.name;
      if (request.branchName !== branchName) return false;
    }
    if (selectedEmployeeId !== "all" && String(request.employeeId) !== selectedEmployeeId) return false;
    if (reportStartDate && new Date(request.startDate) < new Date(`${reportStartDate}T00:00:00`)) return false;
    if (reportEndDate && new Date(request.endDate) > new Date(`${reportEndDate}T23:59:59`)) return false;
    return true;
  }).length;

  async function exportPdf() {
    if (!reportRows.length) {
      setReportError("Tidak ada data yang bisa diekspor untuk filter saat ini.");
      return;
    }

    setExportingPdf(true);
    setReportError("");

    try {
      const reportTitle = "Laporan Absensi";
      const selectedBranchName =
        selectedBranchId === "all"
          ? "Semua Cabang"
          : branches.find((branch) => String(branch.id) === selectedBranchId)?.name ?? "Semua Cabang";
      const selectedEmployeeName =
        selectedEmployeeId === "all"
          ? "Semua Karyawan"
          : employees.find((employee) => String(employee.id) === selectedEmployeeId)?.name ?? "Semua Karyawan";

      const styles = StyleSheet.create({
        page: { padding: 36, backgroundColor: "#ffffff", fontFamily: "Helvetica" },
        header: { fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#065f46" },
        subtitle: { fontSize: 10, color: "#4b5563", marginBottom: 14 },
        filterBox: { backgroundColor: "#f3f4f6", borderRadius: 6, padding: 8, marginBottom: 14 },
        filterText: { fontSize: 9, color: "#374151" },
        table: { display: "flex", flexDirection: "column", borderWidth: 1, borderColor: "#d1d5db", marginTop: 8 },
        tableRow: { display: "flex", flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
        tableHeader: { backgroundColor: "#10b981", padding: 6 },
        headerText: { fontSize: 8, color: "#ffffff", fontWeight: 700 },
        cell: { flex: 1, padding: 6, fontSize: 8, color: "#111827" },
        summary: { marginTop: 14, flexDirection: "row", justifyContent: "space-between" },
        summaryText: { fontSize: 9, color: "#111827" },
      });

      const ReportDocument = () => (
        <Document>
          <Page size="A4" style={styles.page}>
            <Text style={styles.header}>PT Absen Karyawan</Text>
            <Text style={styles.subtitle}>{reportTitle}</Text>
            <View style={styles.filterBox}>
              <Text style={styles.filterText}>{`Periode: ${reportStartDate || "-"} s/d ${reportEndDate || "-"}`}</Text>
              <Text style={styles.filterText}>{`Cabang: ${selectedBranchName}`}</Text>
              <Text style={styles.filterText}>{`Karyawan: ${selectedEmployeeName}`}</Text>
            </View>

            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                {[
                  "Nama",
                  "Cabang",
                  "Tanggal",
                  "Jam Masuk",
                  "Jam Keluar",
                  "Status",
                  "Selfie",
                ].map((column) => (
                  <Text key={column} style={[styles.cell, styles.headerText]}>{column}</Text>
                ))}
              </View>
              {reportRows.map((attendance) => (
                <View key={attendance.id} style={styles.tableRow}>
                  <Text style={styles.cell}>{attendance.employeeName}</Text>
                  <Text style={styles.cell}>{attendance.branchName}</Text>
                  <Text style={styles.cell}>{formatDate(attendance.checkInTime)}</Text>
                  <Text style={styles.cell}>{attendance.checkInTime ? formatDate(attendance.checkInTime, true) : "-"}</Text>
                  <Text style={styles.cell}>{attendance.checkOutTime ? formatDate(attendance.checkOutTime, true) : "Belum"}</Text>
                  <Text style={styles.cell}>{attendance.status}</Text>
                  <Text style={styles.cell}>{attendance.selfieUrl ? "Ada" : "Tidak"}</Text>
                </View>
              ))}
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryText}>{`Total Hadir: ${totalPresent}`}</Text>
              <Text style={styles.summaryText}>{`Total Cuti Disetujui: ${totalApprovedLeave}`}</Text>
              <Text style={styles.summaryText}>{`Dicetak: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`}</Text>
            </View>
          </Page>
        </Document>
      );

      const blob = await pdf(<ReportDocument />).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `laporan-absensi-${reportStartDate || "all"}-${reportEndDate || "all"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (pdfError) {
      setReportError(
        pdfError instanceof Error ? pdfError.message : "PDF tidak dapat dibuat. Silakan coba lagi.",
      );
    } finally {
      setExportingPdf(false);
    }
  }

  const renderOverview = () => (
    <>
      <section aria-label="Ringkasan hari ini" className="mt-7 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total karyawan", value: employeeCount },
          { label: "Check-in hari ini", value: todayAttendanceCount },
          { label: "Cuti menunggu", value: pendingCount },
        ].map((stat) => (
          <article
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            key={stat.label}
          >
            <p className="text-sm font-medium text-neutral-600">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-neutral-900">{String(stat.value)}</p>
          </article>
        ))}
      </section>

      <EmployeeManagement branches={branches} employees={employees} />

      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-800">PENGELOLAAN CUTI</p>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Pengajuan karyawan</h2>
          </div>
          <p className="text-sm text-neutral-600">{pendingCount} pengajuan menunggu keputusan</p>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
            {notice}
          </p>
        )}

        {pendingRequests.length === 0 ? (
          <p className="mt-5 rounded-xl bg-neutral-50 p-5 text-sm text-neutral-600">
            Tidak ada pengajuan cuti yang menunggu keputusan.
          </p>
        ) : (
          <ul className="mt-5 space-y-4">
            {pendingRequests.map((request) => (
              <li
                className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5"
                key={request.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-neutral-900">
                      {request.employeeName}{" "}
                      <span className="font-normal text-neutral-500">({request.username})</span>
                    </h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      {request.branchName} · {leaveTypeLabel(request.leaveType)}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    Menunggu
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-neutral-800">
                  {formatDate(request.startDate)} – {formatDate(request.endDate)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {request.reason}
                </p>
                <label className="mt-4 block text-sm font-medium text-neutral-700">
                  Catatan admin (opsional)
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-normal"
                    maxLength={2000}
                    onChange={(event) =>
                      setAdminNotes((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    value={adminNotes[request.id] ?? ""}
                  />
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="min-h-10 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
                    disabled={processingId !== null}
                    onClick={() => void decideLeave(request.id, "APPROVED")}
                    type="button"
                  >
                    {processingId === request.id ? "Menyimpan..." : "ACC"}
                  </button>
                  <button
                    className="min-h-10 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                    disabled={processingId !== null}
                    onClick={() => void decideLeave(request.id, "REJECTED")}
                    type="button"
                  >
                    Tolak
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {processedRequests.length > 0 && (
          <div className="mt-7">
            <h3 className="font-semibold text-neutral-900">Keputusan terbaru</h3>
            <ul className="mt-3 divide-y divide-neutral-100">
              {processedRequests.map((request) => (
                <li className="flex flex-wrap justify-between gap-3 py-3" key={request.id}>
                  <div>
                    <p className="font-medium text-neutral-800">
                      {request.employeeName} · {leaveTypeLabel(request.leaveType)}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {formatDate(request.startDate)} – {formatDate(request.endDate)}
                    </p>
                  </div>
                  <span
                    className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${
                      request.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {leaveStatusLabel(request.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-sm font-semibold text-emerald-800">KEHADIRAN</p>
        <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Riwayat absensi hari ini</h2>
        {attendances.length === 0 ? (
          <p className="mt-5 text-sm text-neutral-600">Belum ada catatan kehadiran.</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100">
            {attendances.map((attendance) => (
              <li className="flex items-center gap-3 py-4" key={attendance.id}>
                {attendance.selfieUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`Selfie ${attendance.employeeName}`}
                    className="h-11 w-11 rounded-full object-cover"
                    height={44}
                    src={attendance.selfieUrl}
                    width={44}
                  />
                ) : (
                  <span className="h-11 w-11 shrink-0 rounded-full bg-neutral-100" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900">
                    {attendance.employeeName}{" "}
                    <span className="font-normal text-neutral-500">({attendance.username})</span>
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">{attendance.branchName}</p>
                  <p className="mt-1 text-sm text-neutral-700">
                    <span className="font-medium">Check-in:</span>{" "}
                    {formatDate(attendance.checkInTime, true)}
                    <span className="mx-2 text-neutral-300">|</span>
                    <span className="font-medium">Check-out:</span>{" "}
                    {attendance.checkOutTime ? formatDate(attendance.checkOutTime, true) : "Belum"}
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-800">{attendance.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );

  const renderReport = () => (
    <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-800">LAPORAN ABSENSI</p>
          <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Rekap kehadiran dan cuti</h2>
        </div>
        <button
          className="min-h-11 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60"
          disabled={exportingPdf}
          onClick={() => void exportPdf()}
          type="button"
        >
          {exportingPdf ? "Membuat PDF..." : "Download PDF"}
        </button>
      </div>

      {reportError && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {reportError}
        </p>
      )}

      <div className="mt-5 grid gap-4 rounded-xl bg-neutral-50 p-4 md:grid-cols-4">
        <label className="text-sm font-medium text-neutral-700">
          Start Date
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
            onChange={(event) => setReportStartDate(event.target.value)}
            type="date"
            value={reportStartDate}
          />
        </label>
        <label className="text-sm font-medium text-neutral-700">
          End Date
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
            min={reportStartDate || undefined}
            onChange={(event) => setReportEndDate(event.target.value)}
            type="date"
            value={reportEndDate}
          />
        </label>
        <label className="text-sm font-medium text-neutral-700">
          Cabang
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
            onChange={(event) => setSelectedBranchId(event.target.value)}
            value={selectedBranchId}
          >
            <option value="all">Semua Cabang</option>
            {branches.map((branch) => (
              <option key={branch.id} value={String(branch.id)}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-neutral-700">
          Karyawan
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
            onChange={(event) => setSelectedEmployeeId(event.target.value)}
            value={selectedEmployeeId}
          >
            <option value="all">Semua Karyawan</option>
            {employees.map((employee) => (
              <option key={employee.id} value={String(employee.id)}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Jumlah Hadir", value: totalPresent },
          { label: "Jam Masuk", value: reportRows.filter((item) => item.checkInTime).length },
          { label: "Status Cuti / Izin", value: totalApprovedLeave },
        ].map((stat) => (
          <div className="rounded-xl border border-neutral-200 bg-white p-4" key={stat.label}>
            <p className="text-sm text-neutral-600">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold text-neutral-900">{String(stat.value)}</p>
          </div>
        ))}
      </div>

      {reportRows.length === 0 ? (
        <p className="mt-5 rounded-xl bg-neutral-50 p-5 text-sm text-neutral-600">
          Tidak ada data absensi pada filter yang dipilih.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-neutral-100 text-neutral-800">
                <th className="border border-neutral-200 px-3 py-2">Nama</th>
                <th className="border border-neutral-200 px-3 py-2">Cabang</th>
                <th className="border border-neutral-200 px-3 py-2">Tanggal</th>
                <th className="border border-neutral-200 px-3 py-2">Jam Masuk</th>
                <th className="border border-neutral-200 px-3 py-2">Jam Keluar</th>
                <th className="border border-neutral-200 px-3 py-2">Status</th>
                <th className="border border-neutral-200 px-3 py-2">Selfie</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((attendance) => (
                <tr key={attendance.id} className="align-top">
                  <td className="border border-neutral-200 px-3 py-2">{attendance.employeeName}</td>
                  <td className="border border-neutral-200 px-3 py-2">{attendance.branchName}</td>
                  <td className="border border-neutral-200 px-3 py-2">{formatDate(attendance.checkInTime)}</td>
                  <td className="border border-neutral-200 px-3 py-2">
                    {attendance.checkInTime ? formatDate(attendance.checkInTime, true) : "-"}
                  </td>
                  <td className="border border-neutral-200 px-3 py-2">
                    {attendance.checkOutTime ? formatDate(attendance.checkOutTime, true) : "Belum"}
                  </td>
                  <td className="border border-neutral-200 px-3 py-2">{attendance.status}</td>
                  <td className="border border-neutral-200 px-3 py-2">
                    {attendance.selfieUrl ? "Ada" : "Tidak"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderLeave = () => (
    <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-800">LEAVE REQUESTS</p>
          <h2 className="mt-2 text-2xl font-semibold text-neutral-900">Persetujuan cuti karyawan</h2>
        </div>
        <p className="text-sm text-neutral-600">{pendingCount} menunggu keputusan</p>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}

      {pendingRequests.length === 0 ? (
        <p className="mt-5 rounded-xl bg-neutral-50 p-5 text-sm text-neutral-600">
          Tidak ada pengajuan cuti yang menunggu keputusan.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {pendingRequests.map((request) => (
            <li className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5" key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-neutral-900">{request.employeeName}</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    {request.branchName} · {request.username} · {leaveTypeLabel(request.leaveType)}
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                  Menunggu
                </span>
              </div>
              <p className="mt-3 text-sm text-neutral-700">
                <span className="font-medium">Rentang tanggal:</span>{" "}
                {formatDate(request.startDate)} – {formatDate(request.endDate)}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                {request.reason}
              </p>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                Catatan admin (opsional)
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-normal"
                  maxLength={2000}
                  onChange={(event) =>
                    setAdminNotes((current) => ({
                      ...current,
                      [request.id]: event.target.value,
                    }))
                  }
                  value={adminNotes[request.id] ?? ""}
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="min-h-10 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
                  disabled={processingId !== null}
                  onClick={() => void decideLeave(request.id, "APPROVED")}
                  type="button"
                >
                  {processingId === request.id ? "Menyimpan..." : "ACC"}
                </button>
                <button
                  className="min-h-10 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                  disabled={processingId !== null}
                  onClick={() => void decideLeave(request.id, "REJECTED")}
                  type="button"
                >
                  Tolak
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {processedRequests.length > 0 && (
        <div className="mt-7">
          <h3 className="font-semibold text-neutral-900">Riwayat keputusan</h3>
          <ul className="mt-3 divide-y divide-neutral-100">
            {processedRequests.map((request) => (
              <li className="flex flex-wrap justify-between gap-3 py-3" key={request.id}>
                <div>
                  <p className="font-medium text-neutral-800">
                    {request.employeeName} · {leaveTypeLabel(request.leaveType)}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {formatDate(request.startDate)} – {formatDate(request.endDate)}
                  </p>
                </div>
                <span
                  className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${
                    request.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {leaveStatusLabel(request.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">Panel Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Dashboard operasional</h1>
        <p className="mt-2 text-neutral-600">
          Ringkasan kehadiran, laporan absensi, dan pengajuan cuti seluruh cabang.
        </p>
      </header>

      <div className="mt-7 flex flex-wrap gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
        {[
          { id: "overview", label: "Overview" },
          { id: "report", label: "Laporan Absensi" },
          { id: "leave", label: "Leave Requests" },
        ].map((tab) => (
          <button
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-emerald-800 text-white"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id as "overview" | "report" | "leave")}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && renderOverview()}
      {activeTab === "report" && renderReport()}
      {activeTab === "leave" && renderLeave()}
    </main>
  );
}
