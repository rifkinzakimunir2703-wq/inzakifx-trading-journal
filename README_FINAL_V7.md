# INZAKITRADE V7 — EA Live Account Manager

V7 menambahkan heartbeat + account snapshot dari EA MT5 ke portal.

## 1. Portal
Replace di GitHub Pages:
- index.html
- app.js
- style.css
- config.js jangan dihapus

## 2. Supabase
Jalankan `supabase_ea_upgrade.sql` di SQL Editor. SQL ini hanya menambah tabel `ea_account_snapshots` dan view public; tidak menghapus tabel trading lama.

## 3. Edge Function
Deploy `supabase-edge-function-trades.ts` sebagai function `ea-trades`.
Secret yang dibutuhkan:
- EA_WEBHOOK_KEY
- SUPABASE_URL (otomatis)
- SUPABASE_SERVICE_ROLE_KEY (otomatis)

## 4. EA MT5
Gunakan `InzakiTrade_EA_ML_WalkForward_V5_PortalAccount.mq5`.
Set:
- InpJournalEnabled = true
- InpJournalURL = https://PROJECT-REF.supabase.co/functions/v1/ea-trades
- InpJournalAPIKey = nilai EA_WEBHOOK_KEY
- InpEAPortalStatusEnabled = true
- InpEAPortalHeartbeatSec = 60

Tambahkan domain Supabase ke MT5:
Tools > Options > Expert Advisors > Allow WebRequest for listed URL
`https://PROJECT-REF.supabase.co`

## 5. Hasil
EA mengirim snapshot awal saat start lalu heartbeat setiap interval. Portal otomatis mendeteksi akun MT5 dari snapshot walaupun belum ada trade.

Akun menampilkan:
Balance, Equity, Today P/L, Floating P/L, Trades, Win Rate, Profit Factor, estimasi DD, ML probability, adaptive risk, ML samples, WF fold status, last update, online/offline.
