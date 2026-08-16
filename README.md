# INZAKI Trading Journal V2

Static GitHub Pages + Supabase.

Files:
- index.html
- app.js
- style.css
- config.js

Before deploying, replace the placeholder in config.js with your Supabase Publishable Key.

The database SQL should be run in Supabase SQL Editor.

## Prop Firm Mode
1. Run `propfirm_migration.sql` once in Supabase SQL Editor.
2. Upload/replace `index.html`, `app.js`, `style.css`, and `config.js` in GitHub.
3. Open the website and tap `🎯 Prop Firm Mode`.
4. Configure account size, target, max drawdown, daily loss, consistency, and buffer.

The calculator is a tracking aid; always verify the exact rules of your prop firm.
