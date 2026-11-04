# Claude Code skills šim repozitorijam

Šīs mapes netiek publicētas aiboostpro.lv (GitHub Pages neizliek mapes, kas sākas ar punktu).

| Skill | Avots | Licence | Pārbaudīts |
|---|---|---|---|
| aio-redzamiba | AiBoost Pro | — | 2026-10-30 |
| ffmpeg-skill | github.com/kajisho5/ffmpeg-skill | MIT | 2026-11-04: kods pārskatīts, tests (probe, 16:9 → 9:16) izdevās |
| hyperframes, hyperframes-cli, hyperframes-registry, media-use | github.com/heygen-com/hyperframes (skills/) | Apache-2.0 | 2026-11-04: kods pārskatīts |
| taste-skill (design-taste-frontend) | github.com/leonxlnx/taste-skill | MIT | 2026-11-04: kods pārskatīts; draw un inspect pārbaudīti. Attēlus ņem tikai ar atvērtām licencēm (Openverse, Wikimedia, muzeji) ar autoru norādēm |
| edit, clips, script, setup | github.com/vincentventalon/claude-code-video-editing-skill (skills/short-video) | MIT, fonti OFL | 2026-11-04: kods pārskatīts, tests (klusumu griešana) izdevās |

Bezmaksas aizstājēji: edit = Ghost Editor (strādā uz Linux/Windows/Mac, whisper.cpp bez maksas), clips = Claude Shorts (bez GPU), HyperFrames + ffmpeg-skill = OpenMontage.
Nav pievienoti no vincentventalon: publish (publicē AiBoost Pro Metricool), audit un outliers (lasa TikTok kontus bez pieteikšanās).
Piezīme: edit virsrakstu fonts Anton neatbalsta dažus krievu burtus (ё ж щ Ы) — krievu virsrakstiem lieto Inter.

Neinstalēti (2026-11-04): ghost-editor (tikai Mac ar Apple silicon), claude-shorts (gariem video, vajag GPU),
OpenMontage (AGPL, 30+ maksas API, funkcija "svešs rīls → tavs" rada autortiesību risku).

Atjaunināt: lejupielādē jaunu versiju, pārskati izmaiņas un tikai tad nomaini mapi.
Maksas pakalpojumi (HeyGen avatāri, ElevenLabs, Gemini) strādā tikai ar atslēgām, kas jāieliek pašam.

Mākoņa sesijā (root lietotājs) taste-skill pārlūkam vajag `--no-sandbox`: CHROME_PATH norāda uz īsu skriptu,
kas palaiž `/opt/pw-browsers/chromium-*/chrome-linux64/chrome --no-sandbox "$@"`.
Playwright jau ir mākoņa vidē — atsevišķi nav jāpieslēdz. React Bits nav pieslēgts: tie ir React komponenti,
bet aiboostpro.lv un rujienasseniorumaja.lv ir statisks HTML bez React (licence MIT + Commons Clause).
