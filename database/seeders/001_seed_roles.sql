INSERT INTO roles (name, label, description) VALUES
  ('administrator', 'Administrator', 'Mengelola pengguna, role, ruangan, laporan, dan audit sistem.'),
  ('kepala_laboratorium', 'Kepala Laboratorium', 'Membuat dan mengajukan draf pengadaan tahunan.'),
  ('ketua_program_studi', 'Ketua Program Studi', 'Mereview, menyetujui, menolak, dan memfinalisasi pengadaan.'),
  ('staf_administrasi', 'Staf Administrasi', 'Mencatat penerimaan barang, nomor inventaris, dan data awal aset atau BHP.'),
  ('staf_laboratorium', 'Staf Laboratorium', 'Mengelola kondisi aset, maintenance, dan stok BHP.')
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  description = VALUES(description);
