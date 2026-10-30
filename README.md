# Absensi Karyawan

Fondasi PWA absensi multi-cabang menggunakan Next.js App Router, TypeScript,
Tailwind CSS, Prisma, dan MySQL.

## Menjalankan secara lokal

1. Install dependency dengan `npm install`.
2. Salin `.env.example` menjadi `.env` dan isi kredensial MySQL lokal.
3. Buat database `absen_karyawan` pada MySQL.
4. Jalankan `npm run db:validate` lalu `npm run db:generate`.
5. Jalankan `npm run db:push` untuk menerapkan schema ke database.
6. Jalankan `npm run db:seed` untuk mengisi cabang dan akun demo.
7. Jalankan `npm run dev` dan buka `http://localhost:3000`.

Seed dapat dijalankan berulang kali dan menyiapkan cabang Palimanan,
Pulasaren, Pasar Caplek, dan Bode. Akun demo memakai PIN awal `123456`:

- Admin: username `admin` (cabang Palimanan).
- Karyawan demo: username `siti_pulasaren` (Siti Rahma, Pulasaren; nama contoh).
- Karyawan demo: username `budi_bode` (Budi Santoso, Bode; nama contoh).

Ganti username dan PIN demo sebelum penggunaan operasional. Akun karyawan
hanya dibuat dan dikelola oleh admin melalui dashboard; tidak tersedia
registrasi mandiri. Buka `/kiosk` untuk memilih
cabang dan menampilkan QR yang ditandatangani server serta diperbarui setiap
15 detik. Endpoint `POST /api/kiosk/verify` memverifikasi tanda tangan, umur
QR, dan keberadaan cabang. Isian QR berupa JSON dengan `branch_id`,
`timestamp` (waktu terbit Unix dalam milidetik), dan `signature`; kirim objek
tersebut sebagai properti `qr` pada endpoint verifikasi. QR tidak diterima
lebih dari 15 detik sejak waktu terbitnya.

Pada database lama yang masih memiliki kolom `users.nik`, ganti nama kolom
tersebut ke `username` sebelum menjalankan `npm run db:push`, agar username
yang sudah ada tetap tersimpan: `ALTER TABLE users RENAME COLUMN nik TO username;`.
Seed akan mengubah akun demo lama (`ADMIN01`, `EMP01`, `EMP02`)
menjadi username demo baru tanpa membuat duplikat.

Halaman `/employee` meminta akses kamera belakang untuk memindai QR, lalu
menggunakan kamera depan untuk mengambil selfie otomatis. Check-in hanya
tersimpan jika karyawan yang masuk terdaftar di cabang QR tersebut. Endpoint
`POST /api/attendance/check-in` memverifikasi ulang QR dan sesi karyawan sebelum
mencatat waktu server serta URL selfie pada tabel `Attendance`. Untuk
pengembangan, gambar JPEG disimpan di `public/uploads`; deployment produksi
harus memakai penyimpanan file persisten (atau mengganti implementasi ini
dengan object storage) agar file tidak hilang saat aplikasi dipindahkan atau
dibangun ulang. Akses kamera browser memerlukan HTTPS atau `localhost`.

Dashboard `/admin` menampilkan ringkasan check-in hari ini (zona waktu
Asia/Jakarta), total karyawan, antrean cuti, dan kehadiran terbaru. Karyawan
dapat membuat pengajuan cuti dari `/employee`; admin dapat menyetujui atau
menolak permintaan yang masih berstatus `PENDING` dengan catatan opsional.
Identitas karyawan untuk pengajuan diturunkan dari sesi server, dan tanggal
pengajuan aktif yang bertumpang tindih ditolak.

Schema menyimpan PIN pada kolom database `pin_hash`; nilai yang ditulis ke sana
harus berupa hash, bukan PIN teks biasa. Jangan commit file `.env` atau data
rahasia.