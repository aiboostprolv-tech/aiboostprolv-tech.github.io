# AiBoost Pro AI bots

Cloudflare Worker `aiboost-bot`. Cloudflare to izvieto no šīs mapes (Root directory: `_bot`).
Mājaslapā šī mape netiek publicēta.

Izvietošana: Cloudflare Workers Builds (Root directory `_bot`), automātiski pēc katra push uz main.

## Bezmaksas audits (src/audit.js)

1. Mājaslapas audita forma sūta pieteikumu uz `/lead` → tas nonāk rindā `audit:jobs` (KV).
2. Cron ik minūti pārbauda sākumlapu (kods, robots.txt, sitemap, llms.txt, Google PageSpeed),
   aprēķina vērtējumu kodā un ar Claude uzraksta kopsavilkumu, ieteikumus un e-pasta tekstus.
3. Telegram ziņa → `/admin/s/form/<id>`: skatīt atskaiti, apstiprināt, sūtīt (e-pasts vai WhatsApp).
4. Publiska atskaite tikai pēc apstiprināšanas: `/audits/<id>` (noindex).
5. Pēc nosūtīšanas Telegram atgādina 3. un 10. dienā; sekošanas teksti ir admin lapā.

Neobligāti Secrets: `PSI_KEY` (Google PageSpeed API atslēga, ja bez tās bieži 429), `AUDIT_MODEL`.
