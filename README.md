# Labora

Labora adalah aplikasi web untuk mengelola aset laboratorium dan barang habis pakai (BHP): pengadaan, penerimaan, inventaris, stok, maintenance, laporan, dan audit.

Stack:

```txt
Node.js + Express.js + Pug + MySQL
```

## Quick Setup Lokal

Pastikan **MySQL Laragon sudah ON**, lalu jalankan dari folder project:

```powershell
npm install
Copy-Item .env.example .env
mysql -u root -e "CREATE DATABASE IF NOT EXISTS aset_digitalisasi_lab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm run db:schema
npm run db:seed
npm run dev
```

Buka:

```txt
http://localhost:3000
```

Login cepat:

```txt
Username: admin
Email: admin@example.test
Password: admin12345
```

Seeder juga membuat akun demo untuk semua role. Akun non-admin memakai password yang sama:

```txt
Password demo non-admin: demo12345
```

| Role | Username | Email |
| --- | --- | --- |
| Administrator | `admin` | `admin@example.test` |
| Kepala Laboratorium | `kepalalab` | `kepalalab@example.test` |
| Ketua Program Studi | `kaprodi` | `kaprodi@example.test` |
| Staf Administrasi | `stafadmin` | `stafadmin@example.test` |
| Staf Laboratorium | `staf_lab` | `staflab@example.test` |

## Kalau Pakai Bash/Git Bash

```bash
npm install
cp .env.example .env
mysql -u root -e "CREATE DATABASE IF NOT EXISTS aset_digitalisasi_lab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm run db:schema
npm run db:seed
npm run dev
```

## Requirement

- Node.js 18+
- npm
- MySQL 8 atau MySQL Laragon

Default `.env` sudah cocok untuk Laragon yang memakai:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=aset_digitalisasi_lab
DB_USER=root
DB_PASSWORD=
```

## Perintah Harian

Jalankan server development:

```bash
npm run dev
```

Jalankan test:

```bash
npm test
```

Jalankan production lokal:

```bash
npm start
```

## Reset Database Lokal

Hati-hati, ini menghapus semua data lokal:

```powershell
mysql -u root -e "DROP DATABASE IF EXISTS aset_digitalisasi_lab; CREATE DATABASE aset_digitalisasi_lab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm run db:schema
npm run db:seed
```

## Fitur Utama

- Homepage publik.
- Login dan logout.
- Role-based access control.
- Dashboard sesuai role.
- Manajemen pengguna dan ruangan.
- Pengadaan, review, finalisasi, dan locking.
- Receiving parsial.
- Inventaris aset dengan nomor inventaris dan QR.
- BHP dan transaksi stok.
- Maintenance dengan pemakaian BHP otomatis.
- Reports dan export Excel/CSV.
- Audit log.

## Role Sistem

- Administrator: mengelola user, role akses, ruangan, laporan, dan audit log.
- Kepala Laboratorium: membuat draf pengadaan tahunan, menambah item kebutuhan lab, dan submit draf untuk direview.
- Ketua Program Studi: mereview pengadaan, approve/reject item, memberi catatan penolakan, dan finalisasi draf.
- Staf Administrasi: mencatat receiving/penerimaan barang, membuat aset dari barang diterima, dan memasukkan stok awal BHP dari receiving.
- Staf Laboratorium: mengelola inventaris harian, update kondisi aset, soft delete/replace aset, transaksi stok BHP, dan maintenance.

## Route Penting

- `/` homepage publik.
- `/auth/login` login.
- `/dashboard` dashboard setelah login.
- `/users` pengguna.
- `/rooms` ruangan.
- `/procurement/drafts` pengadaan Kepala Lab.
- `/procurement/review` review Kaprodi.
- `/receiving` penerimaan barang.
- `/assets` inventaris.
- `/consumables` BHP.
- `/maintenance` maintenance.
- `/reports` laporan.
- `/audit` audit log.

## Struktur Penting

```txt
app.js
config/
database/
public/
src/
  middlewares/
  modules/
  shared/
  views/
tests/
```

## Troubleshooting

**Login gagal / dashboard error**

Pastikan MySQL Laragon ON, database sudah dibuat, dan sudah menjalankan:

```bash
npm run db:schema
npm run db:seed
```

**`mysql` tidak dikenali**

Tambahkan folder MySQL Laragon ke PATH, contoh:

```txt
C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin
```

Atau jalankan command dari terminal Laragon.

**Port 3000 sudah dipakai**

Ubah `APP_PORT` di `.env`, misalnya:

```env
APP_PORT=3001
```

**Ingin deployment VPS/Linux**

Lihat:

```txt
DEPLOYMENT.md
```
