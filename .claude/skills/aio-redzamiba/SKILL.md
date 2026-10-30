---
name: aio-redzamiba
description: Uzlabo un pārbauda vietnes redzamību AI atbildēs (Google AI Overviews, ChatGPT, Gemini, Perplexity) — robots.txt, llms.txt, schema, atbilžu formāts, svaigums, ārējie signāli un mērīšana. Lieto aiboostpro.lv un klientu vietnēm.
---
# AIO redzamība (AI Overviews / GEO)

Princips: "Mēram 10 reizes, vienreiz nogriežam." Neviens fakts, cena vai skaitlis bez avota vietnē vai oriģinālā. Nekad nesoli "1. vietu" AI atbildēs.

## 1. Pārbaudi (bez maksas, repozitorijā)

1. **robots.txt** — atļauti GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended, Bingbot; ir `Sitemap:` rinda.
2. **llms.txt** — katrs `sitemap.xml` URL ir minēts (arī RU/EN versijas); cenas sakrīt ar lapām; ir piezīme par nosaukuma sajaukšanu, ja tāda vajadzīga; ir sadaļa katrā darba valodā.
3. **Entītija (schema)** — sākumlapā Organization/LocalBusiness ar `@id`, `sameAs` (tikai reāli profili), `founder`, `areaServed`, `knowsAbout`, `disambiguatingDescription`. Rakstu `publisher` norāda uz to pašu `@id`.
4. **Atbilde pirmajā rindkopā** — katrā pakalpojuma lapā pirmā rindkopa vienā teikumā atbild: kas, kam, cik maksā, cik ilgi. AI citē tieši tādus teikumus.
5. **FAQ** — redzams FAQ lapā + `FAQPage` schema ar tiem pašiem jautājumiem; jautājumi tādi, kā cilvēki raksta AI.
6. **Svaigums** — `dateModified` schema un redzams "Atjaunināts" datums lapās, kur saturs mainās.
7. **Valodas** — hreflang LV/RU/EN + x-default abos virzienos; RU lapas nav mašīntulkojums.
8. **Tehniskais** — derīgs JSON-LD, canonical, nav salauztu iekšējo saišu, katrai lapai vismaz viena iekšējā saite.

## 2. Uzlabo (repozitorijā)

- Labo tikai to, ko var pamatot ar vietnes saturu. Ja trūkst fakta (piem., profila URL), pajautā Kristīnei, nevis izdomā.
- Lielākas izmaiņas veic atsevišķā zarā un publicē (`main`) tikai pēc Kristīnes "publicē".
- Rūjienas projekta materiālus nemaini bez Kristīnes atļaujas.
- Pēc publicēšanas IndexNow ping notiek automātiski (GitHub Actions).

## 3. Ārējie signāli (Kristīnes darbi — sagatavo sarakstu un tekstus)

AI vairāk citē uzņēmumus, kurus min citi avoti:
- Google uzņēmuma profils: pakalpojumi ar cenām, foto, iknedēļas ziņa, atbildes uz katru atsauksmi.
- Atsauksmes Google (visiem klientiem vienādi, bez atlīdzības).
- Katalogi: firmas.lv, zl.lv, 1188.lv, Bing Places, Apple Business Connect, LinkedIn uzņēmuma lapa, Clutch tipa aģentūru katalogi.
- Pieminējumi: klientu vietņu kājenē "Izstrādāja AiBoost Pro" (ar klienta atļauju), raksti/intervijas nozares medijos.

## 4. Mēri

- **OpenRush `inspect_ai_visibility`** (domēns, valsts) — Google AI Overviews citējumu skaits. Paraugu dati, ne garantija.
- **OpenSEO AI visibility** — reāli jautājumi ChatGPT/Gemini/Google AI/Perplexity. Maksas: vispirms `estimate_ai_visibility_cost`, parādi cenu Kristīnei un palaid tikai pēc viņas apstiprinājuma.
- Manuāli: uzdod jautājumus ("AI čatbots Latvijā", "SEO aģentūra Rīgā", "чат-бот для сайта Латвия") un pieraksti, kurus avotus AI min.

## Atskaite

Latviski: kas pārbaudīts, kas salabots (fails + izmaiņa), kas jādara Kristīnei, mērījuma rezultāts ar datumu un ticamības piezīmi.
