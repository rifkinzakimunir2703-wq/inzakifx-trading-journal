# InzakiTrade Existing Portal — EA Upgrade

Upgrade ini menyisipkan menu **EA Monitor** ke portal lama Anda. Jangan mengganti config.js.

File pengganti: index.html, app.js, style.css. Jalankan supabase_ea_upgrade.sql.

Portal membaca view `ea_trades_public`. Setelah Edge Function/webhook EA mengisi `ea_trades`, data akan tampil otomatis.
