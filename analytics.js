/* AiBoost Pro — analītika visās lapās (Google Analytics 4) + konversiju notikumi.
 * - GA ielādējas tikai pēc piekrišanas (localStorage "cookieConsent" = "accepted"),
 *   tā pati atslēga, ko lieto sākumlapas sīkdatņu josla.
 * - Lapās bez savas sīkdatņu joslas parāda nelielu joslu LV/RU/EN.
 * - Notikumi: generate_lead (formas), whatsapp_click, phone_click, email_click,
 *   gbp_click (Google profils), chat_open. GA4 tos var atzīmēt kā "Key events".
 */
(function () {
  "use strict";
  var GA_ID = "G-JV5RM26FHE";

  function getConsent() {
    try { return localStorage.getItem("cookieConsent"); } catch (e) { return null; }
  }
  function setConsent(v) {
    try { localStorage.setItem("cookieConsent", v); } catch (e) {}
  }

  function loadGA() {
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { anonymize_ip: true });
  }

  function track(name, params) {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params || {});
    }
  }

  /* ---------- Sīkdatņu josla lapām, kurām savas nav ---------- */
  var TEXT = {
    lv: { msg: "Šī vietne izmanto sīkdatnes. Nepieciešamās darbojas vienmēr; analītikas sīkdatnes tiek ieslēgtas tikai ar tavu piekrišanu.", more: "Uzzināt vairāk", yes: "Piekrītu", no: "Tikai nepieciešamās" },
    ru: { msg: "Этот сайт использует файлы cookie. Необходимые работают всегда; аналитические включаются только с вашего согласия.", more: "Узнать больше", yes: "Принять", no: "Только необходимые" },
    en: { msg: "This site uses cookies. Essential cookies always run; analytics cookies are enabled only with your consent.", more: "Learn more", yes: "Accept", no: "Essential only" }
  };

  function showBanner() {
    var lang = (document.documentElement.lang || "lv").slice(0, 2);
    var t = TEXT[lang] || TEXT.lv;
    var css = document.createElement("style");
    css.textContent =
      "#aib-consent{position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#17171c;border-top:1px solid rgba(0,229,160,.2);" +
      "padding:1rem 1.25rem;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem 1rem;" +
      "font:400 .8rem/1.5 'DM Sans',system-ui,sans-serif;color:#c9c9c4}" +
      "#aib-consent a{color:#00e5a0}" +
      "#aib-consent .aib-btns{display:flex;gap:.4rem;flex-wrap:wrap}" +
      "#aib-consent button{border-radius:100px;cursor:pointer;font:inherit;padding:.5rem 1.1rem}" +
      "#aib-consent .aib-yes{background:#00e5a0;color:#000;border:none;font-weight:700}" +
      "#aib-consent .aib-no{background:transparent;color:#c9c9c4;border:1px solid rgba(255,255,255,.15)}";
    document.head.appendChild(css);

    var bar = document.createElement("div");
    bar.id = "aib-consent";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Cookies");
    var p = document.createElement("div");
    p.textContent = t.msg + " ";
    var a = document.createElement("a");
    a.href = "/privacy.html";
    a.textContent = t.more;
    p.appendChild(a);
    var btns = document.createElement("div");
    btns.className = "aib-btns";
    var yes = document.createElement("button");
    yes.type = "button"; yes.className = "aib-yes"; yes.textContent = t.yes;
    var no = document.createElement("button");
    no.type = "button"; no.className = "aib-no"; no.textContent = t.no;
    btns.appendChild(yes); btns.appendChild(no);
    bar.appendChild(p); bar.appendChild(btns);
    document.body.appendChild(bar);

    yes.addEventListener("click", function () { setConsent("accepted"); bar.remove(); loadGA(); });
    no.addEventListener("click", function () { setConsent("declined"); bar.remove(); });
  }

  /* ---------- Konversiju notikumi ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("a,button") : null;
    if (!el) return;
    if (el.id === "chat-btn" || el.id === "chat-teaser-open") { track("chat_open", { page: location.pathname }); return; }
    var href = el.getAttribute("href") || "";
    var where = { page: location.pathname };
    if (/wa\.me\/|api\.whatsapp\.com/.test(href)) track("whatsapp_click", where);
    else if (href.indexOf("tel:") === 0) track("phone_click", where);
    else if (href.indexOf("mailto:") === 0) track("email_click", where);
    else if (/share\.google|g\.page|google\.[a-z.]+\/maps/.test(href)) track("gbp_click", where);
  }, true);

  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (!f || f.tagName !== "FORM") return;
    track("generate_lead", { form_id: f.id || "form", page: location.pathname });
  }, true);

  /* ---------- Starts ---------- */
  function init() {
    var c = getConsent();
    if (c === "accepted") { loadGA(); return; }
    if (c === "declined") return;
    // Sākumlapām ir sava josla (#cookie-banner) — tur neko nedublējam.
    if (!document.getElementById("cookie-banner")) showBanner();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
