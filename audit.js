/* AiBoost Pro — tūlītējais mājaslapas audits (Google PageSpeed Insights API)
 * Darbojas statiskā lapā: pieprasījums iet tieši no apmeklētāja pārlūka uz Google.
 * PSI_KEY: Google Cloud API atslēga (PageSpeed Insights API), ierobežota uz aiboostpro.lv.
 * Bez atslēgas Google bieži atbild ar kļūdu 429 (pārsniegts limits) — tad tiek parādīts
 * paziņojums, ka pilno auditu atsūtīsim e-pastā.
 */
(function () {
  var PSI_KEY = ''; // <-- ielīmē Google API atslēgu šeit (skat. README)

  var form = document.getElementById('auditForm');
  if (!form) return;
  var status = document.getElementById('auditStatus');
  var LANG = (document.documentElement.lang || 'lv').slice(0, 2);
  if (['lv', 'ru', 'en'].indexOf(LANG) < 0) LANG = 'lv';

  var T = {
    lv: {
      running: 'Analizējam lapu ar Google PageSpeed… Tas aizņem 20–40 sekundes.',
      title: 'Pirmie rezultāti',
      mobile: 'Telefons', desktop: 'Dators',
      cats: { performance: 'Ātrums', accessibility: 'Pieejamība', 'best-practices': 'Labā prakse', seo: 'SEO' },
      metrics: 'Ielādes rādītāji (telefonā)',
      m: { 'first-contentful-paint': 'Pirmais saturs', 'largest-contentful-paint': 'Galvenais saturs (LCP)', 'total-blocking-time': 'Bloķēšanas laiks', 'cumulative-layout-shift': 'Izkārtojuma lēcieni (CLS)', 'speed-index': 'Ātruma indekss' },
      fix: 'Ko vērts uzlabot vispirms',
      seoOk: 'SEO pamatpārbaudes izietas',
      none: 'Būtisku problēmu nav atrasts — lieliski!',
      next: 'Pilno auditu ar redzamību AI meklētājos (ChatGPT, Gemini), Google profilu un konkrētu rīcības plānu atsūtīšu 2 darba dienu laikā.',
      wa: 'Apspriest WhatsApp',
      thanks: 'Paldies! Pieteikums saņemts.',
      fail: 'Automātisko pārbaudi šobrīd neizdevās pabeigt (Google ierobežojums vai lapa nav sasniedzama). Pieteikums ir saņemts — pilno auditu atsūtīšu 2 darba dienu laikā.',
      bad: 'Lūdzu, ievadi derīgu adresi, piem., jusulapa.lv',
      field: 'Reālo lietotāju dati (Chrome):', fast: 'ātra', avg: 'vidēja', slow: 'lēna',
      waText: 'Sveiki! Veicu auditu lapai '
    },
    ru: {
      running: 'Анализируем сайт с помощью Google PageSpeed… Это занимает 20–40 секунд.',
      title: 'Первые результаты',
      mobile: 'Телефон', desktop: 'Компьютер',
      cats: { performance: 'Скорость', accessibility: 'Доступность', 'best-practices': 'Практики', seo: 'SEO' },
      metrics: 'Показатели загрузки (телефон)',
      m: { 'first-contentful-paint': 'Первый контент', 'largest-contentful-paint': 'Основной контент (LCP)', 'total-blocking-time': 'Время блокировки', 'cumulative-layout-shift': 'Сдвиги макета (CLS)', 'speed-index': 'Индекс скорости' },
      fix: 'Что стоит улучшить в первую очередь',
      seoOk: 'Базовые проверки SEO пройдены',
      none: 'Существенных проблем не найдено — отлично!',
      next: 'Полный аудит с видимостью в AI-поиске (ChatGPT, Gemini), профилем Google и конкретным планом действий пришлю в течение 2 рабочих дней.',
      wa: 'Обсудить в WhatsApp',
      thanks: 'Спасибо! Заявка получена.',
      fail: 'Автоматическую проверку сейчас не удалось завершить (ограничение Google или сайт недоступен). Заявка получена — полный аудит пришлю в течение 2 рабочих дней.',
      bad: 'Пожалуйста, введите корректный адрес, например, vashsajt.lv',
      field: 'Данные реальных пользователей (Chrome):', fast: 'быстрая', avg: 'средняя', slow: 'медленная',
      waText: 'Здравствуйте! Сделал(а) аудит сайта '
    },
    en: {
      running: 'Analysing the site with Google PageSpeed… This takes 20–40 seconds.',
      title: 'First results',
      mobile: 'Mobile', desktop: 'Desktop',
      cats: { performance: 'Speed', accessibility: 'Accessibility', 'best-practices': 'Best practices', seo: 'SEO' },
      metrics: 'Loading metrics (mobile)',
      m: { 'first-contentful-paint': 'First content', 'largest-contentful-paint': 'Main content (LCP)', 'total-blocking-time': 'Blocking time', 'cumulative-layout-shift': 'Layout shift (CLS)', 'speed-index': 'Speed index' },
      fix: 'What to improve first',
      seoOk: 'SEO basic checks passed',
      none: 'No significant issues found — great!',
      next: 'The full audit with AI search visibility (ChatGPT, Gemini), Google Business Profile and a concrete action plan will reach you within 2 working days.',
      wa: 'Discuss on WhatsApp',
      thanks: 'Thank you! Request received.',
      fail: 'The automatic check could not be completed right now (Google limit or the site is unreachable). Your request is received — the full audit will reach you within 2 working days.',
      bad: 'Please enter a valid address, e.g. yoursite.com',
      field: 'Real-user data (Chrome):', fast: 'fast', avg: 'average', slow: 'slow',
      waText: 'Hello! I ran the audit for '
    }
  }[LANG];

  /* ---------- stils ---------- */
  var css = '' +
    '.aud-res{position:relative;z-index:5;margin-top:1.4rem;padding:1.4rem;border-radius:16px;background:rgba(14,14,18,0.96);border:1px solid rgba(0,229,160,0.25);}' +
    '.aud-res h3{font-family:"Syne",sans-serif;font-size:1.15rem;margin:0 0 0.2rem;}' +
    '.aud-url{color:var(--muted,#888);font-size:0.85rem;margin-bottom:1rem;word-break:break-all;}' +
    '.aud-dev{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted,#888);margin:0.8rem 0 0.5rem;}' +
    '.aud-rings{display:grid;grid-template-columns:repeat(4,1fr);gap:0.6rem;}' +
    '.aud-ring{text-align:center;font-size:0.78rem;color:rgba(245,243,238,0.8);}' +
    '.aud-ring svg{width:64px;height:64px;display:block;margin:0 auto 0.3rem;}' +
    '.aud-ring text{font:700 20px "DM Sans",sans-serif;}' +
    '.aud-m{display:grid;grid-template-columns:1fr auto;gap:0.35rem 1rem;font-size:0.88rem;margin-top:0.4rem;}' +
    '.aud-m span:nth-child(even){font-weight:700;text-align:right;}' +
    '.aud-list{list-style:none;padding:0;margin:0.4rem 0 0;display:flex;flex-direction:column;gap:0.45rem;font-size:0.9rem;}' +
    '.aud-list li{padding-left:1.4rem;position:relative;line-height:1.45;}' +
    '.aud-list li::before{content:"";position:absolute;left:0.2rem;top:0.45em;width:0.6rem;height:0.6rem;border-radius:50%;}' +
    '.aud-list li.r::before{background:#ff4e42;}.aud-list li.o::before{background:#ffa400;}.aud-list li.g::before{background:#0cce6b;}' +
    '.aud-list small{color:var(--muted,#888);}' +
    '.aud-next{margin-top:1.1rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.08);font-size:0.92rem;}' +
    '.aud-next a{display:inline-block;margin-top:0.7rem;}' +
    '.aud-bar{height:4px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;margin-top:0.8rem;}' +
    '.aud-bar i{display:block;height:100%;width:30%;background:var(--accent,#00e5a0);animation:audbar 1.4s ease-in-out infinite;}' +
    '@keyframes audbar{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}' +
    '@media(max-width:480px){.aud-rings{grid-template-columns:repeat(2,1fr);}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var box = document.createElement('div');
  box.className = 'aud-res'; box.hidden = true; box.setAttribute('aria-live', 'polite');
  form.parentNode.appendChild(box);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function color(score) { return score >= 0.9 ? '#0cce6b' : score >= 0.5 ? '#ffa400' : '#ff4e42'; }
  function cls(score) { return score >= 0.9 ? 'g' : score >= 0.5 ? 'o' : 'r'; }
  function ring(score, label) {
    var v = Math.round((score || 0) * 100), c = color(score || 0), r = 26, len = 2 * Math.PI * r;
    return '<div class="aud-ring"><svg viewBox="0 0 64 64" role="img" aria-label="' + esc(label) + ' ' + v + '">' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="6" stroke-linecap="round" ' +
      'stroke-dasharray="' + (len * v / 100).toFixed(1) + ' ' + len.toFixed(1) + '" transform="rotate(-90 32 32)"/>' +
      '<text x="32" y="39" text-anchor="middle" fill="' + c + '">' + v + '</text></svg>' + esc(label) + '</div>';
  }
  function normUrl(v) {
    v = (v || '').trim();
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { var u = new URL(v); if (u.hostname.indexOf('.') < 0) return ''; return u.href; } catch (e) { return ''; }
  }
  function psi(url, strategy) {
    var q = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=' + encodeURIComponent(url) +
      '&strategy=' + strategy + '&locale=' + LANG +
      '&category=performance&category=accessibility&category=best-practices&category=seo' +
      (PSI_KEY ? '&key=' + encodeURIComponent(PSI_KEY) : '');
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 90000);
    return fetch(q, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('psi ' + r.status);
      return r.json();
    });
  }
  function failing(lh, catId, max) {
    var cat = lh.categories[catId]; if (!cat) return [];
    var out = [];
    cat.auditRefs.forEach(function (ref) {
      if (ref.group === 'metrics' || ref.group === 'hidden') return;
      var a = lh.audits[ref.id];
      if (!a || a.score === null || a.score === undefined || a.score >= 0.9) return;
      if (a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'manual' || a.scoreDisplayMode === 'informative') return;
      var sav = (a.metricSavings && (a.metricSavings.LCP || 0) + (a.metricSavings.FCP || 0) + (a.metricSavings.TBT || 0)) || 0;
      out.push({ t: a.title, d: a.displayValue || '', s: a.score, w: (ref.weight || 0) * 1000 + sav });
    });
    out.sort(function (x, y) { return y.w - x.w || x.s - y.s; });
    return out.slice(0, max);
  }
  function render(url, mob, desk) {
    var h = '<h3>' + esc(T.title) + '</h3><div class="aud-url">' + esc(url) + '</div>';
    [[mob, T.mobile], [desk, T.desktop]].forEach(function (p) {
      if (!p[0]) return;
      var c = p[0].lighthouseResult.categories;
      h += '<div class="aud-dev">' + esc(p[1]) + '</div><div class="aud-rings">' +
        ['performance', 'accessibility', 'best-practices', 'seo'].map(function (k) { return c[k] ? ring(c[k].score, T.cats[k]) : ''; }).join('') + '</div>';
    });
    if (mob) {
      var lh = mob.lighthouseResult;
      h += '<div class="aud-dev">' + esc(T.metrics) + '</div><div class="aud-m">';
      ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].forEach(function (id) {
        var a = lh.audits[id]; if (!a) return;
        h += '<span>' + esc(T.m[id]) + '</span><span style="color:' + color(a.score || 0) + '">' + esc(a.displayValue) + '</span>';
      });
      h += '</div>';
      var le = mob.loadingExperience;
      if (le && le.overall_category && le.overall_category !== 'NONE') {
        var oc = { FAST: T.fast, AVERAGE: T.avg, SLOW: T.slow }[le.overall_category] || le.overall_category;
        h += '<p style="font-size:0.85rem;margin:0.6rem 0 0;color:rgba(245,243,238,0.75)">' + esc(T.field) + ' <b>' + esc(oc) + '</b></p>';
      }
      var issues = failing(lh, 'performance', 3).concat(failing(lh, 'seo', 3), failing(lh, 'accessibility', 2), failing(lh, 'best-practices', 1));
      h += '<div class="aud-dev">' + esc(T.fix) + '</div>';
      if (issues.length) {
        h += '<ul class="aud-list">' + issues.map(function (i) {
          return '<li class="' + cls(i.s) + '">' + esc(i.t) + (i.d ? ' <small>— ' + esc(i.d) + '</small>' : '') + '</li>';
        }).join('') + '</ul>';
      } else {
        h += '<ul class="aud-list"><li class="g">' + esc(T.none) + '</li></ul>';
      }
    }
    var wa = 'https://wa.me/37123231001?text=' + encodeURIComponent(T.waText + url);
    h += '<div class="aud-next">' + esc(T.next) + '<br><a class="btn-secondary" href="' + wa + '" target="_blank" rel="noopener">' + esc(T.wa) + '</a></div>';
    box.innerHTML = h;
  }

  /* aizstāj veco formas apstrādi */
  form.addEventListener('submit', function (e) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var fd = new FormData(form);
    var url = normUrl(fd.get('website'));
    if (!url) { status.style.color = '#ff6b6b'; status.textContent = T.bad; return; }

    // 1) pieteikums uzreiz nonāk e-pastā (Formspree)
    fetch(form.action, { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } }).catch(function () {});
    status.style.color = '#00e5a0'; status.textContent = T.thanks;

    // 2) tūlītējā pārbaude
    var btn = form.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
    box.hidden = false;
    box.innerHTML = '<p style="margin:0">' + esc(T.running) + '</p><div class="aud-bar"><i></i></div>';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    var mob = null, desk = null;
    Promise.all([
      psi(url, 'mobile').then(function (j) { mob = j; }).catch(function () {}),
      psi(url, 'desktop').then(function (j) { desk = j; }).catch(function () {})
    ]).then(function () {
      if (btn) btn.disabled = false;
      if (!mob && !desk) { box.innerHTML = '<p style="margin:0">' + esc(T.fail) + '</p>'; return; }
      try { render(url, mob, desk); } catch (err) { box.innerHTML = '<p style="margin:0">' + esc(T.fail) + '</p>'; }
      if (window.gtag) try { gtag('event', 'instant_audit', { site: url }); } catch (e2) {}
    });
  }, true);
})();
