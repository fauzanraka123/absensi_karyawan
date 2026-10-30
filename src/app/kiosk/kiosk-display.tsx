"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { KioskQrPayload } from "@/lib/kiosk-qr";

type Branch = {
  id: number;
  name: string;
};

type KioskDisplayProps = {
  branches: Branch[];
};

export function KioskDisplay({ branches }: KioskDisplayProps) {
  const [selectedBranchId, setSelectedBranchId] = useState(
    branches[0]?.id ?? 0,
  );
  const [qr, setQr] = useState<KioskQrPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    async function refreshQr() {
      try {
        const response = await fetch("/api/kiosk/qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchId: selectedBranchId }),
        });
        const result: { qr?: KioskQrPayload; error?: string } =
          await response.json();
        if (!response.ok || !result.qr) {
          throw new Error(result.error ?? "QR tidak dapat dibuat.");
        }
        if (cancelled) return;

        setError("");
        setQr(result.qr);
        refreshTimer = setTimeout(
          () => {
            setQr(null);
            void refreshQr();
          },
          14_000,
        );
      } catch (requestError) {
        if (cancelled) return;
        setQr(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "QR tidak dapat dibuat.",
        );
        refreshTimer = setTimeout(refreshQr, 3_000);
      }
    }

    if (selectedBranchId > 0) {
      void refreshQr();
    }

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [selectedBranchId]);

  if (branches.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <section className="max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-neutral-900">
            Cabang belum tersedia
          </h1>
          <p className="mt-3 text-neutral-600">
            Jalankan seed database untuk menambahkan cabang sebelum membuka
            kiosk.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-6 py-10">
      <section className="w-full max-w-3xl rounded-3xl bg-white p-8 text-center shadow-xl sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
          Absensi Karyawan
        </p>
        <h1 className="mt-3 text-3xl font-bold text-neutral-900 sm:text-4xl">
          Kiosk QR Cabang
        </h1>
        <label className="mx-auto mt-8 block max-w-md text-left text-sm font-medium text-neutral-700">
          Pilih cabang
          <select
            className="mt-2 min-h-12 w-full rounded-lg border border-neutral-300 bg-white px-4 text-base"
            onChange={(event) => {
              setSelectedBranchId(Number(event.target.value));
              setQr(null);
              setError("");
            }}
            value={selectedBranchId}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        <div
          aria-live="polite"
          className="mx-auto mt-8 flex min-h-80 w-full max-w-80 items-center justify-center rounded-2xl border border-neutral-200 bg-white p-5"
        >
          {qr ? (
            <QRCodeSVG
              aria-label={`QR absensi cabang ${
                branches.find((branch) => branch.id === selectedBranchId)?.name
              }`}
              className="h-full w-full"
              level="M"
              value={JSON.stringify(qr)}
            />
          ) : error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-sm text-neutral-500">Menyiapkan QR...</p>
          )}
        </div>

        <p className="mt-6 text-sm text-neutral-600">
          QR diperbarui otomatis sebelum masa berlaku 15 detik habis.
          Tunjukkan layar ini saat melakukan absensi.
        </p>
      </section>
    </main>
  );
}
