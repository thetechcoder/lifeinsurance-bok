(() => {
'use strict';
const app = document.getElementById('app');
const LS = {
  get(k, d) { try { const v = localStorage.getItem('lin:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lin:' + k, JSON.stringify(v)); } catch (e) {} }
};
const cache = {};
async function J(p) {
  if (cache[p]) return cache[p];
  const r = await fetch(p);
  if (!r.ok) throw new Error('Could not load ' + p);
  return (cache[p] = await r.json());
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LEVEL = { foundation: 'Foundation', diploma: 'Diploma', associateship: 'Associateship' };
let INDEX = null, SES = null, deferredInstall = null;

/* ---------- block rendering ---------- */
function rlist(items, ordered) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>` + items.map(i => `<li${i.l ? ` style="margin-left:${i.l * 1.2}em"` : ''}>${i.h}</li>`).join('') + `</${tag}>`;
}
function rtable(b) {
  const rows = b.rows.map((r, ri) => {
    const head = b.header && ri === 0;
    return '<tr>' + r.map(c => head ? `<th scope="col">${c}</th>` : `<td>${c}</td>`).join('') + '</tr>';
  }).join('');
  return `<div class="tw"><table>${rows}</table></div>`;
}
function rb(blocks, docMode) {
  return blocks.map(b => {
    switch (b.t) {
      case 'h1': return docMode ? `<h1>${esc(b.text)}</h1>` : '';
      case 'h2': return `<h2 id="${b.id}">${esc(b.text)}</h2>`;
      case 'h3': return `<h3 id="${b.id}">${esc(b.text)}</h3>`;
      case 'p': return `<p${b.b ? ' class="b"' : ''}>${b.h}</p>`;
      case 'list': return rlist(b.items, b.ordered);
      case 'table': return rtable(b);
      case 'box': if (b.kind === 'process') { const f = flowHtml(b); if (f) return f; }
        return `<aside class="box k-${b.kind}">${b.title ? `<div class="bt">${esc(b.title)}</div>` : ''}<div class="bd">${rb(b.blocks, docMode)}</div></aside>`;
      default: return '';
    }
  }).join('');
}

/* ---------- helpers ---------- */
function chInfo(n) {
  for (const p of INDEX.toc) for (const c of p.chapters) if (c.n === n) return { ...c, part: p };
  return null;
}
function allChapters() { return INDEX.toc.flatMap(p => p.chapters); }
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
}
function setTab(name) {
  document.querySelectorAll('nav.tabs a').forEach(a => {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
function plain(h) { return String(h || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function setFS(v) {
  v = Math.max(0.85, Math.min(1.6, v)); LS.set('fs', v);
  document.documentElement.style.setProperty('--fs', v);
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pct(a, b) { return b ? Math.round(a * 100 / b) : 0; }

/* ---------- theme ---------- */
function applyTheme(t) {
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#0A1426' : '#14305E';
}
const THEME_NAME = { auto: 'matches your device', light: 'light', dark: 'dark' };
function cycleTheme() {
  const order = ['auto', 'light', 'dark'], cur = LS.get('theme', 'auto');
  const nx = order[(order.indexOf(cur) + 1) % 3]; LS.set('theme', nx); applyTheme(nx);
  toast('Theme: ' + THEME_NAME[nx]);
}
const THEME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/></svg>';
function themeBtn(cls) { return `<button class="ibtn ${cls || ''}" data-theme-btn aria-label="Change theme: light, dark or match device">${THEME_ICON}</button>`; }
function wireTheme() { document.querySelectorAll('[data-theme-btn]').forEach(b => b.onclick = cycleTheme); }

/* ---------- animated step flows ---------- */
const ACR = new Set(['NAICOM', 'NIIRA', 'ADR', 'NDPA', 'NDPC', 'CIIN', 'FNOL', 'PAS', 'SIU', 'TCF', 'CBN', 'NIA', 'PRA', 'PENCOM', 'CPS', 'RSA', 'RLA', 'SLA', 'KYC', 'AML', 'CFT', 'NIN', 'BVN', 'RPA', 'IFRS', 'ORSA', 'KPI', 'MI']);
function sentenceCase(t) {
  t = t.trim(); if (!/[A-Z]/.test(t) || t !== t.toUpperCase()) return t;
  return t.toLowerCase().split(' ').map((w, i) => { const u = w.replace(/[^a-z]/g, '').toUpperCase(); return ACR.has(u) ? w.toUpperCase() : (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w); }).join(' ');
}
function fixStrong(h) {
  const o = (h.match(/<strong>/g) || []).length, c = (h.match(/<\/strong>/g) || []).length;
  return c > o ? h.replace('</strong>', '') : h;
}
const STEP_RX = /^(?:<strong>\s*)?(Stage|Step|Tier|Gate|Phase)\s*(\d+)\s*[\u2014\u2013:\-.]*\s*([^.:<]{2,90}?)\s*[.:]\s*(?:<\/strong>)?\s*([\s\S]*)$/i;
let LOOSE = false;
function stepOf(h) {
  const t = String(h).trim(), m = t.match(STEP_RX);
  if (m) return { n: +m[2], title: sentenceCase(m[3]), body: fixStrong(m[4]) };
  if (LOOSE) { const l = t.match(/^(?:<strong>\s*)?([^:.<]{3,48}?):\s*(?:<\/strong>)?\s*([\s\S]+)$/); if (l) return { n: 0, title: sentenceCase(l[1]), body: fixStrong(l[2]) }; }
  return null;
}
function flowHtml(b) {
  LOOSE = false;
  const hasStrict = b.blocks.some(x => (x.t === 'p' && stepOf(x.h)) || (x.t === 'list' && x.items.length && x.items.every(it => stepOf(it.h))));
  LOOSE = !hasStrict && !/document|checklist/i.test(b.title);
  try { return flowBuild(b); } finally { LOOSE = false; }
}
function flowBuild(b) {
  const steps = [], intro = [], outro = []; let last = -1;
  b.blocks.forEach((x, i) => {
    if (x.t === 'p' && !LOOSE && stepOf(x.h)) last = i;
    if (x.t === 'list' && x.items.length && x.items.every(it => stepOf(it.h))) last = i;
  });
  b.blocks.forEach((x, i) => {
    if (x.t === 'p') {
      const st = LOOSE ? null : stepOf(x.h);
      if (st) steps.push({ ...st, extra: '' });
      else if (i > last) outro.push(rb([x]));
      else if (steps.length) steps[steps.length - 1].extra += rb([x]);
      else intro.push(rb([x]));
    } else if (x.t === 'list' && x.items.length && x.items.every(it => stepOf(it.h))) {
      x.items.forEach(it => steps.push({ ...stepOf(it.h), extra: '' }));
    } else if (i > last) outro.push(rb([x]));
    else if (steps.length) steps[steps.length - 1].extra += rb([x]);
    else intro.push(rb([x]));
  });
  if (steps.length < 3) return null;
  const title = b.title.replace(/^Process\s*[:\u2014\u2013-]\s*/i, '');
  const route = steps.map((s, i) => `<span style="--i:${i}">${esc(s.title)}</span>${i < steps.length - 1 ? `<i style="--i:${i}" aria-hidden="true">›</i>` : ''}`).join('');
  const lis = steps.map((s, i) => `<li class="st" style="--i:${i}"><span class="dot" aria-hidden="true">${i + 1}</span><h4>${esc(s.title)}</h4><div class="sb"><p>${s.body}</p>${s.extra}</div></li>`).join('');
  return `<section class="flow" style="--n:${steps.length}" aria-label="${esc(title)}"><div class="ft">${esc(title)}</div>${intro.join('')}<div class="route" aria-hidden="true">${route}</div><ol class="steps">${lis}</ol>${outro.join('')}</section>`;
}
function initAnim() {
  const fl = [...document.querySelectorAll('.flow:not(.in)')]; if (!fl.length) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { fl.forEach(f => f.classList.add('in')); return; }
  document.documentElement.classList.add('anim');
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  fl.forEach(f => io.observe(f));
}

/* ---------- progress helpers ---------- */
function progressStats() {
  const read = new Set(LS.get('read', [])), R = LS.get('res', {}), S = LS.get('self', {}), scr = LS.get('scr', {});
  const chs = allChapters(), readable = chs.filter(c => c.text);
  const att = {}; for (const k of [...Object.keys(R), ...Object.keys(S)]) { const n = +k.slice(1, k.indexOf('-')); att[n] = (att[n] || 0) + 1; }
  const totalQ = chs.reduce((a, c) => a + c.q, 0), attempted = Object.keys(R).length + Object.keys(S).length;
  const mcq = Object.keys(R), mcqOk = mcq.filter(k => R[k].ok).length;
  return { read, R, S, scr, chs, readable, att, totalQ, attempted, mcq, mcqOk, readN: readable.filter(c => read.has(c.n)).length };
}
function resetSheet(after) {
  const s = sheet('Reset progress', `<p>Your progress is stored on this device only. Choose what to clear.</p>
    <div class="opt-r"><button class="btn ghost" data-k="read">Reading progress</button><button class="btn ghost" data-k="prac">Practice results</button><button class="btn" data-k="all">Everything</button><button class="btn ghost" data-k="x">Cancel</button></div>`);
  const dlg = s.querySelector('[role=dialog]');
  const KEYS = { read: ['read', 'last', 'scr'], prac: ['res', 'self', 'cards', 'mocks', 'mocklast', 'mockrun'], all: ['read', 'last', 'scr', 'res', 'self', 'cards', 'mocks', 'mocklast', 'mockrun', 'plan'] };
  const WHAT = { read: 'reading progress (chapters marked as read and where you stopped)', prac: 'all practice results, mock exam history, flashcard marks and self-ratings', all: 'all reading progress and all practice results' };
  s.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k; if (k === 'x') return s.remove();
    dlg.innerHTML = `<h3>Reset ${k === 'all' ? 'everything' : k === 'read' ? 'reading progress' : 'practice results'}?</h3><p>This clears ${WHAT[k]} on this device. It cannot be undone.</p>
      <div class="opt-r"><button class="btn danger" id="yes">Yes, reset</button><button class="btn ghost" id="no">Keep my progress</button></div>`;
    dlg.querySelector('#no').onclick = () => s.remove();
    dlg.querySelector('#yes').onclick = () => { KEYS[k].forEach(x => { try { localStorage.removeItem('lin:' + x); } catch (e) {} }); s.remove(); toast('Progress reset'); after && after(); };
    dlg.querySelector('#yes').focus();
  });
}

/* ---------- contents ---------- */
function ringHtml(p) {
  const c = 2 * Math.PI * 37;
  return `<div class="ring" id="ring" style="--p:0;--c:${c.toFixed(1)}" role="img" aria-label="${Math.round(p * 100)} percent of chapters read"><svg viewBox="0 0 92 92" aria-hidden="true"><circle class="tk" cx="46" cy="46" r="37"/><circle class="fg" cx="46" cy="46" r="37"/></svg><div class="pc"><div>${Math.round(p * 100)}%<small>read</small></div></div></div>`;
}
function viewLibrary() {
  setTab('library'); window.onscroll = null;
  const P = progressStats(), last = LS.get('last', null);
  const SHORT = { front: 'Front matter', app1: 'Appendix 1: Reference tables', app2: 'Appendix 2: Specimen documents', app3: 'Appendix 3: Regulatory log' };
  let h = `<header class="cover"><h1>Life Insurance<b>BOK</b></h1><p>Life Insurance in Nigeria: a professional body of knowledge and CIIN study aid · MTDL Limited</p>${themeBtn('tg')}</header>`;
  const ratio = P.readable.length ? P.readN / P.readable.length : 0;
  h += `<section class="dash" aria-label="Your progress">${ringHtml(ratio)}<div class="nums">
    <div class="ln"><b>${P.readN} of ${P.readable.length}</b> chapters read<div class="meter"><i style="--w:${pct(P.readN, P.readable.length)}%"></i></div></div>
    <div class="ln"><b>${P.attempted} of ${P.totalQ}</b> practice questions attempted<div class="meter"><i style="--w:${pct(P.attempted, P.totalQ)}%"></i></div></div>
    ${P.mcq.length ? `<div class="ln">Multiple-choice accuracy <b>${pct(P.mcqOk, P.mcq.length)}%</b></div>` : ''}</div>
    <div class="acts"><a class="btn sm" href="#/practice">Practise</a><a class="btn sm ghost" href="#/progress">Full progress</a><button class="btn sm ghost" id="reset">Reset progress</button></div></section>`;
  if (!P.readN && !P.attempted) h += `<p class="muted" style="font-size:.86rem;margin:10px 2px 0">Tap the circle at the right of a chapter to mark it as read. Your progress stays on this device and is waiting here when you return.</p>`;
  if (last && chInfo(last.ch) && chInfo(last.ch).text) {
    const c = chInfo(last.ch);
    h += `<a class="resume" href="#/ch/${c.n}?resume=1"><b>Continue reading</b><span>Chapter ${c.n}: ${esc(c.title)}${last.f ? ' · ' + Math.round(last.f * 100) + '% through' : ''}</span></a>`;
  }
  h += `<div class="row-links">`;
  for (const d of INDEX.docs) h += `<a class="chip" href="#/doc/${d.key}">${esc(SHORT[d.key] || d.title)}</a>`;
  if (deferredInstall) h += `<button class="chip" id="inst">Install app</button>`;
  h += `</div>`;
  for (const p of INDEX.toc) {
    const rd = p.chapters.filter(c => c.text), dn = rd.filter(c => P.read.has(c.n)).length;
    h += `<section class="part"><div class="ph"><h2>${esc(p.label)}: ${esc(p.title)}</h2><span class="pm">${dn}/${rd.length} read</span></div><div class="lvl">${esc(p.level)}</div><div class="meter"><i style="--w:${pct(dn, rd.length)}%"></i></div><ul class="chl">`;
    for (const c of p.chapters) {
      const isRead = P.read.has(c.n), f = P.scr[c.n] || 0;
      const meta = c.q ? `${P.att[c.n] || 0}/${c.q} Q` : '';
      h += `<li><a class="row" href="#/ch/${c.n}"><span class="n">${c.n}</span><span class="t">${esc(c.title || 'Chapter ' + c.n)}</span><span class="m">${esc(meta)}</span></a><button class="rd" data-n="${c.n}" aria-pressed="${isRead}" aria-label="Chapter ${c.n} read"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></button>${!isRead && f > 0.02 && f < 0.97 ? `<i class="sp" style="--w:${Math.round(f * 100)}%"></i>` : ''}</li>`;
    }
    h += `</ul></section>`;
  }
  h += `<div class="foot"><span>${P.chs.length} chapters · ${P.totalQ} practice questions · works offline</span><button class="btn sm ghost" id="pinbtn">App PIN: ${pinOn() ? 'On' : 'Off'}</button></div>`;
  app.innerHTML = h; wireTheme();
  requestAnimationFrame(() => requestAnimationFrame(() => { const r = document.getElementById('ring'); if (r) r.style.setProperty('--p', ratio); }));
  document.getElementById('reset').onclick = () => resetSheet(viewLibrary);
  document.getElementById('pinbtn').onclick = () => pinSheet(viewLibrary);
  document.querySelectorAll('.rd').forEach(b => b.onclick = () => {
    const n = +b.dataset.n, r = new Set(LS.get('read', []));
    if (r.has(n)) r.delete(n); else r.add(n);
    LS.set('read', [...r]); const y = scrollY; viewLibrary(); scrollTo(0, y);
  });
  const ib = document.getElementById('inst');
  if (ib) ib.onclick = async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; ib.remove(); };
}

/* ---------- reader ---------- */
function sheet(title, html) {
  const s = document.createElement('div');
  s.className = 'sheet'; s.innerHTML = `<div role="dialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${html}</div>`;
  s.addEventListener('click', e => { if (e.target === s) s.remove(); });
  document.body.appendChild(s); return s;
}
function toolbar(title, blocks, backHref) {
  return `<div class="bar"><a class="ibtn" href="${backHref}" aria-label="Back to contents" style="display:grid;place-items:center;text-decoration:none">←</a><div class="ttl">${esc(title)}</div>
    ${themeBtn()}<button class="ibtn" id="toc" aria-label="Sections in this chapter">☰</button><button class="ibtn" id="fsm" aria-label="Smaller text">A−</button><button class="ibtn" id="fsp" aria-label="Larger text">A+</button></div>`;
}
function wireToolbar(blocks, base) {
  wireTheme();
  const fs = () => LS.get('fs', 1);
  document.getElementById('fsm').onclick = () => setFS(fs() - 0.1);
  document.getElementById('fsp').onclick = () => setFS(fs() + 0.1);
  document.getElementById('toc').onclick = () => {
    const items = blocks.filter(b => b.t === 'h2' || b.t === 'h3');
    const s = sheet('Contents', items.map(b => `<a class="${b.t === 'h3' ? 'l3' : ''}" href="#" data-id="${b.id}">${esc(b.text)}</a>`).join('') || '<p class="muted">No sections.</p>');
    s.querySelectorAll('a').forEach(a => a.onclick = e => {
      e.preventDefault(); s.remove();
      const el = document.getElementById(a.dataset.id); if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  };
}
let scrollT = null;
function trackScroll(ch) {
  window.onscroll = () => {
    clearTimeout(scrollT);
    scrollT = setTimeout(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max > 0) { const f = Math.min(1, scrollY / max); LS.set('last', { ch, f }); const sc = LS.get('scr', {}); if (f > (sc[ch] || 0)) { sc[ch] = f; LS.set('scr', sc); } }
    }, 400);
  };
}
async function viewChapter(n, sid, resume) {
  setTab('library');
  const c = chInfo(n);
  if (!c) return notFound();
  const nav = (m) => { const o = chInfo(m); return o ? `<a href="#/ch/${m}">${m < n ? '← ' : ''}Chapter ${m}: ${esc(o.title)}${m > n ? ' →' : ''}</a>` : '<span></span>'; };
  let h = '';
  if (!c.text) {
    h = `<header class="top"><h1>Chapter ${n}: ${esc(c.title)}</h1><p>${esc(c.part.label)} · ${esc(c.part.title)}</p></header>
      <div class="placeholder">The reading text for this chapter is not in this build yet. Its ${c.q} practice questions with model answers are available.</div>
      <div class="endrow"><a class="btn" href="#/practice/ch/${n}">Practise Chapter ${n}</a><a class="btn ghost" href="#/">Back to contents</a></div>
      <div class="pn">${nav(n - 1)}${nav(n + 1)}</div>`;
    app.innerHTML = h; window.onscroll = null; scrollTo(0, 0); return;
  }
  const d = await J('data/ch/' + n + '.json');
  const read = new Set(LS.get('read', []));
  h = toolbar('Chapter ' + n + ': ' + c.title, d.blocks, '#/') +
    `<article class="read"><div class="kick">${esc(c.part.label)} · ${esc(c.part.title)}</div><h1>Chapter ${n}: ${esc(c.title)}</h1>${rb(d.blocks)}
    <div class="endrow"><button class="btn${read.has(n) ? ' ghost' : ''}" id="mark">${read.has(n) ? 'Marked as read ✓' : 'Mark chapter as read'}</button>${c.q ? `<a class="btn ghost" href="#/practice/ch/${n}">Practise ${c.q} questions</a>` : ''}</div>
    <div class="pn">${nav(n - 1)}${nav(n + 1)}</div></article>`;
  app.innerHTML = h;
  wireToolbar(d.blocks); initAnim();
  document.getElementById('mark').onclick = e => {
    const r = new Set(LS.get('read', []));
    if (r.has(n)) r.delete(n); else r.add(n);
    LS.set('read', [...r]);
    e.target.className = 'btn' + (r.has(n) ? ' ghost' : ''); e.target.textContent = r.has(n) ? 'Marked as read ✓' : 'Mark chapter as read';
  };
  trackScroll(n);
  if (sid && document.getElementById(sid)) document.getElementById(sid).scrollIntoView();
  else if (resume) { const l = LS.get('last', null); if (l && l.ch === n) requestAnimationFrame(() => scrollTo(0, l.f * (document.documentElement.scrollHeight - innerHeight))); else scrollTo(0, 0); }
  else scrollTo(0, 0);
}
async function viewDoc(key, sid) {
  setTab('library');
  const meta = INDEX.docs.find(d => d.key === key);
  if (!meta) return notFound();
  const d = await J('data/' + key + '.json');
  app.innerHTML = toolbar(meta.title, d.blocks, '#/') + `<article class="read">${rb(d.blocks, true)}<div class="endrow"><a class="btn ghost" href="#/">Back to contents</a></div></article>`;
  wireToolbar(d.blocks); initAnim(); window.onscroll = null;
  if (sid && document.getElementById(sid)) document.getElementById(sid).scrollIntoView(); else scrollTo(0, 0);
}
function notFound() { setTab('library'); app.innerHTML = `<header class="top"><h1>Page not found</h1><p><a href="#/">Go to the contents</a></p></header>`; }

/* ---------- practice ---------- */
function viewPracticeSetup(pre) {
  setTab('practice'); window.onscroll = null;
  const st = Object.assign({ scope: 'all', levels: ['foundation', 'diploma', 'associateship'], filter: 'all', count: '20' }, LS.get('setup', {}));
  if (pre) st.scope = pre;
  const res = LS.get('res', {}), self = LS.get('self', {});
  const nAns = Object.keys(res).length + Object.keys(self).length;
  let sel = `<option value="all">All chapters (${allChapters().reduce((a, c) => a + c.q, 0)} questions)</option>`;
  for (const p of INDEX.toc) {
    const withQ = p.chapters.filter(c => c.q);
    if (!withQ.length) continue;
    sel += `<optgroup label="${esc(p.label)}: ${esc(p.title)}"><option value="p:${p.part}"${st.scope === 'p:' + p.part ? ' selected' : ''}>Whole ${esc(p.label.toLowerCase())}</option>`;
    for (const c of withQ) sel += `<option value="c:${c.n}"${st.scope === 'c:' + c.n ? ' selected' : ''}>Chapter ${c.n}: ${esc(c.title)} (${c.q})</option>`;
    sel += `</optgroup>`;
  }
  app.innerHTML = `<header class="top"><h1>Practice</h1><p>Questions from the CIIN practice sets, with worked answers.</p></header>
  <div class="card"><div class="fld"><label for="scope">What to practise</label><select id="scope">${sel}</select></div>
  <div class="fld"><label>Levels</label><div class="chips" id="lv">${Object.keys(LEVEL).map(k => `<button class="chip" data-k="${k}" aria-pressed="${st.levels.includes(k)}">${LEVEL[k]}</button>`).join('')}</div></div>
  <div class="fld"><label for="flt">Which questions</label><select id="flt"><option value="all">All</option><option value="new">Not yet attempted</option><option value="missed">Missed or marked for review</option></select></div>
  <div class="fld"><label for="cnt">Session length</label><select id="cnt"><option>10</option><option>20</option><option>40</option><option value="all">Everything that matches</option></select></div>
  <div class="actions"><button class="btn" id="go">Start practice</button></div><p class="muted" id="msg" role="status"></p></div>
  <div class="tiles"><a class="tile" href="#/mock"><b>Mock exam</b><span>A timed paper at your level, marked at the end.</span></a><a class="tile" href="#/cards"><b>Flashcards</b><span>Glossary terms to recall and review.</span></a></div>
  <p class="muted">Multiple-choice answers show why each option is right or wrong. Diploma and Associateship questions reveal a model answer, then you rate how well you covered it.</p>`;
  document.getElementById('scope').value = st.scope;
  document.getElementById('flt').value = st.filter; document.getElementById('cnt').value = st.count;
  document.querySelectorAll('#lv .chip').forEach(b => b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
  document.getElementById('go').onclick = async () => {
    const levels = [...document.querySelectorAll('#lv .chip')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.k);
    const cfg = { scope: document.getElementById('scope').value, levels, filter: document.getElementById('flt').value, count: document.getElementById('cnt').value };
    LS.set('setup', cfg);
    const msg = document.getElementById('msg');
    if (!levels.length) { msg.textContent = 'Choose at least one level.'; return; }
    msg.textContent = 'Loading questions…';
    let chs = allChapters().filter(c => c.q);
    if (cfg.scope.startsWith('p:')) chs = chs.filter(c => chInfo(c.n).part.part === +cfg.scope.slice(2));
    if (cfg.scope.startsWith('c:')) chs = chs.filter(c => c.n === +cfg.scope.slice(2));
    let items = [];
    try { for (const c of chs) { const d = await J('data/q/' + c.n + '.json'); d.questions.forEach(q => items.push({ ch: c.n, q })); } }
    catch (e) { msg.textContent = 'Could not load the questions. Open the app once while online to save them.'; return; }
    items = items.filter(x => levels.includes(x.q.level));
    const R = LS.get('res', {}), S = LS.get('self', {});
    if (cfg.filter === 'new') items = items.filter(x => !(x.q.id in R) && !(x.q.id in S));
    if (cfg.filter === 'missed') items = items.filter(x => (R[x.q.id] && !R[x.q.id].ok) || S[x.q.id] === 'review');
    if (!items.length) { msg.textContent = 'No questions match those choices. Try a wider selection.'; return; }
    items = cfg.scope === 'all' || cfg.count !== 'all' ? shuffle(items) : items;
    if (cfg.count !== 'all') items = items.slice(0, +cfg.count);
    startSession(items);
  };
}
function startSession(items, single) {
  SES = { items, i: 0, log: [], single: !!single };
  if (single) history.replaceState(null, '', location.pathname + location.search + '#/practice/run'); else location.hash = '#/practice/run';
  renderSession();
}
function blocksSimple(blocks) { return rb(blocks); }
function renderSession() {
  setTab('practice'); window.onscroll = null;
  if (!SES) return viewPracticeSetup();
  if (SES.i >= SES.items.length) return renderSummary();
  const { ch, q } = SES.items[SES.i];
  const c = chInfo(ch);
  const lab = `Chapter ${ch} · ${LEVEL[q.level]}${q.marks ? ' · ' + q.marks + ' marks' : ''}${q.type === 'essay' ? ' · Essay' : ''}`;
  let h = `<div class="bar"><button class="ibtn" id="quit" aria-label="End session">✕</button><div class="ttl">${esc(c.title)}</div></div>
  <div class="qhead"><span>Question ${SES.i + 1} of ${SES.items.length}</span><span>${SES.log.filter(x => x).length ? SES.log.filter(x => x === 'ok').length + ' correct' : ''}</span></div>
  <div class="prog"><i style="width:${pct(SES.i, SES.items.length)}%"></i></div>`;
  h += `<div class="qbox"><div class="lab">${esc(lab)}</div><div class="stem">${esc(q.stem)}</div></div>`;
  if (q.flaw) h += `<div class="flaw"><b>Flagged in the source.</b> The answer bank notes a problem with this question${q.note ? ': ' + esc(q.note) : ''}. Its closest option is (${esc(q.correct)}).</div>`;
  if (q.type === 'mcq') {
    h += `<div class="opts" id="opts">${q.opts.map(o => `<button class="opt" data-k="${o.k}"><b>${o.k}</b><span>${esc(o.x)}</span></button>`).join('')}</div><div id="after"></div>`;
  } else {
    h += `<div class="actions"><button class="btn" id="reveal">Show model answer</button></div><div id="after"></div>`;
  }
  app.innerHTML = h; scrollTo(0, 0);
  document.getElementById('quit').onclick = () => { if (confirm('End this session? Your answers so far are saved.')) { SES.i = SES.items.length; renderSession(); } };
  const next = () => { SES.i++; renderSession(); };
  const nextBtn = () => `<div class="actions"><button class="btn" id="next">${SES.i + 1 >= SES.items.length ? 'See results' : 'Next question'}</button></div>`;
  if (q.type === 'mcq') {
    document.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      const k = btn.dataset.k, ok = k === q.correct;
      document.querySelectorAll('.opt').forEach(b => { b.disabled = true; if (b.dataset.k === q.correct) b.classList.add('ok'); else if (b.dataset.k === k) b.classList.add('no'); });
      const R = LS.get('res', {}); R[q.id] = { ok, t: Date.now() }; LS.set('res', R);
      SES.log[SES.i] = ok ? 'ok' : 'bad';
      document.getElementById('after').innerHTML = `<div class="ans${ok ? '' : ' wrong'}"><div class="lab">${ok ? 'Correct' : 'Not quite'}: the answer is (${esc(q.correct)})</div>${esc(q.answer)}</div>
        <div class="why"><div class="lab">Why</div>${blocksSimple(q.why)}</div>${nextBtn()}`;
      document.getElementById('next').onclick = next; document.getElementById('next').focus({ preventScroll: true });
    });
  } else {
    document.getElementById('reveal').onclick = e => {
      e.target.disabled = true;
      document.getElementById('after').innerHTML = `<div class="model${q.type === 'essay' ? ' essay' : ''}"><div class="lab">${q.type === 'essay' ? 'Model essay framework' : 'Model answer'}</div>${blocksSimple(q.model)}</div>
        <p class="muted">How well did your own answer cover this?</p><div class="actions"><button class="btn" data-r="got">I covered it</button><button class="btn ghost" data-r="review">Need to review</button></div>`;
      document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
        const S = LS.get('self', {}); S[q.id] = b.dataset.r; LS.set('self', S);
        SES.log[SES.i] = b.dataset.r === 'got' ? 'ok' : 'bad';
        document.getElementById('after').insertAdjacentHTML('beforeend', nextBtn());
        document.querySelectorAll('[data-r]').forEach(x => x.disabled = true);
        document.getElementById('next').onclick = next; document.getElementById('next').focus({ preventScroll: true });
      });
    };
  }
}
function renderSummary() {
  const n = SES.items.length, done = SES.log.filter(Boolean).length, ok = SES.log.filter(x => x === 'ok').length;
  const missed = SES.items.filter((_, i) => SES.log[i] === 'bad');
  let h = `<header class="top"><h1>Session complete</h1><p>${done} of ${n} answered</p></header>
  <div class="stat"><div><b>${pct(ok, done)}%</b><span>correct or covered</span></div><div><b>${ok}</b><span>got it</span></div><div><b>${missed.length}</b><span>to review</span></div></div><div class="actions">`;
  if (missed.length) h += `<button class="btn" id="again">Practise the ${missed.length} I missed</button>`;
  h += `<a class="btn ghost" href="#/practice">New session</a><a class="btn ghost" href="#/progress">See progress</a></div>`;
  app.innerHTML = h; scrollTo(0, 0);
  const a = document.getElementById('again'); if (a) a.onclick = () => startSession(shuffle(missed));
}
async function viewSingle(ch, id) {
  const d = await J('data/q/' + ch + '.json');
  const q = d.questions.find(x => x.id === id);
  if (!q) return notFound();
  SES = { items: [{ ch, q }], i: 0, log: [], single: true };
  renderSession();
}

