"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const result = await signIn("credentials", {
        username: formData.get("username"),
        pin: formData.get("pin"),
        redirect: false,
      });

      if (result?.error) {
        setError("Username atau PIN tidak sesuai. Silakan coba lagi.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Login belum dapat diproses. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Absensi Karyawan
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-neutral-900">Masuk</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Gunakan username dan PIN yang diberikan admin untuk masuk ke dashboard sesuai role.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-neutral-800">
            Username
            <input
              autoComplete="username"
              className="mt-2 block min-h-11 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              maxLength={32}
              name="username"
              required
              type="text"
            />
          </label>
          <label className="block text-sm font-medium text-neutral-800">
            PIN
            <input
              autoComplete="current-password"
              className="mt-2 block min-h-11 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              inputMode="numeric"
              maxLength={16}
              minLength={4}
              name="pin"
              required
              type="password"
            />
          </label>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <button
            className="min-h-11 w-full rounded-lg bg-emerald-800 px-4 font-semibold text-white transition-colors hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Memeriksa..." : "Masuk"}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            href="/kiosk"
          >
            Buka Layar Kiosk QR Toko
          </Link>
        </div>
      </section>
    </main>
  );
}