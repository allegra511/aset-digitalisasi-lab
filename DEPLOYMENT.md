# Deployment VPS/Linux

Panduan ini menyiapkan aplikasi Labora di VPS/Linux dengan Node.js, MySQL, dan reverse proxy Nginx.

## 1. Requirement Server

- Ubuntu/Debian Linux atau distro setara.
- Node.js 18 atau lebih baru.
- MySQL 8 atau kompatibel.
- Nginx untuk reverse proxy.
- Git dan npm.

## 2. Ambil Kode dan Install Dependency

```bash
git clone <url-repository> aset-digitalisasi-lab
cd aset-digitalisasi-lab
npm ci --omit=dev
```

Jika belum memakai Git remote, pindahkan folder project ke server lalu jalankan `npm ci --omit=dev`.

## 3. Konfigurasi Environment

Buat file `.env`:

```bash
cp .env.example .env
nano .env
```

Contoh production:

```env
APP_NAME="Labora"
APP_ENV=production
NODE_ENV=production
APP_PORT=3000
APP_TRUST_PROXY=true
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

- `APP_SESSION_SECRET` wajib diganti. Aplikasi akan gagal start di production jika masih default.
- `APP_TRUST_PROXY=true` disarankan saat aplikasi berjalan di belakang Nginx.
- Ganti password admin default sebelum digunakan luas.

## 4. Setup Database

Masuk ke MySQL sebagai root atau user admin:

```bash
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

Jalankan schema dan seeder:

```bash
npm run db:schema
npm run db:seed
```

## 5. Jalankan Aplikasi

Smoke test langsung:

```bash
npm start
```

Buka:

```txt
http://SERVER_IP:3000/health
```

Untuk production, jalankan di balik process manager. Contoh PM2:

```bash
npm install -g pm2
pm2 start app.js --name aset-digitalisasi-lab
pm2 save
pm2 startup
```

Perintah operasional:

```bash
pm2 status
pm2 logs aset-digitalisasi-lab
pm2 restart aset-digitalisasi-lab
```

## 6. Nginx Reverse Proxy

Contoh konfigurasi:

```nginx
server {
    listen 80;
    server_name aset-lab.example.ac.id;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktifkan site dan reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Tambahkan HTTPS dengan Certbot atau mekanisme sertifikat kampus jika tersedia.

## 7. Folder Upload dan QR Code

Folder berikut harus ada dan writable:

```txt
public/uploads
public/qrcodes
```

Jika perlu:

```bash
mkdir -p public/uploads public/qrcodes
chmod 755 public/uploads public/qrcodes
```

Gunakan ownership sesuai user yang menjalankan Node.js, misalnya:

```bash
sudo chown -R $USER:$USER public/uploads public/qrcodes
```

## 8. Backup Database

Backup harian sederhana:

```bash
mkdir -p backups
mysqldump -u aset_lab_user -p aset_digitalisasi_lab > backups/aset_lab_$(date +%F).sql
```

Restore:

```bash
mysql -u aset_lab_user -p aset_digitalisasi_lab < backups/aset_lab_YYYY-MM-DD.sql
```

Backup file upload dan QR:

```bash
tar -czf backups/public-files_$(date +%F).tar.gz public/uploads public/qrcodes
```

## 9. Update Aplikasi

```bash
git pull
npm ci --omit=dev
npm run db:schema
pm2 restart aset-digitalisasi-lab
```

Jalankan `npm run db:schema` hanya setelah memastikan perubahan schema aman untuk environment production.

## 10. Checklist Production

- `.env` tidak masuk repository.
- `APP_ENV=production`.
- `APP_SESSION_SECRET` kuat dan bukan default.
- MySQL user tidak memakai root.
- Nginx sudah proxy ke port aplikasi.
- HTTPS aktif bila tersedia.
- `public/uploads` dan `public/qrcodes` writable.
- Backup database dan file sudah dijadwalkan.