/* ---------- search ---------- */
let SEARCH = null;
async function viewSearch(qs) {
  setTab('search'); window.onscroll = null;
  app.innerHTML = `<header class="top"><h1>Search</h1><p>Across all chapters, appendices and practice questions.</p></header>
  <div class="sbox"><label class="sr" for="q">Search the guide</label><input id="q" type="search" placeholder="e.g. moratorium, free look, solvency margin" autocomplete="off" value="${esc(qs || '')}"></div><div id="out" role="status"></div>`;
  const input = document.getElementById('q'), out = document.getElementById('out');
  if (!SEARCH) {
    out.innerHTML = '<p class="muted">Preparing the search index…</p>';
    try { SEARCH = (await J('data/search.json')).map(e => (e.lx = (e.t + ' ' + e.x).toLowerCase(), e)); }
    catch (e) { out.innerHTML = '<p class="muted">Search needs the data files. Open the app once while online.</p>'; return; }
  }
  let t = null;
  const run = () => {
    const raw = input.value.trim(), terms = raw.toLowerCase().split(/\s+/).filter(x => x.length > 1);
    if (!terms.length) { out.innerHTML = '<p class="muted">Type at least two letters.</p>'; return; }
    const hits = [];
    for (const e of SEARCH) {
      let s = 0, ok = true;
      for (const w of terms) {
        const i = e.lx.indexOf(w); if (i < 0) { ok = false; break; }
        if (e.t.toLowerCase().includes(w)) s += 8;
        let c = 0, p = i; while (p >= 0 && c < 6) { c++; p = e.lx.indexOf(w, p + w.length); } s += c;
      }
      if (ok) hits.push({ e, s });
    }
    hits.sort((a, b) => b.s - a.s);
    const top = hits.slice(0, 40);
    if (!top.length) { out.innerHTML = `<p class="muted">Nothing found for “${esc(raw)}”. Try fewer or different words.</p>`; return; }
    out.innerHTML = `<p class="muted">${hits.length} result${hits.length > 1 ? 's' : ''}${hits.length > 40 ? ', showing the best 40' : ''}</p><ul class="res">` + top.map(({ e }) => {
      const i = e.lx.indexOf(terms[0], e.t.length + 1); const st = Math.max(0, (i < 0 ? 0 : i - e.t.length - 1) - 60);
      let sn = esc(e.x.slice(st, st + 220));
      for (const w of terms) sn = sn.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
      return `<li><a href="${e.r}"><b>${esc(e.t)}</b><small>${e.k === 'q' ? 'Practice question' : e.k === 'd' ? 'Appendix and front matter' : 'Chapter'}</small><p>${st ? '…' : ''}${sn}…</p></a></li>`;
    }).join('') + '</ul>';
  };
  input.oninput = () => { clearTimeout(t); t = setTimeout(run, 180); };
  if (qs) run(); else input.focus();
}

