import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Absensi Karyawan",
  description: "Sistem absensi untuk operasional multi-cabang.",
  applicationName: "Absensi Karyawan",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}