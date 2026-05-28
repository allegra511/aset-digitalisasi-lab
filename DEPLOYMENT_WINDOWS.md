# Deployment Windows

Panduan ini menyiapkan aplikasi Labora di Windows/Windows Server dengan Node.js, MySQL, dan process manager agar aplikasi bisa berjalan stabil untuk penggunaan internal lab/kampus.

## 1. Requirement Server

- Windows 10/11 atau Windows Server.
- Node.js 18 atau lebih baru.
- MySQL 8 atau MySQL Laragon.
- Git dan npm.
- Process manager production: **NSSM** direkomendasikan, PM2 opsional.
- Akses administrator Windows untuk membuka firewall atau membuat service.

## 2. Ambil Kode dan Install Dependency

Jika memakai Git:

```powershell
git clone <url-repository> aset-digitalisasi-lab
cd aset-digitalisasi-lab
npm ci --omit=dev
```

Jika belum memakai Git remote, pindahkan folder project ke server Windows lalu jalankan dari folder project:

```powershell
npm ci --omit=dev
```

## 3. Konfigurasi Environment

Buat file `.env` dari contoh:

```powershell
Copy-Item .env.example .env
notepad .env
```

Contoh production:

```env
APP_NAME="Labora"
APP_ENV=production
NODE_ENV=production
APP_PORT=3000
APP_TRUST_PROXY=false
APP_SESSION_NAME=lab_asset_session
APP_SESSION_SECRET=ganti-dengan-secret-panjang-dan-acak
APP_SESSION_MAX_AGE=86400000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=aset_digitalisasi_lab
DB_USER=aset_lab_user
DB_PASSWORD=ganti-password-database
DB_CONNECTION_LIMIT=10

DEFAULT_ADMIN_NAME=Administrator
DEFAULT_ADMIN_EMAIL=admin@example.test
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=ganti-password-admin-awal
```

Catatan:

- `APP_SESSION_SECRET` wajib diganti. Aplikasi akan gagal start di production jika masih memakai default.
- Pakai `APP_TRUST_PROXY=false` jika aplikasi diakses langsung dari port Node.js.
- Pakai `APP_TRUST_PROXY=true` jika aplikasi berada di belakang IIS reverse proxy atau reverse proxy lain.
- Ganti password admin default sebelum aplikasi digunakan luas.

## 4. Setup Database

Pastikan service MySQL sudah berjalan. Jika memakai Laragon, nyalakan MySQL dari panel Laragon.

Masuk ke MySQL sebagai root atau user admin:

```powershell
mysql -u root -p
```

Buat database dan user:

```sql
CREATE DATABASE aset_digitalisasi_lab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'aset_lab_user'@'localhost' IDENTIFIED BY 'ganti-password-database';
GRANT ALL PRIVILEGES ON aset_digitalisasi_lab.* TO 'aset_lab_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Jalankan schema dan seeder dari folder project:

```powershell
npm run db:schema
npm run db:seed
```

## 5. Smoke Test Aplikasi

Jalankan aplikasi secara manual dulu:

```powershell
npm start
```

Buka dari browser server:

```txt
http://localhost:3000/health
http://localhost:3000
```

Jika ingin dibuka dari komputer lain satu jaringan:

```txt
http://IP_SERVER_WINDOWS:3000
```

Jika tidak bisa diakses dari komputer lain, buka firewall Windows untuk port aplikasi:

```powershell
New-NetFirewallRule -DisplayName "Labora Node.js 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

## 6. Jalankan Production dengan NSSM

NSSM direkomendasikan untuk Windows karena aplikasi bisa berjalan sebagai Windows Service dan otomatis hidup setelah restart.

Download NSSM dari:

```txt
https://nssm.cc/download
```

Ekstrak NSSM, lalu dari PowerShell sebagai Administrator jalankan:

```powershell
nssm install Labora
```

Isi konfigurasi service:

```txt
Path: C:\Program Files\nodejs\node.exe
Startup directory: C:\path\to\aset-digitalisasi-lab
Arguments: app.js
```

Contoh jika project berada di `C:\apps\aset-digitalisasi-lab`:

```txt
Path: C:\Program Files\nodejs\node.exe
Startup directory: C:\apps\aset-digitalisasi-lab
Arguments: app.js
```

Pada tab **I/O**, opsional isi log file:

```txt
Output: C:\apps\aset-digitalisasi-lab\logs\out.log
Error: C:\apps\aset-digitalisasi-lab\logs\err.log
```

Buat folder log jika dipakai:

```powershell
New-Item -ItemType Directory -Force logs
```

Start service:

```powershell
nssm start Labora
```

Perintah operasional:

```powershell
nssm status Labora
nssm restart Labora
nssm stop Labora
```

Jika ingin membuka konfigurasi service lagi:

```powershell
nssm edit Labora
```

## 7. Alternatif: Jalankan dengan PM2

PM2 bisa dipakai untuk testing production ringan:

```powershell
npm install -g pm2
pm2 start app.js --name aset-digitalisasi-lab
pm2 save
```

Perintah operasional:

```powershell
pm2 status
pm2 logs aset-digitalisasi-lab
pm2 restart aset-digitalisasi-lab
pm2 stop aset-digitalisasi-lab
```

Catatan: untuk auto-start setelah Windows restart, NSSM biasanya lebih sederhana dan stabil dibanding PM2 di Windows.

## 8. Reverse Proxy IIS, Opsional

Jika ingin memakai domain internal atau HTTPS, gunakan IIS sebagai reverse proxy ke Node.js.

Install komponen IIS:

- IIS.
- URL Rewrite.
- Application Request Routing (ARR).

Aktifkan proxy ARR:

```txt
IIS Manager -> Server -> Application Request Routing Cache -> Server Proxy Settings -> Enable proxy
```

Contoh rule reverse proxy:

```txt
Public URL: http://labora.local
Proxy target: http://127.0.0.1:3000
```

Jika aplikasi berada di belakang IIS, ubah `.env`:

```env
APP_TRUST_PROXY=true
```

Setelah mengubah `.env`, restart service:

```powershell
nssm restart Labora
```

## 9. Folder Upload dan QR Code

Folder berikut harus ada dan dapat ditulis oleh user yang menjalankan service:

```txt
public/uploads
public/qrcodes
```

Jika perlu, buat folder:

```powershell
New-Item -ItemType Directory -Force public\uploads
New-Item -ItemType Directory -Force public\qrcodes
```

Jika service berjalan dengan user khusus, beri permission write ke folder project atau minimal ke folder berikut:

```txt
public/uploads
public/qrcodes
logs
```

## 10. Backup Database dan File

Buat folder backup:

```powershell
New-Item -ItemType Directory -Force backups
```

Backup database:

```powershell
mysqldump -u aset_lab_user -p aset_digitalisasi_lab > backups\aset_lab_backup.sql
```

Backup file upload dan QR:

```powershell
Compress-Archive -Path public\uploads, public\qrcodes -DestinationPath backups\public-files.zip -Force
```

Restore database:

```powershell
mysql -u aset_lab_user -p aset_digitalisasi_lab < backups\aset_lab_backup.sql
```

Untuk production, jadwalkan backup berkala memakai **Task Scheduler**.

## 11. Update Aplikasi

Jika memakai Git:

```powershell
git pull
npm ci --omit=dev
npm run db:schema
nssm restart Labora
```

Jika update dilakukan dengan copy folder manual:

```powershell
npm ci --omit=dev
npm run db:schema
nssm restart Labora
```

Catatan:

- Jalankan `npm run db:schema` hanya setelah memastikan perubahan schema aman untuk data production.
- Backup database sebelum update besar.
- Jangan menimpa `.env`, `public/uploads`, dan `public/qrcodes` saat copy manual.

## 12. Troubleshooting

**Aplikasi gagal start di production**

Pastikan `APP_SESSION_SECRET` sudah diganti dan bukan `change-this-session-secret`.

**Tidak bisa konek database**

Pastikan MySQL berjalan dan data `.env` sesuai:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=aset_digitalisasi_lab
DB_USER=aset_lab_user
DB_PASSWORD=ganti-password-database
```

**`mysql` atau `mysqldump` tidak dikenali**

Tambahkan folder `bin` MySQL ke PATH Windows. Contoh Laragon:

```txt
C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin
```

**Port 3000 sudah dipakai**

Ubah `APP_PORT` di `.env`, misalnya:

```env
APP_PORT=3001
```

Lalu restart service:

```powershell
nssm restart Labora
```

**Tidak bisa diakses dari komputer lain**

Pastikan IP server benar dan firewall membuka port aplikasi:

```powershell
New-NetFirewallRule -DisplayName "Labora Node.js 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

## 13. Checklist Production Windows

- `.env` tidak masuk repository.
- `APP_ENV=production`.
- `APP_SESSION_SECRET` kuat dan bukan default.
- MySQL user tidak memakai root.
- Service berjalan dengan NSSM atau process manager lain.
- Port aplikasi dibuka di Windows Firewall jika akses langsung.
- IIS reverse proxy dan HTTPS aktif jika memakai domain.
- `public/uploads` dan `public/qrcodes` writable.
- Backup database dan file sudah dijadwalkan.
- Password admin default sudah diganti.