/* ---------- progress ---------- */
/* ---------- backup and restore ---------- */
const BK_TYPES = { read: 'array', mocks: 'array', last: 'object', scr: 'object', res: 'object', self: 'object', cards: 'object', mocklast: 'object', setup: 'object', mocksetup: 'object', cardsetup: 'object', plan: 'object', fs: 'number', theme: 'string' };
const bkType = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
function backupBuild() {
  const data = {}; for (const k of Object.keys(BK_TYPES)) { const v = LS.get(k, undefined); if (v !== undefined) data[k] = v; }
  return { app: 'LifeInsuranceBOK', kind: 'backup', version: 1, exported: new Date().toISOString(), data };
}
function backupFile() {
  const name = 'LifeInsuranceBOK-backup-' + isoDay(new Date()) + '.json';
  return new File([JSON.stringify(backupBuild(), null, 1)], name, { type: 'application/json' });
}
function backupParse(text) {
  if (text.length > 5e6) throw new Error('This file is too large to be a backup.');
  let o; try { o = JSON.parse(text); } catch (e) { throw new Error('This is not a readable backup file.'); }
  if (!o || o.app !== 'LifeInsuranceBOK' || o.kind !== 'backup' || typeof o.data !== 'object' || o.data === null) throw new Error('This file is not a Life InsuranceBOK backup.');
  if (o.version > 1) throw new Error('This backup comes from a newer version of the app. Update the app and try again.');
  const data = {};
  for (const [k, v] of Object.entries(o.data)) if (BK_TYPES[k] && bkType(v) === BK_TYPES[k]) data[k] = v;
  if (!Object.keys(data).length) throw new Error('The backup has no progress or plan in it.');
  return { exported: o.exported, data };
}
function backupMerge(cur, inc) {
  const plan = cur.plan && inc.plan ? (() => {
    const a = planNorm(cur.plan), b = planNorm(inc.plan), log = Object.assign({}, a.log);
    for (const [k, v] of Object.entries(b.log)) log[k] = Math.max(log[k] || 0, v);
    const missed = Object.assign({}, a.missed, b.missed); for (const k of Object.keys(log)) delete missed[k];
    return Object.assign({}, b, { log, missed });
  })() : (inc.plan || cur.plan);
  const mk = new Map(); for (const m of [...(cur.mocks || []), ...(inc.mocks || [])]) mk.set(m.ts, m);
  const out = {
    read: [...new Set([...(cur.read || []), ...(inc.read || [])])],
    res: Object.assign({}, cur.res, inc.res), self: Object.assign({}, cur.self, inc.self), cards: Object.assign({}, cur.cards, inc.cards),
    scr: (() => { const s = Object.assign({}, cur.scr); for (const [k, v] of Object.entries(inc.scr || {})) s[k] = Math.max(s[k] || 0, v); return s; })(),
    mocks: [...mk.values()].sort((x, y) => (y.ts || 0) - (x.ts || 0)).slice(0, 20)
  };
  if (plan) out.plan = plan;
  return out;
}
function backupSummary(d) {
  const q = Object.keys(d.res || {}).length + Object.keys(d.self || {}).length;
  const bits = [`${(d.read || []).length} chapters read`, `${q} questions attempted`, `${Object.keys(d.cards || {}).length} flashcards marked`, `${(d.mocks || []).length} mock exams`];
  if (d.plan) bits.push('a study plan with ' + Object.keys(d.plan.log || {}).length + ' days logged');
  return bits.join(', ');
}
function backupSheet() {
  const hasShare = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }));
  const cur = backupBuild().data, curSum = backupSummary(cur);
  const s = sheet('Backup and restore', `<p><b>On this device now:</b> ${esc(curSum)}.</p>
    <h3 style="margin-top:14px">Back up</h3><p>Save a file with your reading, practice results, flashcards, mock exams and study plan. Your app PIN is not included.</p>
    <div class="opt-r"><button class="btn" id="bkd">Download backup</button>${hasShare ? '<button class="btn ghost" id="bks">Share or save to Files</button>' : ''}</div>
    <h3 style="margin-top:14px">Restore</h3><p>Choose a backup file made by this app, for example from your other device.</p>
    <div class="opt-r"><label class="btn ghost" style="text-align:center;cursor:pointer" for="bkf">Choose backup file</label><input type="file" id="bkf" accept=".json,application/json" style="position:absolute;left:-9999px"></div>
    <div id="bkr" role="status"></div><div class="opt-r"><button class="btn ghost" id="bkx">Close</button></div>`);
  s.querySelector('#bkx').onclick = () => s.remove();
  s.querySelector('#bkd').onclick = () => {
    const f = backupFile(), a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast('Backup saved');
  };
  const sh = s.querySelector('#bks'); if (sh) sh.onclick = async () => { try { await navigator.share({ files: [backupFile()], title: 'Life InsuranceBOK backup' }); } catch (e) {} };
  const box = s.querySelector('#bkr');
  s.querySelector('#bkf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    let B; try { B = backupParse(await f.text()); } catch (err) { box.innerHTML = `<p style="color:var(--bad)">${esc(err.message)}</p>`; return; }
    const when = B.exported ? new Date(B.exported).toLocaleString() : 'unknown date';
    box.innerHTML = `<p><b>Backup from ${esc(when)}:</b> ${esc(backupSummary(B.data))}.</p>
      <div class="opt-r"><button class="btn" id="bkm">Merge with this device</button><button class="btn danger" id="bkrep">Replace this device’s data</button></div>
      <p><b>Merge</b> keeps everything on both devices: chapters read are combined, days logged take the larger time, and the backup’s answers win if the same question appears on both. <b>Replace</b> makes this device match the backup exactly.</p>`;
    const done = n => { toast('Restored'); setTimeout(() => location.reload(), 600); };
    box.querySelector('#bkm').onclick = () => { const m = backupMerge(cur, B.data); for (const [k, v] of Object.entries(m)) LS.set(k, v); for (const k of ['setup', 'mocksetup', 'cardsetup', 'fs', 'theme', 'last', 'mocklast']) if (!(k in cur) && k in B.data) LS.set(k, B.data[k]); done(); };
    box.querySelector('#bkrep').onclick = () => {
      box.innerHTML = '<p>This replaces your reading, practice results, flashcards, mocks and study plan on this device with the backup. It cannot be undone.</p><div class="opt-r"><button class="btn danger" id="bky">Yes, replace</button><button class="btn ghost" id="bkn">Cancel</button></div>';
      box.querySelector('#bkn').onclick = () => s.remove();
      box.querySelector('#bky').onclick = () => { for (const k of Object.keys(BK_TYPES)) { try { localStorage.removeItem('lin:' + k); } catch (e) {} } for (const [k, v] of Object.entries(B.data)) LS.set(k, v); done(); };
    };
  };
}

