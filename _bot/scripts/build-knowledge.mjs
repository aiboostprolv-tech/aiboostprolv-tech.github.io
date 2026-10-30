// Uzbūvē čatbota zināšanu bāzi no mājaslapas: llms.txt + visi FAQ jautājumi un atbildes
// no indeksējamajām LV lapām un rakstiem. Rezultāts: _bot/src/knowledge.js
// Palaiž: node _bot/scripts/build-knowledge.mjs (no repozitorija saknes)
// GitHub Action .github/workflows/bot-knowledge.yml to dara automātiski pēc lapu izmaiņām.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "_bot", "src", "knowledge.js");
const BASE = "https://aiboostpro.lv";

const pages = [
  ...readdirSync(ROOT).filter((f) => f.endsWith(".html")).map((f) => f),
  ...(existsSync(join(ROOT, "blog")) ? readdirSync(join(ROOT, "blog")).filter((f) => f.endsWith(".html")).map((f) => `blog/${f}`) : []),
].sort();

const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

const seen = new Set();
const sections = [];
for (const rel of pages) {
  const html = readFileSync(join(ROOT, rel), "utf8");
  if (/name="robots"[^>]*noindex/i.test(html)) continue;
  const title = decode((html.match(/<title>([^<]*)<\/title>/) || [, rel])[1]).replace(/\s*\|\s*AiBoost Pro$/, "").trim();
  const url = `${BASE}/${rel === "index.html" ? "" : rel.replace(/index\.html$/, "")}`;
  const qa = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const items = Array.isArray(data) ? data : (data["@graph"] || [data]);
    for (const it of items) {
      if (it["@type"] !== "FAQPage") continue;
      for (const q of it.mainEntity || []) {
        const qq = decode(String(q.name || "")).trim();
        const aa = decode(String(q.acceptedAnswer?.text || "")).replace(/\s+/g, " ").trim();
        const key = qq.toLowerCase();
        if (!qq || !aa || seen.has(key)) continue;
        seen.add(key);
        qa.push(`J: ${qq}\nA: ${aa}`);
      }
    }
  }
  if (qa.length) sections.push(`## ${title}\nLapa: ${url}\n${qa.join("\n")}`);
}

const llms = readFileSync(join(ROOT, "llms.txt"), "utf8").trim();
const knowledge = `# Mājaslapas saturs (llms.txt)\n${llms}\n\n# Jautājumi un atbildes no mājaslapas\n${sections.join("\n\n")}`;

const js = `// AUTOMĀTISKI ĢENERĒTS ar _bot/scripts/build-knowledge.mjs — nelabo ar roku.
// Avots: llms.txt un FAQ no aiboostpro.lv lapām (${pages.length} faili, ${seen.size} jautājumi).
export const KNOWLEDGE = ${JSON.stringify(knowledge)};
`;
const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
if (prev !== js) writeFileSync(OUT, js);
console.log(`${prev === js ? "bez izmaiņām" : "atjaunots"}: ${seen.size} jautājumi, ${knowledge.length} zīmes`);
