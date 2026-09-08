INZAKITRADE PORTAL — REBUILD FINAL

1. BACKUP repository GitHub saat ini.
2. Upload/replace index.html, app.js, style.css.
3. JANGAN hapus config.js. Portal tetap memakai config.js lama.
4. Jika EA Monitor diperlukan, jalankan supabase_ea_upgrade.sql sekali di Supabase SQL Editor.
5. Jika memakai EA webhook, deploy supabase-edge-function-trades.ts sebagai Edge Function bernama ea-trades.
6. Set secret EA_WEBHOOK_KEY di Edge Function. Jangan taruh service role key di frontend.
7. URL EA: https://PROJECT-REF.supabase.co/functions/v1/ea-trades
8. MT5: Tools > Options > Expert Advisors > Allow WebRequest for https://PROJECT-REF.supabase.co
9. Hard refresh GitHub Pages: browser menu > Reload, atau buka URL dengan ?v=20260909.

CATATAN DATA:
- Paket ini TIDAK menghapus tabel trades/prop_accounts/payouts/profiles.
- Public View Only membaca owner dari portal_public_owner.
- Admin login membaca data berdasarkan auth.uid().
- Tidak ada inline onclick; semua tombol dipasang dari app.js setelah DOM siap.
- Jika Supabase/RLS belum siap, portal menampilkan pesan setup, bukan diam-diam mengubah data menjadi nol.