function viewProgress() {
  setTab('progress'); window.onscroll = null;
  const read = new Set(LS.get('read', [])), R = LS.get('res', {}), S = LS.get('self', {});
  const chs = allChapters(), readable = chs.filter(c => c.text);
  const mcqIds = Object.keys(R), okN = mcqIds.filter(k => R[k].ok).length;
  const byCh = {};
  for (const k of mcqIds) { const n = +k.slice(1, k.indexOf('-')); (byCh[n] = byCh[n] || { a: 0, o: 0 }); byCh[n].a++; if (R[k].ok) byCh[n].o++; }
  const review = mcqIds.filter(k => !R[k].ok).length + Object.values(S).filter(v => v === 'review').length;
  const totalQ = chs.reduce((a, c) => a + c.q, 0);
  let h = `<header class="top"><h1>Progress</h1><p>Stored on this device only.</p></header>
  <div class="stat"><div><b>${[...read].filter(n => chInfo(n) && chInfo(n).text).length}/${readable.length}</b><span>chapters read</span></div>
  <div><b>${mcqIds.length + Object.keys(S).length}/${totalQ}</b><span>questions attempted</span></div>
  <div><b>${mcqIds.length ? pct(okN, mcqIds.length) + '%' : '–'}</b><span>multiple-choice accuracy</span></div></div>`;
  { const K = LS.get('cards', {}), kv = Object.values(K), mk = LS.get('mocks', []); h += `<div class="stat" style="margin-top:10px"><div><b>${kv.filter(x => x === 'k').length}</b><span>flashcards known</span></div><div><b>${kv.filter(x => x === 'r').length}</b><span>flashcards to review</span></div><div><b>${mk.length}</b><span>mock exams taken</span></div></div>`; }
  h += `<div class="actions"><a class="btn" href="#/practice">Practise now</a>${review ? '<a class="btn ghost" href="#/practice/missed">Review ' + review + ' to revisit</a>' : ''}</div>`;
  const rows = Object.keys(byCh).map(Number).sort((a, b) => a - b);
  h += `<section class="card"><h2>Multiple-choice accuracy by chapter</h2>`;
  h += rows.length ? `<div class="bars">${rows.map(n => `<div class="r"><a href="#/practice/ch/${n}">${n}</a><div class="tr" title="${byCh[n].o} of ${byCh[n].a}"><i style="width:${pct(byCh[n].o, byCh[n].a)}%"></i></div><span>${pct(byCh[n].o, byCh[n].a)}%</span></div>`).join('')}</div>` : `<p class="muted">Answer some multiple-choice questions and your results show up here.</p>`;
  h += `</section><section class="card"><h2>Reading by part</h2><div class="bars">` + INDEX.toc.map(p => {
    const r = p.chapters.filter(c => c.text); const d = r.filter(c => read.has(c.n)).length;
    return `<div class="r"><span>${p.part}</span><div class="tr"><i style="width:${pct(d, r.length)}%"></i></div><span>${d}/${r.length}</span></div>`;
  }).join('') + `</div></section><div class="actions"><button class="btn ghost" id="reset">Reset progress</button><button class="btn ghost" id="pinbtn">App PIN: ${pinOn() ? 'On' : 'Off'}</button><button class="btn ghost" id="bkbtn">Backup and restore</button></div>`;
  app.innerHTML = h;
  document.getElementById('pinbtn').onclick = () => pinSheet(viewProgress);
  document.getElementById('bkbtn').onclick = backupSheet;
  document.getElementById('reset').onclick = () => resetSheet(viewProgress);
}

