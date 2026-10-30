"use client";

import { signOut } from "next-auth/react";

type SessionHeaderProps = {
  name: string;
};

export function SessionHeader({ name }: SessionHeaderProps) {
  return (
    <header className="border-b border-neutral-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
            Absensi Karyawan
          </p>
          <p className="text-sm text-neutral-700">Selamat datang, {name}</p>
        </div>
        <button
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          onClick={() => void signOut({ callbackUrl: "/" })}
          type="button"
        >
          Keluar
        </button>
      </div>
    </header>
  );
}
