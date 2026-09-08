# INZAKI TRADE Portal V5

Versi ini dibuat untuk menghilangkan masalah portal lama yang terus menampilkan pesan Supabase belum terhubung.

## Upload ke GitHub
Replace/upload SEMUA file berikut ke ROOT repository:
- index.html
- app.js
- style.css
- config.js

Jangan gunakan app.js/index.html lama secara bersamaan.

## Penting
1. Pastikan GitHub Pages menggunakan branch dan folder yang sama dengan repository aktif.
2. Setelah Actions `pages build and deployment` SUCCESS, buka URL dengan query baru:
   `?v=INZAKI_V5_20260910`
3. V5 otomatis mencoba konfigurasi Supabase yang pernah dipakai portal INZAKI dan memilih project yang dapat membaca tabel portal.
4. Tidak ada SQL penghapusan data.
5. SQL EA hanya untuk tabel `ea_trades`.

## Jika data masih 0
V5 akan menampilkan error koneksi yang lebih spesifik. Jangan jalankan SQL reset/delete. Kirim screenshot error tersebut.