/* ---------- mock exam ---------- */
const MOCK = {
  foundation: { label: 'Foundation', kind: 'Multiple choice', counts: [20, 40, 60], def: 40, per: 1.5 },
  diploma: { label: 'Diploma', kind: 'Structured questions', counts: [3, 5, 8], def: 5, per: 20 },
  associateship: { label: 'Associateship', kind: 'Essay questions', counts: [2, 3, 4], def: 3, per: 35 }
};
const fmtT = ms => { const t = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
async function loadQs(ids) {
  const M = {}; for (const c of [...new Set(ids.map(x => x.ch))]) { const d = await J('data/q/' + c + '.json'); d.questions.forEach(q => M[q.id] = q); }
  return ids.map(x => ({ ch: x.ch, q: M[x.id] })).filter(x => x.q);
}
function mockMinutes(level, n, mode) { const m = MOCK[level]; const base = Math.round(m.per * n); return mode === 'none' ? 0 : mode === 'extra' ? Math.round(base * 1.5) : base; }
function viewMockSetup() {
  setTab('practice'); window.onscroll = null; clearInterval(MT);
  const st = Object.assign({ level: 'foundation', scope: 'all', count: 0, time: 'std' }, LS.get('mocksetup', {}));
  const run = LS.get('mockrun', null), hist = LS.get('mocks', []);
  const lv = MOCK[st.level]; if (!lv.counts.includes(st.count)) st.count = lv.def;
  let sel = `<option value="all">All parts</option>` + INDEX.toc.filter(p => p.chapters.some(c => c.q)).map(p => `<option value="p:${p.part}">${esc(p.label)}: ${esc(p.title)}</option>`).join('');
  let h = `<header class="top"><h1>Mock exam</h1><p>A timed paper built from the book’s practice questions.</p></header>`;
  if (run) h += `<div class="resume" id="resume" role="button" tabindex="0"><b>Resume your mock exam</b><span>${MOCK[run.level].label} · ${Object.keys(run.ans).length} of ${run.ids.length} answered${run.end ? ' · ' + fmtT(run.end - Date.now()) + ' left' : ''}</span></div>`;
  h += `<div class="card"><div class="fld"><label>Level</label><div class="chips" id="mlv">${Object.keys(MOCK).map(k => `<button class="chip" data-k="${k}" aria-pressed="${st.level === k}">${MOCK[k].label}</button>`).join('')}</div><p class="muted" style="margin:6px 0 0;font-size:.85rem">${lv.kind}. ${st.level === 'foundation' ? 'Answers are shown when you finish.' : 'You type your answers, then compare with the model answer and mark yourself.'}</p></div>
  <div class="fld"><label for="msc">Questions from</label><select id="msc">${sel}</select></div>
  <div class="fld"><label for="mct">Number of questions</label><select id="mct">${lv.counts.map(c => `<option${c === st.count ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
  <div class="fld"><label for="mtm">Time allowed</label><select id="mtm"><option value="std">Suggested: ${mockMinutes(st.level, st.count, 'std')} minutes</option><option value="extra">Extra time: ${mockMinutes(st.level, st.count, 'extra')} minutes</option><option value="none">No time limit</option></select></div>
  <div class="actions"><button class="btn" id="mgo">${run ? 'Start a new mock exam' : 'Start mock exam'}</button></div><p class="muted" id="mmsg" role="status"></p>
  <p class="muted" style="font-size:.84rem">This is a practice paper, not an official CIIN paper. Pacing follows Chapter 38: about 1.5 minutes per multiple-choice question. Written-question time is a suggestion; paper formats and marks vary, so check your sitting’s format with CIIN.</p></div>`;
  if (hist.length) h += `<section class="card"><h2>Your recent mock exams</h2><div class="bars">${hist.slice(0, 6).map(m => `<div class="r" style="grid-template-columns:5.5rem 1fr 3rem"><span>${MOCK[m.level].label.slice(0, 5)}. ${new Date(m.ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><div class="tr"><i style="width:${m.score == null ? 0 : m.score}%"></i></div><span>${m.score == null ? '–' : m.score + '%'}</span></div>`).join('')}</div></section>`;
  h += `<div class="actions"><a class="btn ghost" href="#/practice">Back to practice</a></div>`;
  app.innerHTML = h;
  document.getElementById('msc').value = st.scope; document.getElementById('mtm').value = st.time;
  const save = () => LS.set('mocksetup', st);
  document.querySelectorAll('#mlv .chip').forEach(b => b.onclick = () => { st.level = b.dataset.k; st.count = MOCK[st.level].def; save(); viewMockSetup(); });
  document.getElementById('msc').onchange = e => { st.scope = e.target.value; save(); };
  document.getElementById('mct').onchange = e => { st.count = +e.target.value; save(); viewMockSetup(); };
  document.getElementById('mtm').onchange = e => { st.time = e.target.value; save(); };
  const rs = document.getElementById('resume'); if (rs) { rs.onclick = () => { location.hash = '#/mock/run'; }; rs.onkeydown = e => { if (e.key === 'Enter') location.hash = '#/mock/run'; }; }
  document.getElementById('mgo').onclick = async () => {
    const msg = document.getElementById('mmsg'); msg.textContent = 'Preparing your paper…';
    let chs = allChapters().filter(c => c.q); if (st.scope.startsWith('p:')) chs = chs.filter(c => chInfo(c.n).part.part === +st.scope.slice(2));
    let pool = []; try { for (const c of chs) { const d = await J('data/q/' + c.n + '.json'); d.questions.forEach(q => pool.push({ ch: c.n, q })); } } catch (e) { msg.textContent = 'Could not load the questions. Open the app once while online to save them.'; return; }
    pool = pool.filter(x => st.level === 'foundation' ? (x.q.level === 'foundation' && x.q.type === 'mcq') : x.q.level === st.level);
    if (pool.length < 3) { msg.textContent = 'Not enough questions in that selection. Choose all parts.'; return; }
    const items = shuffle(pool).slice(0, Math.min(st.count, pool.length));
    const mins = mockMinutes(st.level, items.length, st.time), now = Date.now();
    LS.set('mockrun', { level: st.level, ids: items.map(x => ({ ch: x.ch, id: x.q.id })), ans: {}, flags: {}, i: 0, start: now, end: mins ? now + mins * 60000 : null, mins });
    location.hash = '#/mock/run';
  };
}
let MT = null, MRQ = null;
async function viewMockRun() {
  setTab('practice'); window.onscroll = null; clearInterval(MT);
  let R = LS.get('mockrun', null); if (!R) return viewMockSetup();
  if (R.end && Date.now() >= R.end) return finishMock(true);
  if (!MRQ || MRQ.key !== R.start) { MRQ = await loadQs(R.ids); MRQ.key = R.start; }
  const items = MRQ, n = items.length, save = () => LS.set('mockrun', R);
  const draw = () => {
    const { ch, q } = items[R.i], written = q.type !== 'mcq', a = R.ans[q.id], fl = R.flags[q.id];
    const done = Object.keys(R.ans).filter(k => String(R.ans[k]).trim()).length;
    app.innerHTML = `<div class="bar"><div class="ttl">${MOCK[R.level].label} mock exam</div><span class="clock" id="tm" aria-label="Time left">${R.end ? fmtT(R.end - Date.now()) : 'No limit'}</span><button class="ibtn" id="map" aria-label="Question map">${'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg>'}</button></div>
    <div class="qhead"><span>Question ${R.i + 1} of ${n}</span><span>${done} answered${Object.keys(R.flags).filter(k => R.flags[k]).length ? ' · ' + Object.keys(R.flags).filter(k => R.flags[k]).length + ' flagged' : ''}</span></div><div class="prog"><i style="width:${pct(done, n)}%"></i></div>
    <div class="qbox"><div class="lab">${LEVEL[q.level]}${q.marks ? ' · ' + q.marks + ' marks' : ''}${fl ? ' · Flagged for review' : ''}</div><div class="stem">${esc(q.stem)}</div></div>
    ${written ? `<div class="fld"><label for="ans">Your answer</label><textarea id="ans" rows="${q.type === 'essay' ? 14 : 9}" placeholder="Write your answer here. It stays on this device.">${esc(a || '')}</textarea></div>`
      : `<div class="opts">${q.opts.map(o => `<button class="opt${a === o.k ? ' sel' : ''}" data-k="${o.k}" aria-pressed="${a === o.k}"><b>${o.k}</b><span>${esc(o.x)}</span></button>`).join('')}</div>`}
    <div class="actions"><button class="btn ghost" id="pv"${R.i === 0 ? ' disabled' : ''}>Previous</button><button class="btn ghost" id="fg">${fl ? 'Remove flag' : 'Flag for review'}</button>${R.i < n - 1 ? '<button class="btn" id="nx">Next</button>' : '<button class="btn" id="fin">Finish exam</button>'}</div>
    <div class="actions"><button class="btn ghost sm" id="fin2">Finish early</button></div>`;
    document.getElementById('pv').onclick = () => { R.i--; save(); draw(); scrollTo(0, 0); };
    const nx = document.getElementById('nx'); if (nx) nx.onclick = () => { R.i++; save(); draw(); scrollTo(0, 0); };
    document.getElementById('fg').onclick = () => { R.flags[q.id] = !R.flags[q.id]; save(); draw(); };
    document.getElementById('map').onclick = () => {
      const sh = sheet('Question map', `<div class="qmap">${items.map((x, i) => `<button class="${String(R.ans[x.q.id] || '').trim() ? 'dn' : ''}${R.flags[x.q.id] ? ' fg' : ''}${i === R.i ? ' cur' : ''}" data-i="${i}" aria-label="Question ${i + 1}${String(R.ans[x.q.id] || '').trim() ? ', answered' : ', not answered'}${R.flags[x.q.id] ? ', flagged' : ''}">${i + 1}</button>`).join('')}</div><p>Filled = answered. Underlined = flagged for review.</p>`);
      sh.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { R.i = +b.dataset.i; save(); sh.remove(); draw(); scrollTo(0, 0); });
    };
    const finish = () => {
      const un = n - Object.keys(R.ans).filter(k => String(R.ans[k]).trim()).length, fgc = Object.keys(R.flags).filter(k => R.flags[k]).length;
      const sh = sheet('Finish the exam?', `<p>${un ? un + ' question' + (un > 1 ? 's are' : ' is') + ' unanswered. ' : 'Every question is answered. '}${fgc ? fgc + ' flagged for review. ' : ''}You cannot change your answers after you finish.</p><div class="opt-r"><button class="btn" id="yes">Finish and see results</button><button class="btn ghost" id="no">Keep going</button></div>`);
      sh.querySelector('#no').onclick = () => sh.remove(); sh.querySelector('#yes').onclick = () => { sh.remove(); finishMock(false); };
    };
    ['fin', 'fin2'].forEach(id => { const b = document.getElementById(id); if (b) b.onclick = finish; });
    if (written) { let t = null; document.getElementById('ans').oninput = e => { R.ans[q.id] = e.target.value; clearTimeout(t); t = setTimeout(save, 300); }; }
    else document.querySelectorAll('.opt').forEach(b => b.onclick = () => { R.ans[q.id] = b.dataset.k; save(); draw(); });
    if (R.end) { let warned = R.warned || 0; MT = setInterval(() => {
      const el = document.getElementById('tm'); if (!el) return clearInterval(MT);
      const left = R.end - Date.now(); el.textContent = fmtT(left);
      if (R.mins > 5 && left <= 300000 && left > 0 && !warned) { warned = R.warned = 1; save(); toast('5 minutes left'); }
      if (left <= 0) { clearInterval(MT); finishMock(true); }
    }, 1000); }
  };
  draw(); scrollTo(0, 0);
}
async function finishMock(auto) {
  clearInterval(MT);
  const R = LS.get('mockrun', null); if (!R) return viewMockSetup();
  const items = await loadQs(R.ids), now = Date.now(), secs = Math.round((now - R.start) / 1000);
  const res = LS.get('res', {}); let correct = 0;
  const rows = items.map(({ ch, q }) => {
    const a = R.ans[q.id]; const ok = q.type === 'mcq' ? a === q.correct : null;
    if (q.type === 'mcq' && a) { res[q.id] = { ok, t: now }; if (ok) correct++; }
    return { ch, id: q.id, a: a || '' };
  });
  LS.set('res', res);
  const last = { level: R.level, ts: now, secs, auto: !!auto, rows, rate: {}, correct, n: rows.length };
  LS.set('mocklast', last);
  try { localStorage.removeItem('lin:mockrun'); } catch (e) {}
  const hist = LS.get('mocks', []); hist.unshift({ level: R.level, ts: now, secs, n: rows.length, score: R.level === 'foundation' ? pct(correct, rows.length) : null }); LS.set('mocks', hist.slice(0, 20));
  MRQ = null; if (location.hash === '#/mock/result') viewMockResult(); else location.hash = '#/mock/result';
}
async function viewMockResult() {
  setTab('practice'); window.onscroll = null; clearInterval(MT);
  const L = LS.get('mocklast', null); if (!L) return viewMockSetup();
  const items = await loadQs(L.rows.map(r => ({ ch: r.ch, id: r.id }))), by = {}; items.forEach(x => by[x.q.id] = x);
  const lv = MOCK[L.level], mm = Math.floor(L.secs / 60), ss = L.secs % 60;
  let h = `<header class="top"><h1>${lv.label} mock exam: results</h1><p>${L.auto ? 'Time ran out and the paper was submitted. ' : ''}Finished in ${mm} min ${ss} s.</p></header>`;
  if (L.level === 'foundation') {
    const sc = pct(L.correct, L.n), un = L.rows.filter(r => !r.a).length;
    h += `<div class="stat"><div><b>${sc}%</b><span>score</span></div><div><b>${L.correct}/${L.n}</b><span>correct</span></div><div><b>${un}</b><span>unanswered</span></div></div>`;
    const chs = {}; L.rows.forEach(r => { const o = chs[r.ch] = chs[r.ch] || { a: 0, o: 0 }; o.a++; if (r.a && by[r.id].q.correct === r.a) o.o++; });
    h += `<section class="card"><h2>By chapter</h2><div class="bars">${Object.keys(chs).map(Number).sort((a, b) => a - b).map(c => `<div class="r"><a href="#/practice/ch/${c}">${c}</a><div class="tr"><i style="width:${pct(chs[c].o, chs[c].a)}%"></i></div><span>${chs[c].o}/${chs[c].a}</span></div>`).join('')}</div></section>`;
    const wrong = L.rows.filter(r => by[r.id] && by[r.id].q.correct !== r.a);
    h += `<div class="actions">${wrong.length ? `<button class="btn" id="redo">Practise the ${wrong.length} I missed or skipped</button>` : ''}<a class="btn ghost" href="#/mock">New mock exam</a></div><h2 style="font:700 1.05rem var(--sans);margin:18px 0 6px">Review every question</h2>`;
    h += L.rows.map((r, i) => { const { q } = by[r.id] || {}; if (!q) return ''; const ok = r.a === q.correct;
      return `<details class="rv ${ok ? 'ok' : 'no'}"><summary><b>${i + 1}.</b> ${ok ? 'Correct' : r.a ? 'Incorrect' : 'Not answered'} · Chapter ${r.ch}</summary><div class="qbox"><div class="stem">${esc(q.stem)}</div></div><div class="opts">${q.opts.map(o => `<div class="opt${o.k === q.correct ? ' ok' : o.k === r.a ? ' no' : ''}"><b>${o.k}</b><span>${esc(o.x)}</span></div>`).join('')}</div><div class="why"><div class="lab">Why</div>${blocksSimple(q.why)}</div></details>`; }).join('');
    app.innerHTML = h;
    const rd = document.getElementById('redo'); if (rd) rd.onclick = () => startSession(shuffle(wrong.map(r => by[r.id])));
  } else {
    const rated = Object.keys(L.rate).length, tot = L.rows.length;
    const pts = Object.values(L.rate).reduce((a, v) => a + v, 0), sc = rated ? Math.round(pts * 100 / tot) : null;
    h += `<div class="stat"><div><b>${rated === tot ? sc + '%' : '–'}</b><span>self-marked score</span></div><div><b>${rated}/${tot}</b><span>marked</span></div></div>
    <p class="muted">Read the model answer, then mark how much of it your answer covered. Be strict: examiners are.</p>`;
    h += L.rows.map((r, i) => { const { q } = by[r.id] || {}; if (!q) return ''; const v = L.rate[r.id];
      return `<section class="card"><div class="qbox"><div class="lab">Question ${i + 1} · Chapter ${r.ch}${q.marks ? ' · ' + q.marks + ' marks' : ''}</div><div class="stem">${esc(q.stem)}</div></div>
      <details><summary>Your answer</summary><p style="white-space:pre-wrap">${r.a ? esc(r.a) : '<span class="muted">You did not write an answer.</span>'}</p></details>
      <details${v == null ? ' open' : ''}><summary>Model answer</summary><div class="model${q.type === 'essay' ? ' essay' : ''}">${blocksSimple(q.model)}</div></details>
      <div class="chips" data-id="${r.id}" role="group" aria-label="How much did your answer cover?">${[[1, 'Covered fully'], [0.5, 'Covered partly'], [0, 'Mostly missed']].map(([k, t]) => `<button class="chip" data-v="${k}" aria-pressed="${v === k}">${t}</button>`).join('')}</div></section>`; }).join('');
    h += `<div class="actions"><a class="btn ghost" href="#/mock">New mock exam</a><a class="btn ghost" href="#/progress">See progress</a></div>`;
    app.innerHTML = h;
    document.querySelectorAll('.chips[data-id] .chip').forEach(b => b.onclick = () => {
      const id = b.parentElement.dataset.id, v = +b.dataset.v; L.rate[id] = v; LS.set('mocklast', L);
      const S = LS.get('self', {}); S[id] = v >= 1 ? 'got' : 'review'; LS.set('self', S);
      if (Object.keys(L.rate).length === L.rows.length) { const hist = LS.get('mocks', []); const e = hist.find(x => x.ts === L.ts); if (e) { e.score = Math.round(Object.values(L.rate).reduce((a, x) => a + x, 0) * 100 / L.rows.length); LS.set('mocks', hist); } }
      const y = scrollY; viewMockResult().then(() => scrollTo(0, y));
    });
  }
}

/* ---------- glossary flashcards ---------- */
let CARDS = null, CS = null;
async function loadCards() { return CARDS || (CARDS = await J('data/cards.json')); }
const ckey = c => c.t.toLowerCase();
async function viewCards() {
  setTab('practice'); window.onscroll = null;
  app.innerHTML = `<header class="top"><h1>Flashcards</h1><p>Glossary terms from the book.</p></header><p class="muted">Loading the glossary…</p>`;
  let cards; try { cards = await loadCards(); } catch (e) { app.innerHTML = `<header class="top"><h1>Flashcards</h1><p>Could not load the glossary. Open the app once while online to save it.</p></header>`; return; }
  const st = Object.assign({ deck: 'all', filter: 'all', dir: 'td', count: '20' }, LS.get('cardsetup', {}));
  const K = LS.get('cards', {}); const cnt = f => cards.filter(f).length;
  const known = cnt(c => K[ckey(c)] === 'k'), rev = cnt(c => K[ckey(c)] === 'r');
  const decks = `<option value="all">All terms (${cards.length})</option>` + INDEX.toc.map(p => { const n = cnt(c => c.p.includes(p.part)); return n ? `<option value="p:${p.part}">${esc(p.label)}: ${esc(p.title)} (${n})</option>` : ''; }).join('') + `<option value="g">Not tied to a chapter (${cnt(c => !c.p.length)})</option>`;
  app.innerHTML = `<header class="top"><h1>Flashcards</h1><p>${cards.length} glossary terms from the book.</p></header>
  <div class="stat"><div><b>${known}</b><span>know it</span></div><div><b>${rev}</b><span>to review</span></div><div><b>${cards.length - known - rev}</b><span>not seen yet</span></div></div>
  <div class="meter" style="margin:10px 0 0"><i style="--w:${pct(known, cards.length)}%"></i></div>
  <div class="card"><div class="fld"><label for="cdk">Deck</label><select id="cdk">${decks}</select></div>
  <div class="fld"><label for="cfl">Which cards</label><select id="cfl"><option value="all">All</option><option value="new">Not seen yet</option><option value="r">Review pile</option><option value="k">Ones I know</option></select></div>
  <div class="fld"><label for="cdr">Show first</label><select id="cdr"><option value="td">The term (recall the definition)</option><option value="dt">The definition (recall the term)</option></select></div>
  <div class="fld"><label for="cct">Cards per session</label><select id="cct"><option>10</option><option>20</option><option>50</option><option value="all">Everything that matches</option></select></div>
  <div class="actions"><button class="btn" id="cgo">Start flashcards</button></div><p class="muted" id="cmsg" role="status"></p></div>
  <div class="actions"><a class="btn ghost" href="#/practice">Back to practice</a></div>`;
  ['cdk:deck', 'cfl:filter', 'cdr:dir', 'cct:count'].forEach(x => { const [id, k] = x.split(':'); document.getElementById(id).value = st[k]; });
  document.getElementById('cgo').onclick = () => {
    const cfg = { deck: cdk.value, filter: cfl.value, dir: cdr.value, count: cct.value }; LS.set('cardsetup', cfg);
    let items = cards.filter(c => cfg.deck === 'all' ? true : cfg.deck === 'g' ? !c.p.length : c.p.includes(+cfg.deck.slice(2)));
    items = items.filter(c => { const v = K[ckey(c)]; return cfg.filter === 'all' ? true : cfg.filter === 'new' ? !v : v === cfg.filter; });
    if (!items.length) { cmsg.textContent = 'No cards match those choices. Try a wider selection.'; return; }
    items = shuffle(items); if (cfg.count !== 'all') items = items.slice(0, +cfg.count);
    CS = { items, i: 0, flip: false, dir: cfg.dir, k: 0, r: 0, rv: [] }; location.hash = '#/cards/run'; renderCard();
  };
}
function renderCard() {
  setTab('practice'); window.onscroll = null;
  if (!CS) return viewCards();
  if (CS.i >= CS.items.length) return cardSummary();
  const c = CS.items[CS.i], front = CS.dir === 'td' ? c.t : c.d, back = CS.dir === 'td' ? c.d : c.t;
  const ref = c.c.length ? 'Chapter' + (c.c.length > 1 ? 's ' : ' ') + c.c.join(', ') : 'General term';
  app.innerHTML = `<div class="bar"><button class="ibtn" id="cq" aria-label="End session">✕</button><div class="ttl">Flashcards</div></div>
  <div class="qhead"><span>Card ${CS.i + 1} of ${CS.items.length}</span><span>${CS.k} known</span></div><div class="prog"><i style="width:${pct(CS.i, CS.items.length)}%"></i></div>
  <div class="fc${CS.flip ? ' flipped' : ''}" id="fc" tabindex="0" role="button" aria-label="${CS.flip ? 'Showing the answer. Press to hide' : 'Press to show the answer'}">
    <div class="face f"><small>${CS.dir === 'td' ? 'Term' : 'Definition'}</small><div class="${CS.dir === 'td' ? 'big' : 'txt'}">${esc(front)}</div><span class="hint">Tap to reveal</span></div>
    <div class="face b"><small>${CS.dir === 'td' ? 'Definition' : 'Term'}</small><div class="${CS.dir === 'td' ? 'txt' : 'big'}">${esc(back)}</div><span class="hint">${esc(ref)}</span></div></div>
  <div class="actions" id="fa">${CS.flip ? '<button class="btn ghost" id="rv">Review again</button><button class="btn" id="kn">I know it</button>' : '<button class="btn" id="sh">Show answer</button>'}</div>
  <p class="muted" style="font-size:.8rem">Keyboard: Space to flip, 1 to review again, 2 if you know it.</p>`;
  const fcEl = document.getElementById('fc'), fa = document.getElementById('fa');
  const mark = v => { const K = LS.get('cards', {}); K[ckey(c)] = v; LS.set('cards', K); if (v === 'k') CS.k++; else { CS.r++; CS.rv.push(c); } CS.i++; CS.flip = false; renderCard(); };
  const acts = () => {
    fa.innerHTML = CS.flip ? '<button class="btn ghost" id="rv">Review again</button><button class="btn" id="kn">I know it</button>' : '<button class="btn" id="sh">Show answer</button>';
    const kn = document.getElementById('kn'), rv = document.getElementById('rv'), sh = document.getElementById('sh');
    if (kn) kn.onclick = () => mark('k'); if (rv) rv.onclick = () => mark('r'); if (sh) sh.onclick = flip;
  };
  const flip = () => { CS.flip = !CS.flip; fcEl.classList.toggle('flipped', CS.flip); fcEl.setAttribute('aria-label', CS.flip ? 'Showing the answer. Press to hide' : 'Press to show the answer'); acts(); };
  fcEl.onclick = flip; fcEl.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
  acts();
  document.getElementById('cq').onclick = () => { if (confirm('End this session? Your marks so far are saved.')) { CS.i = CS.items.length; renderCard(); } };
  document.onkeydown = e => { if (!document.getElementById('fc')) { document.onkeydown = null; return; } if (!CS.flip) return; if (e.key === '1' || e.key === 'ArrowLeft') mark('r'); if (e.key === '2' || e.key === 'ArrowRight') mark('k'); };
}
function cardSummary() {
  document.onkeydown = null;
  app.innerHTML = `<header class="top"><h1>Session complete</h1><p>${CS.k + CS.r} of ${CS.items.length} cards reviewed</p></header>
  <div class="stat"><div><b>${CS.k}</b><span>know it</span></div><div><b>${CS.r}</b><span>to review</span></div></div><div class="actions">${CS.rv.length ? `<button class="btn" id="again">Go again with the ${CS.rv.length} to review</button>` : ''}<a class="btn ghost" href="#/cards">New session</a><a class="btn ghost" href="#/practice">Back to practice</a></div>`;
  const a = document.getElementById('again'); if (a) a.onclick = () => { CS = { items: shuffle(CS.rv), i: 0, flip: false, dir: CS.dir, k: 0, r: 0, rv: [] }; renderCard(); };
}

/* ---------- app PIN ---------- */
const B64 = { enc: u => btoa(String.fromCharCode(...u)), dec: x => Uint8Array.from(atob(x), c => c.charCodeAt(0)) };
const CAN_PIN = !!(window.crypto && crypto.subtle);
async function pinHash(pin, salt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, k, 256));
}
function pinOn() { return !!LS.get('pin', null); }
async function pinSet(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  LS.set('pin', { s: B64.enc(salt), h: B64.enc(await pinHash(pin, salt)), n: pin.length }); LS.set('pinfail', { n: 0, until: 0 });
}
async function pinCheck(pin) {
  const r = LS.get('pin', null); if (!r) return true;
  const h = await pinHash(pin, B64.dec(r.s)), t = B64.dec(r.h); let d = h.length ^ t.length;
  for (let i = 0; i < h.length; i++) d |= h[i] ^ t[i]; return d === 0;
}
async function pinTry(pin) {
  const f = LS.get('pinfail', { n: 0, until: 0 }), now = Date.now();
  if (f.until > now) return { ok: false, msg: 'Too many attempts. Try again in ' + Math.ceil((f.until - now) / 1000) + ' seconds.' };
  if (await pinCheck(pin)) { LS.set('pinfail', { n: 0, until: 0 }); return { ok: true }; }
  f.n++; if (f.n >= 5) f.until = now + Math.min(900, 30 * Math.pow(2, f.n - 5)) * 1000; LS.set('pinfail', f);
  return { ok: false, msg: f.n >= 5 ? 'Too many attempts. Try again in ' + Math.ceil((f.until - now) / 1000) + ' seconds.' : 'That PIN is not right.' };
}
function pad(o) {
  const el = document.createElement('div'); el.className = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', o.title);
  let v = '', busy = false;
  const close = () => { document.removeEventListener('keydown', key); el.remove(); };
  const draw = msg => {
    el.innerHTML = `<div class="lk"><div class="lb">Life Insurance<b>BOK</b></div><h2>${esc(o.title)}</h2><p class="ls" aria-live="polite">${esc(msg || o.sub || '')}</p>
      <div class="dots" aria-hidden="true">${Array.from({ length: o.len }, (_, i) => `<i class="${i < v.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-d="${n}" aria-label="${n}">${n}</button>`).join('')}<button class="alt" data-a="x">${o.cancel ? 'Cancel' : ''}</button><button data-d="0" aria-label="0">0</button><button class="alt" data-a="b" aria-label="Delete last digit">⌫</button></div>
      ${o.forgot ? '<button class="lk-link" data-a="f">Forgot PIN?</button>' : ''}</div>`;
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => add(b.dataset.d));
    el.querySelector('[data-a=b]').onclick = () => { v = v.slice(0, -1); draw(); };
    const x = el.querySelector('[data-a=x]'); if (x) x.onclick = () => { if (o.cancel) { close(); o.cancel(); } };
    const f = el.querySelector('[data-a=f]'); if (f) f.onclick = () => forgot();
  };
  const add = async d => {
    if (busy || v.length >= o.len) return; v += d; draw();
    if (v.length === o.len) {
      busy = true; const pin = v; const r = await o.done(pin); busy = false;
      if (r && r.ok) { close(); o.ok && o.ok(pin); return; }
      v = ''; draw(r && r.msg); el.querySelector('.dots').classList.add('bad');
    }
  };
  const key = e => { if (/^\d$/.test(e.key)) add(e.key); else if (e.key === 'Backspace') { v = v.slice(0, -1); draw(); } else if (e.key === 'Escape' && o.cancel) { close(); o.cancel(); } };
  const forgot = () => {
    const s = sheet('Forgot your PIN?', `<p>The PIN cannot be recovered. Resetting removes the PIN and also clears all reading progress and practice results on this device. The book content is not affected.</p><div class="opt-r"><button class="btn danger" id="fy">Reset PIN and progress</button><button class="btn ghost" id="fn">Back</button></div>`);
    s.style.zIndex = 120; s.querySelector('#fn').onclick = () => s.remove();
    s.querySelector('#fy').onclick = () => { ['pin', 'pinfail', 'read', 'last', 'scr', 'res', 'self', 'cards', 'mocks', 'mocklast', 'mockrun'].forEach(k => { try { localStorage.removeItem('lin:' + k); } catch (e) {} }); s.remove(); close(); unlock(); route(); };
  };
  document.addEventListener('keydown', key); document.body.appendChild(el); draw(); return { close };
}
let LOCKED = false, hiddenAt = 0;
function lockApp() {
  if (!pinOn() || LOCKED) return; LOCKED = true; document.body.classList.add('locked');
  document.querySelectorAll('.sheet,.lock').forEach(x => x.remove());
  const n = LS.get('pin').n; pad({ title: 'Enter your PIN', sub: 'Life InsuranceBOK is locked', len: n, forgot: true, done: pinTry, ok: () => unlock() });
}
function unlock() { LOCKED = false; hiddenAt = 0; document.body.classList.remove('locked'); }
function pinFlowSet(len, after) {
  let first = null;
  const step1 = () => pad({ title: 'Choose a PIN', sub: len + ' digits', len, cancel: () => {}, done: async () => ({ ok: true }), ok: p => { first = p; step2(); } });
  const step2 = () => pad({ title: 'Confirm your PIN', sub: 'Enter it again', len, cancel: () => {}, done: async p => p === first ? { ok: true } : { ok: false, msg: 'The PINs did not match. Try again.' },
    ok: async p => { await pinSet(p); toast('PIN set'); after && after(); } });
  step1();
}
function pinVerify(title, then) { const n = LS.get('pin').n; pad({ title, sub: 'Enter your current PIN', len: n, cancel: () => {}, done: pinTry, ok: then }); }
function pinSheet(after) {
  if (!CAN_PIN) { sheet('App PIN', '<p>A PIN needs a secure (https) connection. Open the app from its installed or https address to use this.</p>'); return; }
  const lm = LS.get('lockMin', 1);
  const html = pinOn()
    ? `<p>The app asks for your PIN when it opens and after it has been in the background.</p>
       <div class="fld"><label for="lm">Lock after leaving the app</label><select id="lm">${[[0, 'Immediately'], [1, 'After 1 minute'], [5, 'After 5 minutes'], [15, 'After 15 minutes']].map(([v, t]) => `<option value="${v}"${v === lm ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
       <div class="opt-r"><button class="btn" id="lk">Lock now</button><button class="btn ghost" id="ch">Change PIN</button><button class="btn ghost" id="rm">Remove PIN</button><button class="btn ghost" id="cl">Close</button></div>
       <p style="font-size:.82rem">This is a privacy lock for this device. It keeps people who pick up your phone out of the app; it does not encrypt the files stored on it.</p>`
    : `<p>Set a PIN so only you can open the app on this device. Your reading progress and practice results stay private.</p>
       <div class="opt-r"><button class="btn" id="s4">Set a 4-digit PIN</button><button class="btn ghost" id="s6">Set a 6-digit PIN</button><button class="btn ghost" id="cl">Close</button></div>
       <p style="font-size:.82rem">This is a privacy lock for this device. It does not encrypt the files stored on it. If you forget the PIN, the only way back in is to reset it, which also clears your progress.</p>`;
  const s = sheet('App PIN', html); const q = x => s.querySelector(x), done = () => { s.remove(); after && after(); };
  q('#cl').onclick = () => s.remove();
  if (pinOn()) {
    q('#lm').onchange = e => LS.set('lockMin', +e.target.value);
    q('#lk').onclick = () => { s.remove(); lockApp(); };
    q('#ch').onclick = () => { s.remove(); pinVerify('Change PIN', () => pinFlowSet(LS.get('pin').n, after)); };
    q('#rm').onclick = () => { s.remove(); pinVerify('Remove PIN', () => { try { localStorage.removeItem('lin:pin'); localStorage.removeItem('lin:pinfail'); } catch (e) {} toast('PIN removed'); after && after(); }); };
  } else {
    q('#s4').onclick = () => { s.remove(); pinFlowSet(4, after); };
    q('#s6').onclick = () => { s.remove(); pinFlowSet(6, after); };
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (pinOn() && !LOCKED && hiddenAt && Date.now() - hiddenAt >= LS.get('lockMin', 1) * 60000) lockApp();
});

/* ---------- router ---------- */

/* ---------- study planner ---------- */
const PLAN_SCOPES = {
  foundation: { label: 'Foundation', parts: [1, 2], rev: [38] },
  diploma: { label: 'Diploma', parts: [3, 4], rev: [38] },
  associateship: { label: 'Associateship', parts: [5, 6, 7], rev: [38] },
  all: { label: 'Whole book', parts: [1, 2, 3, 4, 5, 6, 7], rev: [38, 39] }
};
const WPM = 120, MCQ_MIN = 1.5, WRITTEN_MIN = 12, CARD_SHARE = 0.15, MOCK_MIN = 120;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isoDay = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dayOf = s => new Date(s + 'T00:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtD = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmtDW = d => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtFull = d => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
function fmtH(min) { const h = min / 60; return h >= 10 ? Math.round(h) + ' h' : (Math.round(h * 10) / 10) + ' h'; }
function fmtM(min) {
  min = Math.round(min); if (min < 60) return min + ' min';
  const h = Math.floor(min / 60), r = min % 60; return r ? h + ' h ' + r + ' min' : h + ' h';
}
const todayMid = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
function chPlan(c) { return { n: c.n, title: c.title, q: c.q, mcq: c.mcq, read: Math.round(c.words / WPM), prac: Math.round(c.mcq * MCQ_MIN + (c.q - c.mcq) * WRITTEN_MIN) }; }
function planNorm(cfg) {
  const c = Object.assign({ scope: 'foundation', hpw: 6, days: [1, 2, 3, 4, 5, 6], log: {}, missed: {}, exam: '' }, cfg || {});
  if (!c.days || !c.days.length) c.days = [1, 2, 3, 4, 5, 6];
  return c;
}
/* ordered work items; w is minutes of study budget (content plus its share of flashcards and review) */
function planItems(cfg) {
  const sc = PLAN_SCOPES[cfg.scope] || PLAN_SCOPES.foundation;
  const chs = INDEX.toc.filter(p => sc.parts.includes(p.part)).flatMap(p => p.chapters).filter(c => c.text).map(chPlan);
  const rev = allChapters().filter(c => sc.rev.includes(c.n) && c.text).map(chPlan);
  const items = chs.map(c => ({ kind: 'ch', n: c.n, short: 'Ch ' + c.n, label: c.title, w: (c.read + c.prac) / (1 - CARD_SHARE) }));
  items.push({ kind: 'rev', short: 'Revision', label: 'Mock exam 1, redo missed questions, Chapter ' + sc.rev.join(' and '), w: rev.reduce((a, c) => a + c.read, 0) + MOCK_MIN });
  items.push({ kind: 'fin', short: 'Final mock', label: 'Mock exam 2 and a last flashcard pass', w: MOCK_MIN });
  return items;
}
/* ideal: the original plan from the start date, ignoring logged time and missed days */
function planSchedule(cfg, today, ideal) {
  const items = planItems(cfg), days = cfg.days, B = cfg.hpw * 60 / days.length;
  const log = ideal ? {} : cfg.log, missed = ideal ? {} : cfg.missed;
  const start = dayOf(cfg.start), from = ideal || today <= start ? start : today, todayKey = isoDay(today);
  let done = Object.values(log).reduce((a, b) => a + b, 0), idx = 0; const doneItems = [];
  while (idx < items.length && done >= items[idx].w - 0.01) { done -= items[idx].w; doneItems.push(items[idx]); idx++; }
  const rem = items.slice(idx).map((it, k) => ({ it, left: it.w - (k === 0 ? done : 0) }));
  const total = items.reduce((a, c) => a + c.w, 0), out = []; let q = 0, d = new Date(from), guard = 0;
  while (q < rem.length && guard++ < 1200) {
    const key = isoDay(d);
    let cap = days.includes(d.getDay()) && !missed[key] ? (!ideal && key === todayKey ? Math.max(0, B - (log[key] || 0)) : B) : 0;
    const e = { key, d: new Date(d), mins: 0, parts: [] };
    while (cap > 0.01 && q < rem.length) {
      const take = Math.min(cap, rem[q].left);
      e.parts.push({ it: rem[q].it, mins: take }); e.mins += take; cap -= take; rem[q].left -= take;
      if (rem[q].left <= 0.01) q++;
    }
    if (e.parts.length) out.push(e);
    d = addDays(d, 1);
  }
  const doneMin = Object.values(log).reduce((a, b) => a + b, 0);
  return { items, doneItems, out, B, total, doneMin, finish: q >= rem.length && out.length ? out[out.length - 1].d : (q >= rem.length ? null : undefined), remaining: Math.max(0, total - doneMin), partialItem: rem.length ? rem[0].it : null };
}
function planSummary(cfg) {
  const t = todayMid(), S = planSchedule(cfg, t, false), I = planSchedule(cfg, t, true), start = dayOf(cfg.start);
  const yest = addDays(t, -1); let planned = 0;
  for (let d = new Date(start); d <= yest; d = addDays(d, 1)) if (cfg.days.includes(d.getDay())) planned += S.B;
  const actual = Object.entries(cfg.log).filter(([k]) => k <= isoDay(t)).reduce((a, [, v]) => a + v, 0);
  return { t, S, I, start, planned, actual };
}
function weekRows(cfg, P) {
  const rows = [], WK = 7 * 86400000, cur = Math.max(0, Math.floor((P.t - P.start) / WK));
  for (let w = 0; w <= cur; w++) {
    const a = addDays(P.start, w * 7); let pl = 0, ac = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(a, i), k = isoDay(d);
      if (d < P.t && cfg.days.includes(d.getDay())) pl += P.S.B;
      if (d <= P.t) ac += cfg.log[k] || 0;
    }
    rows.push({ w, from: a, to: addDays(a, 6), pl, ac });
  }
  return rows;
}
function planIcs(P, cfg) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ymd = d => isoDay(d).replace(/-/g, ''), clean = t => String(t).replace(/[,;\\\n]/g, ' ');
  let s = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Life InsuranceBOK//Study plan//EN\r\n';
  P.S.out.forEach(e => {
    s += 'BEGIN:VEVENT\r\nUID:bok-' + cfg.start + '-' + e.key + '@lifeinsurancebok\r\nDTSTAMP:' + stamp + '\r\nDTSTART;VALUE=DATE:' + ymd(e.d) + '\r\nDTEND;VALUE=DATE:' + ymd(addDays(e.d, 1)) + '\r\nSUMMARY:BOK study ' + fmtM(e.mins) + '\r\nDESCRIPTION:' + clean(e.parts.map(p => p.it.short + ' ' + fmtM(p.mins)).join('; ')) + '\r\nEND:VEVENT\r\n';
  });
  if (cfg.exam) s += 'BEGIN:VEVENT\r\nUID:bok-exam-' + cfg.exam + '@lifeinsurancebok\r\nDTSTAMP:' + stamp + '\r\nDTSTART;VALUE=DATE:' + ymd(dayOf(cfg.exam)) + '\r\nDTEND;VALUE=DATE:' + ymd(addDays(dayOf(cfg.exam), 1)) + '\r\nSUMMARY:CIIN exam\r\nEND:VEVENT\r\n';
  s += 'END:VCALENDAR\r\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([s], { type: 'text/calendar' })); a.download = 'LifeInsuranceBOK-study-plan.ics';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function partRow(p) {
  const it = p.it;
  return `<li><div>${it.kind === 'ch' ? `<a href="#/ch/${it.n}"><b>${it.short}.</b> ${esc(it.label)}</a>` : `<b>${esc(it.short)}</b> <span class="muted" style="display:inline">${esc(it.label)}</span>`} <span class="muted" style="display:inline">${fmtM(p.mins)}</span></div></li>`;
}
function planEstimateHtml(cfg) {
  const t = todayMid(), I = planSchedule(cfg, t, true), n = I.out.length;
  if (!I.finish) return '';
  const weeks = Math.ceil((I.finish - dayOf(cfg.start)) / 604800000 + 1 / 7);
  let h = `<div class="note ok" role="status"><b>Estimated finish: ${fmtFull(I.finish)}</b><br>${n} study days over about ${weeks} week${weeks > 1 ? 's' : ''}, about ${fmtM(I.B)} on each study day. That covers all chapters, two mock exams and flashcards.</div>`;
  if (cfg.exam) {
    const ex = dayOf(cfg.exam), gap = Math.round((ex - I.finish) / 86400000);
    if (gap < 0) {
      const days = cfg.days.length; let need = null;
      for (let h2 = cfg.hpw; h2 <= 40; h2 += 0.5) { const c2 = Object.assign({}, cfg, { hpw: h2 }), f = planSchedule(c2, t, true).finish; if (f && f <= ex) { need = h2; break; } }
      h += `<div class="note warn">That is ${-gap} day${gap < -1 ? 's' : ''} after your exam on ${fmtD(ex)}.${need ? ` To finish before it, study about ${need} hours a week.` : ' Choose a later exam date or an earlier start.'}</div>`;
    } else h += `<div class="note">That is ${gap} day${gap === 1 ? '' : 's'} before your exam on ${fmtD(ex)}.</div>`;
  }
  return h;
}
function planSetup(cfg0) {
  setTab('plan'); window.onscroll = null;
  const editing = !!cfg0, st = planNorm(cfg0 || { start: isoDay(todayMid()), hpw: 6 });
  const draw = () => {
    app.innerHTML = `<header class="top"><h1>${editing ? 'Change your plan' : 'Study plan'}</h1><p>Choose a level, a start date and the days you can study. The finish date updates as you change anything.</p></header>
    <div class="card"><div class="fld"><label>Level</label><div class="chips" id="plv">${Object.keys(PLAN_SCOPES).map(k => `<button class="chip" data-k="${k}" aria-pressed="${st.scope === k}">${PLAN_SCOPES[k].label}</button>`).join('')}</div></div>
    <div class="fld"><label for="pst">Start date</label><input type="date" id="pst" value="${esc(st.start)}"></div>
    <div class="fld"><label>Days you can study</label><div class="chips" id="pdy">${[1, 2, 3, 4, 5, 6, 0].map(i => `<button class="chip" data-d="${i}" aria-pressed="${st.days.includes(i)}">${DOW[i]}</button>`).join('')}</div></div>
    <div class="fld"><label for="php">Hours each week</label><select id="php">${[2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(h => `<option${h === st.hpw ? ' selected' : ''} value="${h}">${h} hours</option>`).join('')}</select></div>
    <div class="fld"><label for="pex">Exam date (optional)</label><input type="date" id="pex" value="${esc(st.exam || '')}"></div>
    <div id="pest"></div>
    <p class="muted" style="font-size:.84rem">Times assume about ${WPM} words a minute for study reading, ${MCQ_MIN} minutes per multiple-choice question and ${WRITTEN_MIN} minutes per written question, plus ${Math.round(CARD_SHARE * 100)}% for flashcards and review and two ${MOCK_MIN / 60}-hour mock exams.</p>
    <div class="actions"><button class="btn" id="pgo">${editing ? 'Save changes' : 'Start my plan'}</button>${editing ? '<a class="btn ghost" href="#/plan">Cancel</a>' : ''}</div><p class="muted" id="pmsg" role="status"></p></div>`;
    const est = () => { document.getElementById('pest').innerHTML = st.days.length && st.start ? planEstimateHtml(st) : ''; };
    est();
    document.querySelectorAll('#plv .chip').forEach(b => b.onclick = () => { st.scope = b.dataset.k; document.querySelectorAll('#plv .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); est(); });
    document.querySelectorAll('#pdy .chip').forEach(b => b.onclick = () => {
      const i = +b.dataset.d, on = st.days.includes(i);
      if (on && st.days.length === 1) { document.getElementById('pmsg').textContent = 'Keep at least one study day.'; return; }
      st.days = on ? st.days.filter(x => x !== i) : [...st.days, i]; b.setAttribute('aria-pressed', !on); est();
    });
    document.getElementById('pst').onchange = e => { if (e.target.value) st.start = e.target.value; est(); };
    document.getElementById('pex').onchange = e => { st.exam = e.target.value; est(); };
    document.getElementById('php').onchange = e => { st.hpw = +e.target.value; est(); };
    document.getElementById('pgo').onclick = () => {
      if (!st.start) { document.getElementById('pmsg').textContent = 'Choose a start date.'; return; }
      LS.set('plan', { scope: st.scope, start: st.start, hpw: st.hpw, days: st.days.slice().sort(), exam: st.exam || '', log: st.log, missed: st.missed });
      if (location.hash === '#/plan') viewPlan(); else location.hash = '#/plan';
    };
  };
  draw();
}
function daySheet(cfg, key) {
  const d = dayOf(key), sched = cfg.days.includes(d.getDay()), B = cfg.hpw * 60 / cfg.days.length;
  const cur = cfg.log[key] || 0, isMissed = !!cfg.missed[key], isPast = key <= isoDay(todayMid());
  const s = sheet(fmtFull(d), `<p>${sched ? 'Planned: ' + fmtM(B) + '.' : 'Not a planned study day.'}${cur ? ' Logged: ' + fmtM(cur) + '.' : ''}${isMissed ? ' Marked as missed.' : ''}</p>
    ${isPast ? `<div class="fld"><label for="dsm">Minutes you studied</label><input type="number" id="dsm" min="0" max="900" step="5" value="${cur || Math.round(B / 5) * 5}" style="font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;width:100%;background:var(--surface);color:var(--ink)"></div>` : '<p>This day is in the future, so you can only mark it as missed or a day off.</p>'}
    <div class="opt-r">${isPast ? '<button class="btn" id="dsv">Save time studied</button>' : ''}<button class="btn ghost" id="dms">${isMissed ? 'Missed: already marked' : 'Mark as missed or day off'}</button>${cur || isMissed ? '<button class="btn ghost" id="dcl">Clear this day</button>' : ''}<button class="btn ghost" id="dx">Close</button></div>`);
  const save = c => { LS.set('plan', c); s.remove(); viewPlan(); };
  s.querySelector('#dx').onclick = () => s.remove();
  const v = s.querySelector('#dsv'); if (v) v.onclick = () => {
    const m = Math.max(0, Math.min(900, Math.round(+s.querySelector('#dsm').value || 0))), c = planNorm(cfg);
    delete c.missed[key]; if (m > 0) c.log[key] = m; else delete c.log[key]; save(c);
  };
  s.querySelector('#dms').onclick = () => { const c = planNorm(cfg); delete c.log[key]; c.missed[key] = true; save(c); };
  const cl = s.querySelector('#dcl'); if (cl) cl.onclick = () => { const c = planNorm(cfg); delete c.log[key]; delete c.missed[key]; save(c); };
}
function viewPlan(edit) {
  setTab('plan'); window.onscroll = null;
  const raw = LS.get('plan', null);
  if (!raw || edit) return planSetup(raw ? planNorm(raw) : null);
  const cfg = planNorm(raw), P = planSummary(cfg), S = P.S, I = P.I, tk = isoDay(P.t), B = S.B;
  const chTotal = S.items.filter(i => i.kind === 'ch').length, chDone = S.doneItems.filter(i => i.kind === 'ch').length;
  const pct = Math.min(100, Math.round(S.doneMin / S.total * 100));
  const started = P.t >= P.start, diff = P.actual - P.planned;
  let track;
  if (!started) track = ['', `Your plan starts on ${fmtFull(P.start)}.`];
  else if (!S.out.length && S.finish === null) track = ['ok', 'You have finished every item in the plan.'];
  else if (diff < -B * 0.5) track = ['warn', `You are ${fmtM(-diff)} behind where you planned to be. The schedule below has moved your finish date to match.`];
  else if (diff > B * 0.5) track = ['ok', `You are ${fmtM(diff)} ahead of plan.`];
  else track = ['ok', 'You are on track.'];
  const slip = S.finish && I.finish ? Math.round((S.finish - I.finish) / 86400000) : 0;
  const slipTxt = !S.finish ? '' : slip > 0 ? `${slip} day${slip > 1 ? 's' : ''} later than the original ${fmtD(I.finish)}` : slip < 0 ? `${-slip} day${slip < -1 ? 's' : ''} earlier than the original ${fmtD(I.finish)}` : `as originally planned`;
  let examNote = '';
  if (cfg.exam && S.finish) {
    const ex = dayOf(cfg.exam), gap = Math.round((ex - S.finish) / 86400000);
    if (gap < 0) {
      const left = S.out.filter(e => e.d <= ex).length, daysAfter = cfg.days.length;
      const need = left ? Math.ceil(S.remaining / left * daysAfter / 60 * 2) / 2 : null;
      examNote = `<div class="note warn">At this pace you finish ${-gap} day${gap < -1 ? 's' : ''} after your exam on ${fmtD(ex)}.${need ? ` To finish before it from now on, study about ${need} hours a week, or mark fewer days as missed.` : ''}</div>`;
    } else examNote = `<div class="note">You finish ${gap} day${gap === 1 ? '' : 's'} before your exam on ${fmtD(ex)}.</div>`;
  } else if (cfg.exam && !S.finish && S.finish === null) examNote = '';
  /* today */
  const te = S.out.find(e => e.key === tk), isStudyToday = cfg.days.includes(P.t.getDay()), missedToday = !!cfg.missed[tk], loggedToday = cfg.log[tk] || 0;
  let today = '';
  if (started) {
    let body;
    if (missedToday) body = `<p class="muted">Marked as missed. Your schedule has been moved on.</p>`;
    else if (!isStudyToday && !loggedToday) body = `<p class="muted">Not a planned study day. Study anyway and log it to finish sooner.</p>`;
    else body = (te ? `<ul class="pl">${te.parts.map(p => partRow(p)).join('')}</ul>` : `<p class="muted">Today’s plan is done.</p>`);
    today = `<div class="card"><h2 style="margin:0 0 4px;font:700 1.05rem var(--sans)">Today, ${fmtDW(P.t)}</h2><p class="muted" style="margin:0">${isStudyToday && !missedToday ? 'Planned ' + fmtM(B) : ''}${loggedToday ? (isStudyToday && !missedToday ? ' · ' : '') + 'Logged ' + fmtM(loggedToday) : ''}</p>${body}<div class="actions"><button class="btn" id="tlog">Log time</button><button class="btn ghost" id="tmis">${missedToday ? 'Undo missed' : 'I missed today'}</button></div></div>`;
  }
  /* recent days that still need recording */
  const rec = []; for (let d = addDays(P.t, -1); d >= P.start && rec.length < 7; d = addDays(d, -1)) {
    const k = isoDay(d), st2 = cfg.days.includes(d.getDay());
    if (st2 || cfg.log[k] || cfg.missed[k]) rec.push({ d, k, st2 });
  }
  const unrec = rec.filter(r => r.st2 && !cfg.log[r.k] && !cfg.missed[r.k]).length;
  const recent = rec.length ? `<div class="card"><h2 style="margin:0 0 2px;font:700 1.05rem var(--sans)">Recent days</h2><p class="muted" style="margin:0 0 6px;font-size:.88rem">${unrec ? unrec + ' planned day' + (unrec > 1 ? 's' : '') + ' not recorded. Unrecorded days count as no study, so record them to keep your schedule accurate.' : 'Tap a day to change what you recorded.'}</p><ul class="dl">${rec.map(r => {
    const l = cfg.log[r.k], m = cfg.missed[r.k];
    const tag = l ? `<span class="tg ok">${fmtM(l)}</span>` : m ? '<span class="tg bad">Missed</span>' : '<span class="tg">Not recorded</span>';
    return `<li><button data-day="${r.k}"><span>${fmtDW(r.d)}<small>${r.st2 ? 'Planned ' + fmtM(B) : 'Extra day'}</small></span>${tag}</button></li>`;
  }).join('')}</ul></div>` : '';
  /* actual vs planned by week */
  const wr = weekRows(cfg, P), mx = Math.max(1, ...wr.map(r => Math.max(r.pl, r.ac)));
  const weeksCard = started ? `<div class="card"><h2 style="margin:0 0 6px;font:700 1.05rem var(--sans)">Planned and actual time</h2>${wr.slice(-8).map(r => `<div class="wb"><div class="wl">Week ${r.w + 1} <small>${fmtD(r.from)} – ${fmtD(r.to)}</small></div><div class="wbars"><div class="b1" style="width:${Math.round(r.pl / mx * 100)}%"></div><div class="b2" style="width:${Math.round(r.ac / mx * 100)}%"></div></div><div class="wv">${fmtM(r.ac)} of ${fmtM(r.pl)}</div></div>`).join('')}<p class="muted" style="font-size:.8rem;margin:8px 0 0"><span class="lg l1"></span>Planned (to yesterday) <span class="lg l2"></span>Actual</p></div>` : '';
  /* missed days manager */
  const mk = Object.keys(cfg.missed).sort();
  const missedCard = `<div class="card"><h2 style="margin:0 0 2px;font:700 1.05rem var(--sans)">Missed days and days off</h2><p class="muted" style="margin:0 0 8px;font-size:.88rem">Mark days you cannot study, such as travel or illness, including days ahead. The schedule moves on and the finish date updates.</p>
    <div class="rng"><div><label for="mf">From</label><input type="date" id="mf" min="${esc(cfg.start)}"></div><div><label for="mt">To (optional)</label><input type="date" id="mt" min="${esc(cfg.start)}"></div><button class="btn ghost" id="madd">Mark missed</button></div><p class="muted" id="mmsg" role="status" style="font-size:.85rem"></p>
    ${mk.length ? `<div class="chips">${mk.map(k => `<button class="chip" data-un="${k}" aria-label="Remove ${k}">${fmtDW(dayOf(k))} ✕</button>`).join('')}</div>` : '<p class="muted" style="font-size:.88rem">No missed days marked.</p>'}</div>`;
  /* upcoming schedule grouped by week */
  const WK = 7 * 86400000, byW = {};
  S.out.forEach(e => { const w = Math.floor((e.d - P.start) / WK); (byW[w] = byW[w] || []).push(e); });
  const curW = Math.max(0, Math.floor((P.t - P.start) / WK));
  const sched = Object.keys(byW).map(Number).sort((a, b) => a - b).map(w => {
    const es = byW[w], tot = es.reduce((a, e) => a + e.mins, 0), a = addDays(P.start, w * 7);
    return `<details class="wk${w === curW ? ' now' : ''}"${w === curW ? ' open' : ''}><summary><h3>Week ${w + 1} <small>${fmtD(a)} – ${fmtD(addDays(a, 6))} · ${fmtH(tot)} planned</small></h3></summary>
      <ul class="pl">${es.map(e => `<li class="dayli"><div><b>${fmtDW(e.d)}</b> <span class="muted" style="display:inline">${fmtM(e.mins)}</span><ul class="sub">${e.parts.map(p => partRow(p)).join('')}</ul></div></li>`).join('')}</ul></details>`;
  }).join('');
  const doneList = S.doneItems.length ? `<details class="wk"><summary><h3>Completed <small>${S.doneItems.length} item${S.doneItems.length > 1 ? 's' : ''}</small></h3></summary><ul class="pl">${S.doneItems.map(i => `<li class="done"><span class="ck">✓</span><div>${i.kind === 'ch' ? `<a href="#/ch/${i.n}"><b>${i.short}.</b> ${esc(i.label)}</a>` : `<b>${esc(i.short)}</b> <span class="muted" style="display:inline">${esc(i.label)}</span>`}</div></li>`).join('')}</ul></details>` : '';
  app.innerHTML = `<header class="top"><h1>Study plan</h1><p>${esc(PLAN_SCOPES[cfg.scope].label)} · ${cfg.hpw} hours a week on ${cfg.days.length} day${cfg.days.length > 1 ? 's' : ''} · from ${fmtD(P.start)}</p></header>
  <div class="card"><div class="stats3"><div><b>${S.finish ? fmtD(S.finish) : 'Done'}</b><span>estimated finish</span></div><div><b>${pct}%</b><span>of plan complete</span></div><div><b>${fmtH(P.actual)}</b><span>studied of ${fmtH(P.planned)} planned</span></div></div>
  <div class="pbar" role="img" aria-label="${pct}% of the plan complete"><i style="width:${pct}%"></i></div>
  <div class="note ${track[0]}" role="status">${esc(track[1])}</div>
  ${S.finish ? `<p style="margin:10px 0 0;font-size:.92rem"><b>Finish: ${fmtFull(S.finish)}</b>, ${slipTxt}.</p>` : ''}${examNote}
  <p class="muted" style="font-size:.82rem;margin:8px 0 0">${chDone} of ${chTotal} chapters covered by logged time. ${Math.round(CARD_SHARE * 100)}% of each day is for flashcards and missed questions. Chapter times are estimates.</p>
  <div class="actions"><button class="btn ghost" id="pics">Add to calendar</button><a class="btn ghost" href="#/plan/edit">Change plan</a><button class="btn ghost" id="pbk">Back up</button><button class="btn ghost" id="pdel">Remove plan</button></div></div>
  ${today}${recent}${weeksCard}${missedCard}
  <section aria-label="Schedule"><h2 style="font:700 1.05rem var(--sans);margin:18px 0 4px">Schedule from today</h2>${sched || '<p class="muted">Nothing left to schedule.</p>'}${doneList}</section>`;
  app.querySelectorAll('[data-day]').forEach(b => b.onclick = () => daySheet(cfg, b.dataset.day));
  app.querySelectorAll('[data-un]').forEach(b => b.onclick = () => { const c = planNorm(cfg); delete c.missed[b.dataset.un]; LS.set('plan', c); viewPlan(); });
  const tl = document.getElementById('tlog'); if (tl) tl.onclick = () => daySheet(cfg, tk);
  const tm = document.getElementById('tmis'); if (tm) tm.onclick = () => { const c = planNorm(cfg); if (c.missed[tk]) delete c.missed[tk]; else { delete c.log[tk]; c.missed[tk] = true; } LS.set('plan', c); viewPlan(); };
  document.getElementById('madd').onclick = () => {
    const f = document.getElementById('mf').value, t = document.getElementById('mt').value || f, msg = document.getElementById('mmsg');
    if (!f) { msg.textContent = 'Choose the first missed day.'; return; }
    if (t < f) { msg.textContent = 'The end date must be on or after the first day.'; return; }
    if (f < cfg.start) { msg.textContent = 'Choose a date on or after your start date.'; return; }
    const c = planNorm(cfg); let n = 0;
    for (let d = dayOf(f); isoDay(d) <= t && n < 90; d = addDays(d, 1), n++) { const k = isoDay(d); delete c.log[k]; c.missed[k] = true; }
    LS.set('plan', c); viewPlan();
  };
  document.getElementById('pics').onclick = () => planIcs(P, cfg);
  document.getElementById('pbk').onclick = backupSheet;
  document.getElementById('pdel').onclick = () => { if (confirm('Remove your study plan, including the time you have logged? Your reading and practice progress stays.')) { try { localStorage.removeItem('lin:plan'); } catch (e) {} viewPlan(); } };
}

async function route() {
  document.querySelectorAll('.sheet').forEach(s => s.remove());
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qstr] = raw.split('?'); const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(qstr || '');
  try {
    if (!INDEX) INDEX = await J('data/index.json');
    if (!parts.length) return viewLibrary();
    switch (parts[0]) {
      case 'ch': return await viewChapter(+parts[1], parts[2], params.get('resume'));
      case 'doc': return await viewDoc(parts[1], parts[2]);
      case 'practice':
        if (parts[1] === 'run') return SES ? renderSession() : viewPracticeSetup();
        if (parts[1] === 'ch') { const st = LS.get('setup', {}); LS.set('setup', { ...st, scope: 'c:' + parts[2], filter: 'all' }); return viewPracticeSetup('c:' + parts[2]); }
        if (parts[1] === 'missed') { const st = LS.get('setup', {}); LS.set('setup', { ...st, scope: 'all', filter: 'missed', count: 'all', levels: ['foundation', 'diploma', 'associateship'] }); return viewPracticeSetup('all'); }
        return viewPracticeSetup();
      case 'q': return await viewSingle(+parts[1], parts[2]);
      case 'search': return await viewSearch(params.get('q'));
      case 'mock': if (parts[1] === 'run') return await viewMockRun(); if (parts[1] === 'result') return await viewMockResult(); return viewMockSetup();
      case 'cards': if (parts[1] === 'run') return CS ? renderCard() : viewCards(); return viewCards();
      case 'plan': return viewPlan(parts[1] === 'edit');
      case 'progress': return viewProgress();
      default: return notFound();
    }
  } catch (e) {
    app.innerHTML = `<header class="top"><h1>Couldn’t load this page</h1><p>${esc(e.message)}. If you are offline, open the app once with a connection so everything can be saved.</p><p><a href="#/">Back to the contents</a></p></header>`;
  }
}
window.addEventListener('hashchange', route);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (!location.hash || location.hash === '#/') route(); });
setFS(LS.get('fs', 1));
applyTheme(LS.get('theme', 'auto'));
lockApp();
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    if (!LS.get('offlineToast', false)) { LS.set('offlineToast', true); toast('Saved for offline use'); }
  }).catch(() => {});
}
})();
