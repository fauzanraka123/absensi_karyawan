"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import type { Html5Qrcode as Html5QrcodeInstance } from "html5-qrcode";

type AttendanceRecord = {
  id: number;
  checkInTime: string;
  checkOutTime: string | null;
  status: string;
  selfieUrl: string | null;
  branchName: string;
};

type AttendanceAction = "CHECK_IN" | "CHECK_OUT";

type EmployeeAttendanceProps = {
  attendances: AttendanceRecord[];
  initialAction: AttendanceAction;
  branchId: number;
  branchName: string;
  employeeId: number;
  employeeName: string;
};

type VerifyResponse = {
  valid?: boolean;
  reason?: string;
  error?: string;
  branch?: { id: number; name: string };
  timestamp?: number;
};

type AttendanceResponse = {
  error?: string;
  attendance?: AttendanceRecord;
};

type VerifiedQr = {
  payload: unknown;
  branchId: number;
  timestamp: number;
};

type Phase = "scanning" | "verifying" | "selfie" | "saving" | "success" | "error";

function errorMessageForQr(response: VerifyResponse, status: number) {
  if (status === 410 || response.reason === "expired") {
    return "QR sudah kedaluwarsa. Pindai QR terbaru di layar kiosk.";
  }
  if (response.reason === "unknown_branch") {
    return "Cabang pada QR tidak ditemukan.";
  }
  if (response.reason === "invalid_signature" || status === 401) {
    return "QR tidak valid. Pastikan Anda memindai QR dari layar kiosk.";
  }
  return response.error ?? "QR tidak dapat diverifikasi. Silakan coba lagi.";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function EmployeeAttendance({
  attendances: initialAttendances,
  initialAction,
  branchId,
  branchName,
  employeeId,
  employeeName,
}: EmployeeAttendanceProps) {
  const [attendances, setAttendances] = useState(initialAttendances);
  const [attendanceAction, setAttendanceAction] = useState(initialAction);
  const [phase, setPhase] = useState<Phase>("scanning");
  const [error, setError] = useState("");
  const [verifiedQr, setVerifiedQr] = useState<VerifiedQr | null>(null);
  const scannerHandled = useRef(false);
  const webcamRef = useRef<Webcam>(null);
  const captureStarted = useRef(false);

  const handleDecodedQr = useCallback(
    async (decodedText: string) => {
      if (scannerHandled.current) return;
      scannerHandled.current = true;
      setPhase("verifying");
      setError("");

      let payload: unknown;
      try {
        payload = JSON.parse(decodedText);
      } catch (parseError) {
        if (!(parseError instanceof SyntaxError)) throw parseError;
        setError("QR tidak berisi data absensi yang valid.");
        setPhase("error");
        return;
      }

      try {
        const response = await fetch("/api/kiosk/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qr: payload }),
        });
        const result = (await response.json()) as VerifyResponse;
        if (!response.ok || !result.valid || !result.branch || !result.timestamp) {
          throw new Error(errorMessageForQr(result, response.status));
        }
        if (result.branch.id !== branchId) {
          throw new Error(
            `QR ini untuk cabang ${result.branch.name}, sedangkan akun Anda terdaftar di ${branchName}.`,
          );
        }

        setVerifiedQr({
          payload,
          branchId: result.branch.id,
          timestamp: result.timestamp,
        });
        captureStarted.current = false;
        setPhase("selfie");
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "QR tidak dapat diverifikasi. Silakan coba lagi.",
        );
        setPhase("error");
      }
    },
    [branchId, branchName],
  );

  useEffect(() => {
    if (phase !== "scanning") return;

    let cancelled = false;
    let scannerStarted = false;
    let scanner: Html5QrcodeInstance | undefined;

    void import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        if (cancelled) return;

        scanner = new Html5Qrcode("employee-qr-reader", { verbose: false });
        return scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (!cancelled) void handleDecodedQr(decodedText);
          },
          () => {},
        );
      })
      .then(() => {
        scannerStarted = scanner !== undefined;
        if (cancelled && scannerStarted) return scanner?.stop();
      })
      .catch((scannerError: unknown) => {
        if (cancelled) return;
        setError(
          scannerError instanceof Error
            ? `Kamera pemindai tidak dapat dibuka: ${scannerError.message}`
            : "Kamera pemindai tidak dapat dibuka. Periksa izin kamera browser.",
        );
        setPhase("error");
      });

    return () => {
      cancelled = true;
      if (scannerStarted && scanner?.isScanning) {
        void scanner.stop().catch((stopError: unknown) => {
          console.error("Kamera pemindai gagal dihentikan:", stopError);
        });
      }
    };
  }, [handleDecodedQr, phase]);

  const saveAttendance = useCallback(
    async (selfie: string) => {
      if (!verifiedQr || captureStarted.current) return;
      captureStarted.current = true;
      setPhase("saving");
      setError("");

      try {
        const response = await fetch("/api/attendance/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: attendanceAction,
            user_id: employeeId,
            branch_id: verifiedQr.branchId,
            timestamp: verifiedQr.timestamp,
            qr: verifiedQr.payload,
            selfie,
          }),
        });
        const result = (await response.json()) as AttendanceResponse;
        if (!response.ok || !result.attendance) {
          throw new Error(
            result.error ?? "Absensi tidak dapat disimpan. Silakan coba lagi.",
          );
        }

        const attendance = result.attendance;
        setAttendances((current) =>
          attendanceAction === "CHECK_IN"
            ? [attendance, ...current].slice(0, 10)
            : current.map((record) =>
                record.id === attendance.id ? attendance : record,
              ),
        );
        setPhase("success");
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Absensi tidak dapat disimpan. Silakan coba lagi.",
        );
        setPhase("error");
      }
    },
    [attendanceAction, employeeId, verifiedQr],
  );

  const captureSelfie = useCallback(
    () => {
      function capture(attempt: number) {
        if (phase !== "selfie" || captureStarted.current) return;
        const selfie = webcamRef.current?.getScreenshot();
        if (selfie) {
          void saveAttendance(selfie);
          return;
        }

        if (attempt >= 6) {
          setError("Kamera depan belum siap mengambil foto. Silakan coba kembali.");
          setPhase("error");
          return;
        }
        window.setTimeout(() => capture(attempt + 1), 250);
      }

      capture(0);
    },
    [phase, saveAttendance],
  );

  function restartScanner() {
    scannerHandled.current = false;
    captureStarted.current = false;
    setVerifiedQr(null);
    setError("");
    setPhase("scanning");
  }

  function chooseAction(action: AttendanceAction) {
    if (action === attendanceAction) return;
    scannerHandled.current = false;
    captureStarted.current = false;
    setVerifiedQr(null);
    setError("");
    setAttendanceAction(action);
    setPhase("scanning");
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
            Area Karyawan
          </p>
          <h1 className="mt-2 text-3xl font-bold text-neutral-900">
            Halo, {employeeName}
          </h1>
          <p className="mt-2 text-neutral-600">
            {branchName} · Catat kehadiran Anda dengan QR kiosk.
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-sm font-semibold text-emerald-800">ABSENSI KARYAWAN</p>
          <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
            {attendanceAction === "CHECK_IN" ? "Absen Masuk" : "Absen Keluar"}
          </h2>
          <div
            aria-label="Pilih jenis absensi"
            className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1"
            role="group"
          >
            {([
              ["CHECK_IN", "Absen Masuk (Check-In)"],
              ["CHECK_OUT", "Absen Keluar (Check-Out)"],
            ] as const).map(([action, label]) => (
              <button
                aria-pressed={attendanceAction === action}
                className={`min-h-12 rounded-lg px-3 py-2 text-sm font-semibold ${
                  attendanceAction === action
                    ? "bg-emerald-800 text-white shadow-sm"
                    : "text-neutral-700 hover:bg-white"
                }`}
                disabled={
                  phase === "verifying" ||
                  phase === "selfie" ||
                  phase === "saving"
                }
                key={action}
                onClick={() => chooseAction(action)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Arahkan kamera belakang ke QR pada layar kiosk cabang Anda. Setelah
            QR dinyatakan valid, kamera depan akan mengambil selfie otomatis
            untuk{" "}
            {attendanceAction === "CHECK_IN" ? "absen masuk" : "absen keluar"}.
          </p>

          <div
            aria-hidden={phase !== "scanning"}
            className={`mt-5 overflow-hidden rounded-xl bg-neutral-950 ${
              phase === "scanning" ? "block" : "hidden"
            }`}
            id="employee-qr-reader"
          />

          {phase === "verifying" && (
            <div
              aria-live="polite"
              className="mt-5 rounded-xl bg-emerald-50 p-5 text-center text-emerald-900"
            >
              Memeriksa QR dan cabang...
            </div>
          )}

          {phase === "selfie" && (
            <div className="mt-5 overflow-hidden rounded-xl bg-neutral-950">
              <Webcam
                audio={false}
                className="max-h-72 w-full object-cover"
                mirrored
                onUserMedia={() => captureSelfie()}
                onUserMediaError={(cameraError) => {
                  setError(
                    typeof cameraError === "string"
                      ? cameraError
                      : cameraError.message,
                  );
                  setPhase("error");
                }}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                screenshotQuality={0.85}
                videoConstraints={{
                  facingMode: "user",
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }}
              />
              <p className="p-3 text-center text-sm text-white">
                Kamera depan aktif — mengambil selfie...
              </p>
            </div>
          )}

          {(phase === "saving" || phase === "verifying") && (
            <p aria-live="polite" className="mt-4 text-center text-sm text-neutral-600">
              {phase === "saving" ? "Menyimpan absensi..." : ""}
            </p>
          )}

          {phase === "success" && (
            <div
              aria-live="polite"
              className="mt-5 flex items-center gap-4 rounded-xl bg-emerald-50 p-5 text-emerald-900"
              role="status"
            >
              <svg
                aria-hidden="true"
                className="h-10 w-10 shrink-0 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  d="m5 12 4 4L19 6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                />
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              </svg>
              <div>
                <p className="font-semibold">
                  {attendanceAction === "CHECK_IN"
                    ? "Absen Masuk Berhasil"
                    : "Absen Keluar Berhasil"}
                </p>
                <p className="mt-1 text-sm">
                  {attendanceAction === "CHECK_IN"
                    ? "Foto selfie dan waktu check-in Anda sudah tercatat."
                    : "Waktu check-out Anda sudah tercatat pada absensi hari ini."}
                </p>
              </div>
            </div>
          )}

          {phase === "error" && (
            <p
              aria-live="assertive"
              className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}

          {(phase === "error" || phase === "success") && (
            <button
              className="mt-5 min-h-12 w-full rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-emerald-900"
              onClick={restartScanner}
              type="button"
            >
              {phase === "success" ? "Absen lagi" : "Coba lagi"}
            </button>
          )}

          {phase === "scanning" && (
            <p className="mt-4 text-center text-xs leading-5 text-neutral-500">
              Kamera memerlukan izin browser dan koneksi HTTPS (atau localhost).
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-800">RIWAYAT</p>
              <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
                Riwayat absensi
              </h2>
            </div>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
              Milik Anda
            </span>
          </div>

          {attendances.length === 0 ? (
            <p className="mt-6 rounded-xl bg-neutral-50 p-5 text-sm text-neutral-600">
              Belum ada absensi tercatat. Riwayat Anda akan muncul di sini setelah
              check-in berhasil.
            </p>
          ) : (
            <ol className="mt-5 divide-y divide-neutral-100">
              {attendances.map((attendance) => (
                <li className="flex items-center gap-3 py-4" key={attendance.id}>
                  {attendance.selfieUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt="Selfie absensi"
                      className="h-12 w-12 rounded-full object-cover"
                      height={48}
                      src={attendance.selfieUrl}
                      width={48}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-semibold text-emerald-800"
                    >
                      {attendance.status === "PRESENT" ? "✓" : "•"}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900">
                      Masuk: {formatDate(attendance.checkInTime)}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      Keluar:{" "}
                      {attendance.checkOutTime
                        ? formatDate(attendance.checkOutTime)
                        : "Belum check-out"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {attendance.branchName} · {attendance.status}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
