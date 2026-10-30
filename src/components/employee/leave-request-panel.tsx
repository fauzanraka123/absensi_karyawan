"use client";

import { useState, type FormEvent } from "react";

type LeaveRequest = {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNotes: string | null;
};

type LeaveRequestPanelProps = {
  requests: LeaveRequest[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function statusLabel(status: LeaveRequest["status"]) {
  if (status === "APPROVED") return "Disetujui";
  if (status === "REJECTED") return "Ditolak";
  return "Menunggu";
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

export function LeaveRequestPanel({ requests: initialRequests }: LeaveRequestPanelProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveType, startDate, endDate, reason }),
      });
      const result = (await response.json()) as {
        error?: string;
        leaveRequest?: LeaveRequest;
      };
      if (!response.ok || !result.leaveRequest) {
        throw new Error(result.error ?? "Pengajuan cuti tidak dapat disimpan.");
      }

      const leaveRequest = result.leaveRequest;
      setRequests((current) =>
        [leaveRequest, ...current].sort(
          (left, right) =>
            new Date(right.startDate).getTime() - new Date(left.startDate).getTime(),
        ).slice(0, 10),
      );
      setReason("");
      setNotice("Pengajuan cuti berhasil dikirim dan menunggu keputusan admin.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Pengajuan cuti tidak dapat disimpan.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid gap-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <p className="text-sm font-semibold text-emerald-800">PENGAJUAN CUTI</p>
        <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
          Ajukan izin atau cuti
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Isi tanggal dan alasan pengajuan. Admin akan meninjau permintaan Anda.
        </p>
        <form className="mt-5 space-y-4" onSubmit={submitRequest}>
          <label className="block text-sm font-medium text-neutral-700">
            Jenis pengajuan
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
              onChange={(event) => setLeaveType(event.target.value)}
              value={leaveType}
            >
              <option value="ANNUAL">Cuti tahunan</option>
              <option value="SICK">Sakit</option>
              <option value="PERSONAL">Keperluan pribadi</option>
              <option value="OTHER">Lainnya</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700">
              Tanggal mulai
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
                onChange={(event) => setStartDate(event.target.value)}
                required
                type="date"
                value={startDate}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Tanggal selesai
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                required
                type="date"
                value={endDate}
              />
            </label>
          </div>
          <label className="block text-sm font-medium text-neutral-700">
            Alasan
            <textarea
              className="mt-1 min-h-28 w-full rounded-lg border border-neutral-300 px-3 py-2"
              maxLength={2000}
              minLength={10}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Jelaskan alasan pengajuan (minimal 10 karakter)"
              required
              value={reason}
            />
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
              {notice}
            </p>
          )}
          <button
            className="min-h-11 w-full rounded-lg bg-emerald-800 px-4 font-semibold text-white hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Mengirim..." : "Kirim pengajuan"}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Riwayat pengajuan</h2>
        {requests.length === 0 ? (
          <p className="mt-4 rounded-xl bg-neutral-50 p-5 text-sm text-neutral-600">
            Anda belum memiliki pengajuan cuti.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-neutral-100">
            {requests.map((request) => (
              <li className="py-4" key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-neutral-900">
                      {leaveTypeLabel(request.leaveType)}
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">
                      {formatDate(request.startDate)} – {formatDate(request.endDate)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      request.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-800"
                        : request.status === "REJECTED"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {statusLabel(request.status)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">
                  {request.reason}
                </p>
                {request.adminNotes && (
                  <p className="mt-2 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
                    Catatan admin: {request.adminNotes}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
