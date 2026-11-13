/* রিপিট — BCS প্রশ্ন প্র্যাকটিস (v1: প্রোগ্রেস এই ডিভাইসে জমা থাকে; Google লগইন পরে Firebase দিয়ে) */
'use strict';

const SUBJ_ORDER = ['BL', 'BS', 'EL', 'EX', 'BD', 'IN', 'GE', 'SC', 'IT', 'MA', 'MN', 'ET'];
const LETTERS = ['ক', 'খ', 'গ', 'ঘ'];
const NEG_MARK = 0.5;          // BCS প্রিলিতে প্রতি ভুলে ০.৫ কাটা
const SEC_PER_Q = 36;          // ২০০ প্রশ্ন = ২ ঘণ্টা
const WEAK = 0.6, STRONG = 0.8, MIN_TRY = 3;
const MAKER = 'শাহরিয়ার';
const WA_NUMBER = '8801314624969';     // ভুল রিপোর্ট ও যোগাযোগ
const FB_URL = 'https://www.facebook.com/siyama.sahariyara.289749/'; // নির্মাতার ফেসবুক

let BANK = null, BY_ID = {}, SUBJ = {};
const $view = () => document.getElementById('view');

/* ---------- ছোট সহায়ক ---------- */
const BN = '০১২৩৪৫৬৭৮৯';
const bn = (x) => String(x).replace(/\d/g, (d) => BN[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const bcsLabel = (b) => `${bn(b)}তম BCS`;
function fmtTime(sec) { const m = Math.floor(sec / 60), s = sec % 60; return `${bn(m)}:${bn(String(s).padStart(2, '0'))}`; }

/* ---------- স্টোরেজ (পরে Firebase-এর সাথে sync হবে) ---------- */
const KEY = 'repeat.v1';
const Store = {
  data: { attempts: {}, fav: [], history: [] },
  load() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) this.data = Object.assign(this.data, d); } catch (e) { /* প্রাইভেট মোড */ }
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* জায়গা নেই */ } },
  record(id, correct) {
    const a = this.data.attempts[id] || { n: 0, c: 0, w: 0 };
    a.n++; if (correct === true) a.c++; if (correct === false) a.w++;
    a.ok = correct; a.last = Date.now();
    this.data.attempts[id] = a;
  },
  isFav(id) { return this.data.fav.includes(id); },
  toggleFav(id) {
    const f = this.data.fav; const i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.unshift(id);
    this.save(); return i < 0;
  },
};

/* ---------- প্রশ্ন বাছাই: আগে না-দেখা, তারপর ভুলগুলো ---------- */
function pickQuestions(pool, n) {
  const att = Store.data.attempts;
  const unseen = shuffle(pool.filter((q) => !att[q.id]));
  if (unseen.length >= n) return { qs: unseen.slice(0, n), recycled: 0 };
  const seen = pool.filter((q) => att[q.id]).sort((x, y) => {
    const a = att[x.id], b = att[y.id];
    if ((a.ok === false) !== (b.ok === false)) return a.ok === false ? -1 : 1; // শেষবার ভুল আগে
    if (b.w !== a.w) return b.w - a.w;                                        // বেশি ভুল আগে
    return a.last - b.last;                                                   // অনেক দিন আগে দেখা আগে
  });
  const need = n - unseen.length;
  return { qs: unseen.concat(seen.slice(0, need)), recycled: Math.min(need, seen.length) };
}

function related(q, limit = 6) {
  const byYear = (a, b) => a.b - b.b || a.n - b.n;
  let r = BANK.questions.filter((x) => x.u === q.u && x.id !== q.id).sort(byYear); // একই সাবটপিক আগে
  if (r.length < 3) {
    const more = BANK.questions.filter((x) => x.t === q.t && x.s === q.s && x.id !== q.id && x.u !== q.u).sort(byYear);
    r = r.concat(more);
  }
  return r.slice(0, limit);
}
const topicCount = (q) => BANK.questions.filter((x) => x.t === q.t && x.s === q.s).length;
const subtopicCount = (q) => BANK.questions.filter((x) => x.u === q.u).length;

/* ---------- টপিকভিত্তিক দক্ষতা ---------- */
function topicStats() {
  const att = Store.data.attempts, map = {};
  for (const q of BANK.questions) {
    const a = att[q.id]; if (!a) continue;
    const k = q.s + '|' + q.t;
    const m = map[k] || (map[k] = { s: q.s, t: q.t, n: 0, c: 0 });
    m.n += a.c + a.w; m.c += a.c;
  }
  const all = Object.values(map).filter((m) => m.n >= MIN_TRY);
  all.forEach((m) => (m.r = m.c / m.n));
  return {
    weak: all.filter((m) => m.r < WEAK).sort((a, b) => a.r - b.r),
    strong: all.filter((m) => m.r >= STRONG).sort((a, b) => b.r - a.r || b.n - a.n),
  };
}

/* ---------- রেন্ডারিং অংশ ---------- */
function expHTML(q) {
  const parts = (q.e || '').split(/\s*•\s*/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
  const imgs = (q.ei || []).map((src) => `<img src="${src}" alt="ব্যাখ্যার চিত্র" decoding="async">`).join('');
  const note = q.note ? `<p><b>${esc(q.note)}</b></p>` : '';
  return note + parts + imgs || '<p class="muted">এই প্রশ্নের আলাদা ব্যাখ্যা নেই।</p>';
}
function qImgHTML(q) { return (q.qi || []).map((src) => `<div class="qimg"><img src="${src}" alt="প্রশ্নের চিত্র"></div>`).join(''); }
const ansText = (q) => (q.a == null ? (q.note || 'কোনো অপশন সঠিক নয়') : `(${LETTERS[q.a]}) ${q.o[q.a]}`);
function reportLink(q) {
  const text = `রিপিট — ভুল রিপোর্ট\n${bcsLabel(q.b)}, প্রশ্ন ${bn(q.n)}\n"${(q.q || 'চিত্রভিত্তিক প্রশ্ন').slice(0, 140)}"\nসমস্যা: `;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
}
const reportBtn = (q) => `<a class="rep" href="${reportLink(q)}" target="_blank" rel="noopener" title="এই প্রশ্নে ভুল থাকলে WhatsApp-এ জানান">⚑ ভুল জানান</a>`;
function makerHTML() {
  return `<footer class="card maker">
    <div class="small muted">নির্মাতা</div>
    <h2 style="margin:2px 0 4px">${esc(MAKER)}</h2>
    <p class="small muted">চাকরিপ্রার্থীদের প্রস্তুতি সহজ করার একটা ফ্রি উদ্যোগ। মতামত বা কোনো ভুল চোখে পড়লে জানাবেন।</p>
    <div class="row">
      <a class="btn" href="https://wa.me/${WA_NUMBER}" target="_blank" rel="noopener">💬 WhatsApp</a>
      ${FB_URL ? `<a class="btn" href="${FB_URL}" target="_blank" rel="noopener">ⓕ Facebook</a>` : ''}
    </div>
  </footer>`;
}
/* ---------- স্টাডি নোট (data/notes.json: {বিষয়কোড: {টপিক: html}}) ---------- */
let NOTES = {};
const hasNote = (s, t) => !!(NOTES[s] && NOTES[s][t]);
const readySubjects = () => SUBJ_ORDER.filter((s) => NOTES[s] && Object.keys(NOTES[s]).length);
function notesSoonHTML() {
  const ready = readySubjects();
  const left = SUBJ_ORDER.length - ready.length;
  return `<section class="card soon">
    <div class="spread"><h2 style="margin:0">📗 স্টাডি নোট</h2>${left ? `<span class="badge">${ready.length ? 'আরও আসছে' : 'শীঘ্রই আসছে'}</span>` : ''}</div>
    <p class="small muted" style="margin:6px 0 10px">প্রতিটা টপিকের নিয়ম আর মূল কথা সংক্ষেপে, যা পড়লে ১৭০০ প্রশ্নের সবকিছু জানা হয়ে যাবে। প্র্যাকটিসে যে টপিকে ভুল করবেন, শুধু সেগুলোর নোটও আলাদা করে পাবেন।</p>
    ${ready.length ? `<p class="small" style="margin-bottom:10px">✔ তৈরি: ${ready.map((s) => esc(SUBJ[s])).join(', ')}${left ? ` · বাকি ${bn(left)}টি বিষয় শীঘ্রই` : ''}</p>
    <a class="btn primary block" href="#/notes">📗 স্টাডি নোট পড়ুন</a>` : ''}
  </section>`;
}
const metaHTML = (q) => `<div class="meta"><span class="tag">${bcsLabel(q.b)}</span> প্রশ্ন ${bn(q.n)} · ${esc(SUBJ[q.s])} › ${esc(q.t)}</div>`;

function relatedHTML(q) {
  const r = related(q);
  const tc = topicCount(q), sc = subtopicCount(q);
  const head = `<h3>📌 এই টপিক BCS-এ কতবার এসেছে?</h3>
    <p class="small">“${esc(q.u)}” থেকে গত ১০টি BCS-এ <b>${bn(sc)}টি</b> প্রশ্ন, আর পুরো “${esc(q.t)}” টপিক থেকে <b>${bn(tc)}টি</b> প্রশ্ন এসেছে।</p>`;
  const noteLink = hasNote(q.s, q.t) ? `<a class="btn block" style="margin:6px 0 4px" href="#/notes/${q.s}/${encodeURIComponent(q.t)}" target="_blank" rel="noopener">📗 “${esc(q.t)}” টপিকের স্টাডি নোট পড়ুন</a>` : '';
  if (!r.length) return `<div class="rel">${head}${noteLink}</div>`;
  const items = r.map((x) => `<details><summary>${metaLine(x)} ${esc(x.q || 'চিত্রভিত্তিক প্রশ্ন')}</summary>
      ${qImgHTML(x)}<p class="ans">উত্তর: ${esc(ansText(x))}</p><div class="exp">${expHTML(x)}</div></details>`).join('');
  return `<div class="rel">${head}${noteLink}<p class="small muted">সম্পর্কিত প্রশ্নগুলো (খুলে দেখুন):</p>${items}</div>`;
}
const metaLine = (x) => `<span class="tag">${bcsLabel(x.b)}</span>`;

/* ---------- রাউটার ---------- */
const routes = {
  '': viewHome, practice: viewPracticeSetup, mock: viewMockSetup, quiz: viewQuiz, mocktest: viewMockTest,
  result: viewResult, notebook: viewNotebook, guide: viewGuide, notes: viewNotes, about: viewAbout,
};
function go(path) { location.hash = '#/' + path; }
function render() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const fn = routes[name] || viewHome;
  if (Session.mockTimer && name !== 'mocktest') stopMockTimer();
  document.querySelectorAll('.tabs a').forEach((a) => {
    const tab = a.dataset.tab;
    const on = (tab === 'home' && !name) || tab === name || (tab === 'practice' && name === 'quiz') ||
      (tab === 'mock' && name === 'mocktest') || (tab === 'notebook' && (name === 'guide' || name === 'notes'));
    a.classList.toggle('on', on);
  });
  fn(rest);
  window.scrollTo(0, 0);
}

/* ---------- হোম ---------- */
function viewHome() {
  const att = Store.data.attempts, total = BANK.questions.length;
  const ids = Object.keys(att), seen = ids.length;
  let c = 0, w = 0; ids.forEach((id) => { c += att[id].c; w += att[id].w; });
  const { weak, strong } = topicStats();
  const wrongNow = ids.filter((id) => att[id].ok === false).length;
  const zone = (arr, cls) => arr.slice(0, 4).map((m) => `<div class="zone"><span>${esc(m.t)} <small class="muted">· ${esc(SUBJ[m.s])}</small></span><span class="pct ${cls}">${bn(pct(m.c, m.n))}%</span></div>`).join('');
  $view().innerHTML = `
  <section class="card">
    <h1>আসসালামু আলাইকুম</h1>
    <p style="margin-bottom:.35rem"><b>চাকরির প্রস্তুতি শুরু হয় বিগত বছরের প্রশ্ন দিয়ে।</b></p>
    <p class="muted">১ম থেকে ২০তম, যে গ্রেডের চাকরিই হোক, প্রস্তুতির প্রথম ধাপ BCS-এর প্রশ্ন সমাধান। ৪১–৫০তম BCS প্রিলির <b>${bn(total)}টি প্রশ্ন</b> ব্যাখ্যাসহ এখানে সাজানো আছে, যাতে আপনার শুরুটা সহজ হয়।</p>
    <div class="grid2">
      <div class="stat"><b>${bn(seen)}/${bn(total)}</b><span>প্রশ্ন দেখা হয়েছে</span></div>
      <div class="stat"><b>${bn(pct(c, c + w))}%</b><span>সঠিক উত্তরের হার</span></div>
    </div>
    <div class="bar" style="margin-top:12px"><i style="width:${pct(seen, total)}%"></i></div>
  </section>
  <section class="row" style="margin-bottom:14px">
    <a class="btn primary" style="flex:1" href="#/practice">✎ প্র্যাকটিস শুরু</a>
    <a class="btn" style="flex:1" href="#/mock">⏱ মক টেস্ট</a>
  </section>
  ${wrongNow ? `<section class="card spread"><span>আপনার <b>${bn(wrongNow)}টি</b> ভুল প্রশ্ন আবার পড়ার অপেক্ষায়</span><button class="btn" data-act="wrong">আবার দিন</button></section>` : ''}
  <section class="card">
    <h2>দুর্বল জায়গা</h2>
    ${weak.length ? zone(weak, 'bad') + `<a class="btn block" style="margin-top:12px" href="#/guide">📘 দুর্বল টপিকের বিগত প্রশ্ন সংকলন</a>` : `<p class="muted small">একটা টপিকে অন্তত ${bn(MIN_TRY)}টি প্রশ্নের উত্তর দিলে এখানে দেখাবে কোথায় আপনি দুর্বল।</p>`}
  </section>
  <section class="card">
    <h2>শক্ত জায়গা</h2>
    ${strong.length ? zone(strong, 'ok') : '<p class="muted small">এখনো যথেষ্ট তথ্য নেই।</p>'}
  </section>
  ${notesSoonHTML()}
  ${makerHTML()}
  <p class="small muted" style="text-align:center"><a href="#/about">রিপিট সম্পর্কে</a></p>`;
  const b = $view().querySelector('[data-act="wrong"]');
  if (b) b.onclick = () => startWrongPractice();
}

/* ---------- প্র্যাকটিস সেটআপ ---------- */
const setup = { by: 'subject', s: 'BL', t: null, b: 41, n: 10 };
function poolFor(cfg) {
  const Q = BANK.questions;
  if (cfg.by === 'subject') return Q.filter((q) => q.s === cfg.s);
  if (cfg.by === 'topic') return Q.filter((q) => q.s === cfg.s && q.t === cfg.t);
  if (cfg.by === 'exam') return Q.filter((q) => q.b === cfg.b);
  return Q;
}
function seenCount(pool) { const a = Store.data.attempts; return pool.filter((q) => a[q.id]).length; }

function viewPracticeSetup() {
  const Q = BANK.questions;
  const subjPicks = SUBJ_ORDER.map((s) => {
    const pool = Q.filter((q) => q.s === s), seen = seenCount(pool);
    return `<button class="pick ${setup.s === s ? 'on' : ''}" data-s="${s}"><span>${esc(SUBJ[s])}<div class="bar"><i style="width:${pct(seen, pool.length)}%"></i></div></span><small>${bn(seen)}/${bn(pool.length)}</small></button>`;
  }).join('');
  const topics = [...new Set(Q.filter((q) => q.s === setup.s).map((q) => q.t))]
    .map((t) => ({ t, pool: Q.filter((q) => q.s === setup.s && q.t === t) }))
    .sort((a, b) => b.pool.length - a.pool.length);
  if (setup.by === 'topic' && !topics.some((x) => x.t === setup.t)) setup.t = topics[0].t;
  const topicPicks = topics.map(({ t, pool }) => `<button class="pick ${setup.t === t ? 'on' : ''}" data-t="${esc(t)}"><span>${esc(t)}</span><small>${bn(seenCount(pool))}/${bn(pool.length)}</small></button>`).join('');
  const examPicks = Object.keys(BANK.exams).map((b) => +b).map((b) => {
    const pool = Q.filter((q) => q.b === b);
    return `<button class="pick ${setup.b === b ? 'on' : ''}" data-b="${b}"><span>${bcsLabel(b)} <small class="muted">(${bn(BANK.exams[b].date.slice(0, 4))})</small></span><small>${bn(seenCount(pool))}/${bn(pool.length)}</small></button>`;
  }).join('');

  const pool = poolFor(setup), seen = seenCount(pool);
  $view().innerHTML = `
  <h1>প্র্যাকটিস</h1>
  <p class="muted small">প্রতিটা উত্তরের পর ব্যাখ্যা পড়ে তারপর পরের প্রশ্নে যাবেন। একবার দেওয়া প্রশ্ন আবার আসবে না, যতক্ষণ নতুন প্রশ্ন বাকি আছে।</p>
  <div class="seg" role="tablist">
    <button data-by="subject" class="${setup.by === 'subject' ? 'on' : ''}">বিষয়ভিত্তিক</button>
    <button data-by="topic" class="${setup.by === 'topic' ? 'on' : ''}">টপিকভিত্তিক</button>
    <button data-by="exam" class="${setup.by === 'exam' ? 'on' : ''}">BCS ভিত্তিক</button>
  </div>
  ${setup.by === 'exam' ? `<section class="card"><h2>কোন BCS?</h2><div class="list">${examPicks}</div></section>`
    : setup.by === 'topic' ? `
  <section class="card">
    <h3 class="muted" style="font-weight:500">১. বিষয় বেছে নিন</h3>
    <div class="chips scroll" id="subjrow">${SUBJ_ORDER.map((s) => `<button class="chip ${setup.s === s ? 'on' : ''}" data-s="${s}">${esc(SUBJ[s])}</button>`).join('')}</div>
    <p class="small muted" style="margin:4px 0 0">← পাশে সরালে আরও বিষয়</p>
  </section>
  <section class="card">
    <h3 class="muted" style="font-weight:500">২. টপিক বেছে নিন</h3>
    <h2>${esc(SUBJ[setup.s])} <small class="muted" style="font-size:.85rem;font-weight:400">· ${bn(topics.length)}টি টপিক</small></h2>
    <div class="list">${topicPicks}</div>
  </section>`
    : `<section class="card"><h2>বিষয়</h2><div class="list">${subjPicks}</div></section>`}
  <section class="card">
    <h2>কয়টি প্রশ্ন?</h2>
    <div class="chips">${[10, 30, 50].map((n) => `<button class="chip ${setup.n === n ? 'on' : ''}" data-n="${n}">${bn(n)}টি</button>`).join('')}</div>
    <p class="small muted" style="margin-top:10px">এই অংশে নতুন প্রশ্ন বাকি: <b>${bn(pool.length - seen)}টি</b>${pool.length - seen < setup.n ? ' — বাকিগুলো আসবে আপনার আগের ভুল প্রশ্ন থেকে।' : ''}</p>
  </section>
  <div class="sticky-actions"><button class="btn primary" data-act="start">শুরু করুন →</button></div>`;

  const v = $view();
  const onChip = v.querySelector('#subjrow .chip.on');  // বাছাই করা বিষয় চোখের সামনে রাখো
  if (onChip) onChip.parentElement.scrollLeft = onChip.offsetLeft - onChip.parentElement.offsetLeft - 8;
  v.querySelectorAll('[data-by]').forEach((b) => (b.onclick = () => { setup.by = b.dataset.by; viewPracticeSetup(); }));
  v.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { setup.s = b.dataset.s; setup.t = null; viewPracticeSetup(); }));
  v.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { setup.t = b.dataset.t; viewPracticeSetup(); }));
  v.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => { setup.b = +b.dataset.b; viewPracticeSetup(); }));
  v.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { setup.n = +b.dataset.n; viewPracticeSetup(); }));
  v.querySelector('[data-act="start"]').onclick = () => {
    const { qs, recycled } = pickQuestions(poolFor(setup), setup.n);
    const label = setup.by === 'exam' ? bcsLabel(setup.b) : setup.by === 'topic' ? setup.t : SUBJ[setup.s];
    startPractice(qs, label, recycled);
  };
}

/* ---------- প্র্যাকটিস সেশন ---------- */
const Session = { mode: null, qs: [], i: 0, ans: [], label: '', recycled: 0, revealed: false, start: 0, mockTimer: null };

function startPractice(qs, label, recycled = 0) {
  if (!qs.length) { alert('এই অংশে কোনো প্রশ্ন নেই।'); return; }
  Object.assign(Session, { mode: 'practice', qs, i: 0, ans: new Array(qs.length).fill(null), label, recycled, revealed: false, start: Date.now() });
  go('quiz');
}
function startWrongPractice() {
  const att = Store.data.attempts;
  const qs = shuffle(BANK.questions.filter((q) => att[q.id] && att[q.id].ok === false)).slice(0, 50);
  startPractice(qs, 'আমার ভুল প্রশ্ন');
}

function viewQuiz() {
  if (Session.mode !== 'practice' || !Session.qs.length) { go('practice'); return; }
  const q = Session.qs[Session.i], chosen = Session.ans[Session.i], total = Session.qs.length;
  const answered = chosen !== null;
  const fav = Store.isFav(q.id);
  const optHTML = q.o.map((o, k) => {
    let cls = '';
    if (answered) { if (k === q.a) cls = 'ok'; else if (k === chosen) cls = 'bad'; }
    return `<button class="opt ${cls}" data-k="${k}" ${answered ? 'disabled' : ''}><span class="l">${LETTERS[k]}</span><span class="t">${esc(o)}</span></button>`;
  }).join('');
  let verdict = '';
  if (answered) {
    verdict = q.a == null ? `<div class="verdict warn">⚠ এই প্রশ্নের কোনো অপশনই সঠিক নয়।</div>`
      : chosen === q.a ? `<div class="verdict ok">✔ সঠিক উত্তর!</div>`
        : `<div class="verdict bad">✘ ভুল হয়েছে। সঠিক উত্তর: (${LETTERS[q.a]}) ${esc(q.o[q.a])}</div>`;
  }
  const last = Session.i === total - 1;
  $view().innerHTML = `
  <div class="qhead"><span class="small muted">${esc(Session.label)} · ${bn(Session.i + 1)}/${bn(total)}</span>
    <span class="qtools">${reportBtn(q)}<button class="star ${fav ? 'on' : ''}" data-act="fav" aria-label="ফেভারিট" title="ফেভারিট করে রাখুন">${fav ? '★' : '☆'}</button></span></div>
  <div class="progress"><i style="width:${pct(Session.i + (answered ? 1 : 0), total)}%"></i></div>
  ${Session.i === 0 && Session.recycled ? `<p class="note small">এই অংশের নতুন প্রশ্ন শেষ হয়ে আসছে, তাই ${bn(Session.recycled)}টি প্রশ্ন আপনার আগের ভুলগুলো থেকে দেওয়া হলো।</p>` : ''}
  <article class="card">
    ${metaHTML(q)}
    <div class="qtext">${esc(q.q)}</div>
    ${qImgHTML(q)}
    <div class="opts">${optHTML}</div>
    ${verdict}
    <div id="expbox">${answered && Session.revealed ? `<div class="exp"><h3>ব্যাখ্যা</h3>${expHTML(q)}</div>${relatedHTML(q)}` : ''}</div>
  </article>
  <div class="sticky-actions">
    ${!answered ? `<button class="btn" data-act="end">শেষ করুন</button>`
      : !Session.revealed ? `<button class="btn primary" data-act="reveal">ব্যাখ্যা দেখুন</button>`
        : `<button class="btn primary" data-act="next">${last ? 'ফলাফল দেখুন' : 'পরের প্রশ্ন →'}</button>`}
  </div>`;

  const v = $view();
  v.querySelectorAll('.opt').forEach((b) => (b.onclick = () => {
    const k = +b.dataset.k;
    Session.ans[Session.i] = k; Session.revealed = false;
    Store.record(q.id, q.a == null ? null : k === q.a); Store.save();
    viewQuiz();
  }));
  v.querySelector('[data-act="fav"]').onclick = (e) => { const on = Store.toggleFav(q.id); e.currentTarget.classList.toggle('on', on); e.currentTarget.textContent = on ? '★' : '☆'; };
  const act = (n, f) => { const b = v.querySelector(`[data-act="${n}"]`); if (b) b.onclick = f; };
  act('reveal', () => { Session.revealed = true; viewQuiz(); document.getElementById('expbox').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  act('next', () => { if (last) finishSession(); else { Session.i++; Session.revealed = false; viewQuiz(); window.scrollTo(0, 0); } });
  act('end', () => { if (confirm('প্র্যাকটিস এখানেই শেষ করবেন?')) finishSession(); });
}

/* ---------- মক টেস্ট ---------- */
const mockSetup = { by: 'exam', b: 50, n: 100 };
function viewMockSetup() {
  const exams = Object.keys(BANK.exams).map(Number);
  $view().innerHTML = `
  <h1>মক টেস্ট</h1>
  <p class="muted small">আসল পরীক্ষার মতো: সময় বাঁধা, প্রতি ভুলে <b>০.৫ নম্বর কাটা</b>, আর ব্যাখ্যা দেখাবে পরীক্ষা শেষে।</p>
  <div class="seg">
    <button data-by="exam" class="${mockSetup.by === 'exam' ? 'on' : ''}">পূর্ণ BCS প্রশ্নপত্র</button>
    <button data-by="mixed" class="${mockSetup.by === 'mixed' ? 'on' : ''}">মিশ্র মডেল টেস্ট</button>
  </div>
  <section class="card">
  ${mockSetup.by === 'exam' ? `<h2>কোন বছরের প্রশ্নপত্র?</h2><div class="list">${exams.map((b) => {
    const e = BANK.exams[b];
    return `<button class="pick ${mockSetup.b === b ? 'on' : ''}" data-b="${b}"><span>${bcsLabel(b)} <small class="muted">· সেট: ${esc(e.set)}</small></span><small>${bn(e.count)}টি · ${bn(e.count * SEC_PER_Q / 60)} মিনিট</small></button>`;
  }).join('')}</div>`
    : `<h2>কয়টি প্রশ্ন?</h2><div class="chips">${[50, 100, 200].map((n) => `<button class="chip ${mockSetup.n === n ? 'on' : ''}" data-n="${n}">${bn(n)}টি · ${bn(n * SEC_PER_Q / 60)} মিনিট</button>`).join('')}</div>
       <p class="small muted" style="margin-top:10px">সব বিষয় থেকে, আগে আপনার না-দেখা প্রশ্ন।</p>`}
  </section>
  <div class="sticky-actions"><button class="btn primary" data-act="start">পরীক্ষা শুরু করুন →</button></div>`;
  const v = $view();
  v.querySelectorAll('[data-by]').forEach((b) => (b.onclick = () => { mockSetup.by = b.dataset.by; viewMockSetup(); }));
  v.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => { mockSetup.b = +b.dataset.b; viewMockSetup(); }));
  v.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { mockSetup.n = +b.dataset.n; viewMockSetup(); }));
  v.querySelector('[data-act="start"]').onclick = () => {
    let qs, label;
    if (mockSetup.by === 'exam') { qs = BANK.questions.filter((q) => q.b === mockSetup.b); label = `${bcsLabel(mockSetup.b)} প্রশ্নপত্র`; }
    else {
      qs = pickQuestions(BANK.questions, mockSetup.n).qs;
      qs.sort((a, b) => SUBJ_ORDER.indexOf(a.s) - SUBJ_ORDER.indexOf(b.s));
      label = `মিশ্র মডেল টেস্ট (${bn(qs.length)})`;
    }
    Object.assign(Session, { mode: 'mock', qs, i: 0, ans: new Array(qs.length).fill(null), label, recycled: 0, start: Date.now(), limit: qs.length * SEC_PER_Q });
    go('mocktest');
  };
}

function stopMockTimer() { clearInterval(Session.mockTimer); Session.mockTimer = null; }
function viewMockTest() {
  if (Session.mode !== 'mock') { go('mock'); return; }
  const qs = Session.qs;
  $view().innerHTML = `
  <div class="timer" id="timer"><span class="small">${esc(Session.label)}</span><b id="clock"></b></div>
  <section class="card">${qs.map((q, i) => `
    <div class="mq" id="mq${i}">
      <div class="meta">${bn(i + 1)}. <span class="tag">${bcsLabel(q.b)}</span> ${esc(SUBJ[q.s])}</div>
      <div class="qtext">${esc(q.q)}</div>${qImgHTML(q)}
      <div class="opts">${q.o.map((o, k) => `<button class="opt ${Session.ans[i] === k ? 'sel' : ''}" data-i="${i}" data-k="${k}"><span class="l">${LETTERS[k]}</span><span class="t">${esc(o)}</span></button>`).join('')}</div>
    </div>`).join('')}
  </section>
  <div class="sticky-actions"><button class="btn primary" data-act="submit">জমা দিন (<span id="cnt">${bn(Session.ans.filter((a) => a !== null).length)}</span>/${bn(qs.length)})</button></div>`;
  const v = $view();
  v.querySelectorAll('.opt').forEach((b) => (b.onclick = () => {
    const i = +b.dataset.i, k = +b.dataset.k;
    Session.ans[i] = Session.ans[i] === k ? null : k; // আবার চাপলে উত্তর মুছে যায়
    v.querySelectorAll(`[data-i="${i}"]`).forEach((x) => x.classList.toggle('sel', Session.ans[i] === +x.dataset.k));
    document.getElementById('cnt').textContent = bn(Session.ans.filter((a) => a !== null).length);
  }));
  v.querySelector('[data-act="submit"]').onclick = () => {
    const left = Session.ans.filter((a) => a === null).length;
    if (confirm(left ? `${bn(left)}টি প্রশ্ন উত্তর ছাড়া আছে। জমা দেবেন?` : 'জমা দেবেন?')) submitMock();
  };
  const tick = () => {
    const rem = Session.limit - Math.floor((Date.now() - Session.start) / 1000);
    const c = document.getElementById('clock'); if (!c) return;
    c.textContent = fmtTime(Math.max(rem, 0));
    document.getElementById('timer').classList.toggle('low', rem < 300);
    if (rem <= 0) { stopMockTimer(); alert('সময় শেষ! উত্তরপত্র জমা হয়ে গেল।'); submitMock(); }
  };
  stopMockTimer(); tick(); Session.mockTimer = setInterval(tick, 1000);
}
function submitMock() {
  stopMockTimer();
  Session.qs.forEach((q, i) => { const k = Session.ans[i]; if (k !== null) Store.record(q.id, q.a == null ? null : k === q.a); });
  finishSession();
}

/* ---------- ফলাফল ---------- */
let lastResult = null;
function finishSession() {
  stopMockTimer();
  const { qs, ans, mode, label } = Session;
  let c = 0, w = 0, s = 0; const bySub = {};
  qs.forEach((q, i) => {
    const k = ans[i], b = bySub[q.s] || (bySub[q.s] = { c: 0, w: 0, s: 0 });
    if (k === null) { s++; b.s++; } else if (q.a == null) { /* গণনায় নেই */ } else if (k === q.a) { c++; b.c++; } else { w++; b.w++; }
  });
  const score = c - (mode === 'mock' ? w * NEG_MARK : 0);
  lastResult = { mode, label, qs, ans, c, w, s, score, bySub, secs: Math.round((Date.now() - Session.start) / 1000), date: Date.now() };
  Store.data.history.unshift({ mode, label, n: qs.length, c, w, s, score, date: lastResult.date });
  Store.data.history = Store.data.history.slice(0, 100);
  Store.save();
  Session.mode = null;
  go('result');
}
function viewResult() {
  const r = lastResult;
  if (!r) { go(''); return; }
  const answered = r.c + r.w;
  const rows = SUBJ_ORDER.filter((s) => r.bySub[s]).map((s) => {
    const b = r.bySub[s];
    return `<tr><td>${esc(SUBJ[s])}</td><td class="num">${bn(b.c)}</td><td class="num">${bn(b.w)}</td><td class="num">${bn(b.s)}</td></tr>`;
  }).join('');
  const reviewIdx = r.qs.map((q, i) => i).filter((i) => r.mode === 'mock' || (r.ans[i] !== null && r.ans[i] !== r.qs[i].a));
  const wrongIds = r.qs.filter((q, i) => r.ans[i] !== null && q.a != null && r.ans[i] !== q.a).map((q) => q.id);
  $view().innerHTML = `
  <section class="card score">
    <div class="muted small">${esc(r.label)}</div>
    <div class="big">${bn(Number.isInteger(r.score) ? r.score : r.score.toFixed(1))}<small class="muted" style="font-size:1rem"> / ${bn(r.qs.length)}</small></div>
    <p class="muted small">${r.mode === 'mock' ? `ভুলের জন্য কাটা গেছে ${bn((r.w * NEG_MARK).toString())} · ` : ''}সময়: ${fmtTime(r.secs)}</p>
    <div class="grid2" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><b style="color:var(--ok)">${bn(r.c)}</b><span>সঠিক</span></div>
      <div class="stat"><b style="color:var(--bad)">${bn(r.w)}</b><span>ভুল</span></div>
      <div class="stat"><b>${bn(r.s)}</b><span>বাদ</span></div>
    </div>
    <p class="small" style="margin-top:10px">যেগুলোর উত্তর দিয়েছেন তার <b>${bn(pct(r.c, answered))}%</b> সঠিক।</p>
  </section>
  <section class="row" style="margin-bottom:14px">
    ${wrongIds.length ? `<button class="btn primary" style="flex:1" data-act="redo">ভুলগুলো আবার দিন</button>` : ''}
    <a class="btn" style="flex:1" href="#/guide">📘 বিগত প্রশ্ন সংকলন</a>
  </section>
  ${(() => {
    if (!wrongIds.length) return '';
    const withNote = [...new Set(wrongIds.map((id) => BY_ID[id]).filter((q) => hasNote(q.s, q.t)).map((q) => q.s + '|' + q.t))];
    return withNote.length
      ? `<section class="card"><h2>📗 ভুল হওয়া টপিকের স্টাডি নোট</h2><p class="small muted">এই সেশনে যে ${bn(withNote.length)}টি টপিকে ভুল হয়েছে, সেগুলোর নিয়ম আর মূল কথা।</p><a class="btn primary block" href="#/notes/mine">নোট পড়ুন / PDF করুন</a></section>`
      : `<p class="note small" style="margin-bottom:14px">📗 যে টপিকগুলোতে ভুল হয়েছে, সেগুলোর <b>স্টাডি নোট</b> শীঘ্রই এখানে পাবেন।</p>`;
  })()}
  <section class="card"><h2>বিষয়ভিত্তিক ফলাফল</h2>
    <table><thead><tr><th>বিষয়</th><th class="num">সঠিক</th><th class="num">ভুল</th><th class="num">বাদ</th></tr></thead><tbody>${rows}</tbody></table>
  </section>
  <section class="card"><h2>${r.mode === 'mock' ? 'সব প্রশ্নের ব্যাখ্যা' : 'যে প্রশ্নগুলো ভুল হয়েছে'}</h2>
    ${reviewIdx.length ? reviewIdx.map((i) => reviewItem(r.qs[i], r.ans[i])).join('') : '<p class="empty">কোনো ভুল নেই — চমৎকার! 🎉</p>'}
  </section>`;
  const b = $view().querySelector('[data-act="redo"]');
  if (b) b.onclick = () => startPractice(wrongIds.map((id) => BY_ID[id]), 'ভুলগুলো আবার');
  bindFavButtons();
}
function reviewItem(q, chosen) {
  const state = chosen === undefined ? '' : chosen === null ? '<span class="muted">উত্তর দেননি</span>'
    : q.a == null ? '<span class="muted">কোনো অপশন সঠিক নয়</span>'
      : chosen === q.a ? '<span class="pct ok">✔ সঠিক</span>' : `<span class="pct bad">✘ আপনার উত্তর: (${LETTERS[chosen]}) ${esc(q.o[chosen])}</span>`;
  const fav = Store.isFav(q.id);
  return `<details class="rel" style="margin:0 0 8px">
    <summary>${metaLine(q)} ${esc(q.q || 'চিত্রভিত্তিক প্রশ্ন')}</summary>
    <div class="spread"><div class="small">${state}</div><span class="qtools">${reportBtn(q)}<button class="star ${fav ? 'on' : ''}" data-fav="${q.id}" aria-label="ফেভারিট">${fav ? '★' : '☆'}</button></span></div>
    ${qImgHTML(q)}
    <p class="ans" style="color:var(--ok);font-weight:600">সঠিক উত্তর: ${esc(ansText(q))}</p>
    <div class="exp">${expHTML(q)}</div>
  </details>`;
}
function bindFavButtons() {
  $view().querySelectorAll('[data-fav]').forEach((b) => (b.onclick = (e) => {
    e.preventDefault();
    const on = Store.toggleFav(b.dataset.fav); b.classList.toggle('on', on); b.textContent = on ? '★' : '☆';
  }));
}

/* ---------- আমার খাতা: ভুল, ফেভারিট, ইতিহাস ---------- */
let nbTab = 'wrong';
function viewNotebook() {
  const att = Store.data.attempts;
  const wrong = BANK.questions.filter((q) => att[q.id] && att[q.id].ok === false);
  const fav = Store.data.fav.map((id) => BY_ID[id]).filter(Boolean);
  const hist = Store.data.history;
  const list = nbTab === 'wrong' ? wrong : fav;
  $view().innerHTML = `
  <h1>আমার খাতা</h1>
  <div class="seg">
    <button data-tab="wrong" class="${nbTab === 'wrong' ? 'on' : ''}">ভুল (${bn(wrong.length)})</button>
    <button data-tab="fav" class="${nbTab === 'fav' ? 'on' : ''}">ফেভারিট (${bn(fav.length)})</button>
    <button data-tab="hist" class="${nbTab === 'hist' ? 'on' : ''}">ইতিহাস (${bn(hist.length)})</button>
  </div>
  <a class="btn block" href="#/guide" style="margin-bottom:14px">📘 বিগত প্রশ্ন সংকলন (PDF)</a>
  ${nbTab === 'hist' ? `<section class="card">${hist.length ? `<table><thead><tr><th>পরীক্ষা</th><th class="num">ফল</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${esc(h.label)}<div class="small muted">${new Date(h.date).toLocaleDateString('bn-BD')} · ${h.mode === 'mock' ? 'মক টেস্ট' : 'প্র্যাকটিস'}</div></td><td class="num">${bn(h.c)}/${bn(h.n)}${h.mode === 'mock' ? `<div class="small muted">নম্বর ${bn(h.score)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">এখনো কোনো পরীক্ষা দেননি।</p>'}</section>`
    : `<section class="card">
      ${list.length ? `<button class="btn primary block" data-act="practice" style="margin-bottom:12px">এগুলো প্র্যাকটিস করুন</button>${list.map((q) => reviewItem(q, undefined)).join('')}`
        : `<p class="empty">${nbTab === 'wrong' ? 'কোনো ভুল প্রশ্ন জমা নেই।' : 'প্রশ্নের পাশের ☆ চাপলে এখানে জমা থাকবে — যেগুলো আন্দাজে মিলেছে বা আবার পড়তে চান।'}</p>`}
    </section>`}`;
  const v = $view();
  v.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { nbTab = b.dataset.tab; viewNotebook(); }));
  const p = v.querySelector('[data-act="practice"]');
  if (p) p.onclick = () => startPractice(shuffle(list).slice(0, 50), nbTab === 'wrong' ? 'আমার ভুল প্রশ্ন' : 'ফেভারিট প্রশ্ন');
  bindFavButtons();
}

/* ---------- বিগত প্রশ্ন সংকলন (টপিক ধরে আগের বছরের সব প্রশ্ন) ---------- */
let guideSubj = '';
function viewGuide() {
  const att = Store.data.attempts;
  const { weak } = topicStats();
  // ব্যক্তিগত: দুর্বল টপিক + যেসব টপিকে শেষবার ভুল করেছেন
  const keys = new Map();
  weak.forEach((m) => keys.set(m.s + '|' + m.t, m));
  BANK.questions.forEach((q) => { if (att[q.id] && att[q.id].ok === false) { const k = q.s + '|' + q.t; if (!keys.has(k)) keys.set(k, { s: q.s, t: q.t }); } });
  const personal = [...keys.values()];
  const topics = guideSubj
    ? [...new Set(BANK.questions.filter((q) => q.s === guideSubj).map((q) => q.t))].map((t) => ({ s: guideSubj, t }))
    : personal;
  const title = guideSubj ? `বিগত প্রশ্ন সংকলন — ${SUBJ[guideSubj]}` : 'বিগত প্রশ্ন সংকলন — আমার দুর্বল টপিক';
  const body = topics.map(({ s, t }) => {
    const qs = BANK.questions.filter((q) => q.s === s && q.t === t).sort((a, b) => a.u.localeCompare(b.u, 'bn') || a.b - b.b);
    let mine = 0, ok = 0; qs.forEach((q) => { const a = att[q.id]; if (a) { mine += a.c + a.w; ok += a.c; } });
    let lastSub = '';
    return `<section class="card guide-topic"><h2>${esc(t)}</h2>
      <p class="small muted">${esc(SUBJ[s])} · গত ১০ বছরে এই টপিক থেকে <b>${bn(qs.length)}টি</b> প্রশ্ন${mine ? ` · আপনার সঠিকের হার ${bn(pct(ok, mine))}%` : ''}</p>
      ${qs.map((q) => {
        const head = q.u !== lastSub ? `<h3 style="margin-top:12px">▸ ${esc(q.u)}</h3>` : ''; lastSub = q.u;
        const wasWrong = att[q.id] && att[q.id].ok === false;
        return `${head}<div class="guide-q"><div class="small muted">${bcsLabel(q.b)} · প্রশ্ন ${bn(q.n)}${wasWrong ? ' · <b style="color:var(--bad)">আপনি ভুল করেছিলেন</b>' : ''}</div>
          <div><b>${esc(q.q || 'চিত্রভিত্তিক প্রশ্ন')}</b></div>${qImgHTML(q)}
          <div class="ans">উত্তর: ${esc(ansText(q))}</div><div class="exp">${expHTML(q)}</div></div>`;
      }).join('')}</section>`;
  }).join('');
  $view().innerHTML = `
  <div class="no-print">
    <h1>বিগত প্রশ্ন সংকলন</h1>
    <p class="muted small">যে টপিকে ভুল করেছেন, সেই টপিক থেকে গত ১০টি BCS-এ আসা <b>সব</b> প্রশ্ন, উত্তর আর ব্যাখ্যা এক জায়গায়। চাইলে একটা পুরো বিষয়ের সংকলনও দেখতে পারেন।</p>
    <div class="chips" style="margin-bottom:12px">
      <button class="chip ${!guideSubj ? 'on' : ''}" data-g="">আমার দুর্বল টপিক</button>
      ${SUBJ_ORDER.map((s) => `<button class="chip ${guideSubj === s ? 'on' : ''}" data-g="${s}">${esc(SUBJ[s])}</button>`).join('')}
    </div>
    ${topics.length ? `<button class="btn primary block" data-act="print" style="margin-bottom:14px">⬇ PDF হিসেবে সেভ / প্রিন্ট করুন</button>` : ''}
  </div>
  <div class="only-print"><h1>রিপিট — ${esc(title)}</h1><p>${new Date().toLocaleDateString('bn-BD')}</p></div>
  ${topics.length ? body : `<p class="card empty">এখনো কোনো দুর্বল টপিক পাওয়া যায়নি। কিছু প্র্যাকটিস করুন, অথবা উপর থেকে একটা বিষয় বেছে সেই বিষয়ের পুরো সংকলন দেখুন।</p>`}`;
  const v = $view();
  v.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { guideSubj = b.dataset.g; viewGuide(); }));
  const p = v.querySelector('[data-act="print"]');
  if (p) p.onclick = () => { alert('প্রিন্ট উইন্ডোতে “Save as PDF” বেছে নিন।'); window.print(); };
}

/* ---------- স্টাডি নোট পেজ: #/notes (মাস্টার), #/notes/BL, #/notes/BL/টপিক, #/notes/mine (ব্যক্তিগত) ---------- */
let notesSubj = null;
function myWeakNoteTopics() {
  const att = Store.data.attempts, seen = new Map();
  const { weak } = topicStats();
  weak.forEach((m) => { if (hasNote(m.s, m.t)) seen.set(m.s + '|' + m.t, { s: m.s, t: m.t }); });
  BANK.questions.forEach((q) => {
    if (att[q.id] && att[q.id].ok === false && hasNote(q.s, q.t)) seen.set(q.s + '|' + q.t, { s: q.s, t: q.t });
  });
  return [...seen.values()].sort((a, b) => SUBJ_ORDER.indexOf(a.s) - SUBJ_ORDER.indexOf(b.s));
}
function noteTopicHTML(s, t, idx) {
  const qs = BANK.questions.filter((q) => q.s === s && q.t === t);
  const years = [...new Set(qs.map((q) => q.b))].sort((a, b) => a - b);
  return `<section class="card guide-topic note-body" id="nt-${idx}">
    <div class="small muted">${esc(SUBJ[s])}</div>
    <h2>${esc(t)}</h2>
    <p class="small muted">গত ১০টি BCS-এ এই টপিক থেকে <b>${bn(qs.length)}টি</b> প্রশ্ন এসেছে (${years.map((b) => bn(b)).join(', ')}তম)।</p>
    ${NOTES[s][t]}
    <div class="row no-print" style="margin-top:12px">
      <button class="btn" style="flex:1" data-prac="${s}|${esc(t)}">✎ এই টপিক প্র্যাকটিস</button>
      <a class="btn" style="flex:1" href="#/guide">📘 বিগত প্রশ্ন সংকলন</a>
    </div>
  </section>`;
}
function viewNotes(rest) {
  const ready = readySubjects();
  const mode = rest[0] === 'mine' ? 'mine' : 'master';
  if (rest[0] && rest[0] !== 'mine' && NOTES[rest[0]]) notesSubj = rest[0];
  if (!notesSubj || !ready.includes(notesSubj)) notesSubj = ready[0] || null;
  const focus = rest[1] ? decodeURIComponent(rest[1]) : null;
  let topics = [];
  if (mode === 'mine') topics = myWeakNoteTopics();
  else if (notesSubj) topics = Object.keys(NOTES[notesSubj]).map((t) => ({ s: notesSubj, t }));
  const title = mode === 'mine' ? 'আমার দুর্বল টপিকের স্টাডি নোট' : `স্টাডি নোট — ${notesSubj ? SUBJ[notesSubj] : ''}`;
  const index = topics.length > 1 ? `<section class="card no-print"><h3>সূচিপত্র</h3><ol class="toc">${topics.map((x, i) => `<li><a href="#" data-jump="${i}">${esc(x.t)}</a>${mode === 'mine' ? ` <small class="muted">· ${esc(SUBJ[x.s])}</small>` : ''}</li>`).join('')}</ol></section>` : '';
  $view().innerHTML = `
  <div class="no-print">
    <h1>স্টাডি নোট</h1>
    <p class="muted small">প্রতিটা টপিকের নিয়ম, চেনার উপায় আর গুরুত্বপূর্ণ উদাহরণ সংক্ষেপে। গত ১০ বছরের BCS-এ যা যা এসেছে, তার সবকিছু এখানে আছে।</p>
    <div class="seg">
      <button data-nm="master" class="${mode === 'master' ? 'on' : ''}">পুরো নোট</button>
      <button data-nm="mine" class="${mode === 'mine' ? 'on' : ''}">আমার দুর্বল টপিক</button>
    </div>
    ${mode === 'master' ? `<div class="chips scroll" id="subjrow" style="margin-bottom:12px">${SUBJ_ORDER.map((s) => ready.includes(s)
      ? `<button class="chip ${notesSubj === s ? 'on' : ''}" data-ns="${s}">${esc(SUBJ[s])}</button>`
      : `<button class="chip" disabled title="শীঘ্রই আসছে">${esc(SUBJ[s])} · শীঘ্রই</button>`).join('')}</div>` : ''}
    ${topics.length ? `<button class="btn primary block" data-act="print" style="margin-bottom:14px">⬇ PDF হিসেবে সেভ / প্রিন্ট করুন</button>` : ''}
  </div>
  <div class="only-print"><h1>রিপিট — ${esc(title)}</h1><p>${new Date().toLocaleDateString('bn-BD')} · shahriar799.github.io/repeat</p></div>
  ${topics.length ? index + topics.map((x, i) => noteTopicHTML(x.s, x.t, i)).join('')
    : `<p class="card empty">${mode === 'mine' ? 'এখনো কোনো দুর্বল টপিক পাওয়া যায়নি, অথবা আপনার ভুল টপিকগুলোর নোট এখনো তৈরি হয়নি। কিছু প্র্যাকটিস করুন, অথবা “পুরো নোট” দেখুন।' : 'স্টাডি নোট শীঘ্রই আসছে।'}</p>`}`;
  const v = $view();
  v.querySelectorAll('[data-nm]').forEach((b) => (b.onclick = () => go(b.dataset.nm === 'mine' ? 'notes/mine' : 'notes')));
  v.querySelectorAll('[data-ns]').forEach((b) => (b.onclick = () => go('notes/' + b.dataset.ns)));
  v.querySelectorAll('[data-jump]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); document.getElementById('nt-' + a.dataset.jump).scrollIntoView({ behavior: 'smooth' }); }));
  v.querySelectorAll('[data-prac]').forEach((b) => (b.onclick = () => {
    const [s, t] = b.dataset.prac.split('|');
    Object.assign(setup, { by: 'topic', s, t });
    const { qs, recycled } = pickQuestions(poolFor(setup), setup.n);
    startPractice(qs, t, recycled);
  }));
  const p = v.querySelector('[data-act="print"]');
  if (p) p.onclick = () => { alert('প্রিন্ট উইন্ডোতে “Save as PDF” বেছে নিন।'); window.print(); };
  const onChip = v.querySelector('#subjrow .chip.on');
  if (onChip) onChip.parentElement.scrollLeft = onChip.offsetLeft - onChip.parentElement.offsetLeft - 8;
  if (focus) {
    const i = topics.findIndex((x) => x.t === focus);
    if (i >= 0) setTimeout(() => document.getElementById('nt-' + i).scrollIntoView(), 50);
  }
}

/* ---------- সম্পর্কে ---------- */
function viewAbout() {
  $view().innerHTML = `<section class="card">
    <h1>রিপিট সম্পর্কে</h1>
    <p>রিপিট একটি সম্পূর্ণ ফ্রি প্ল্যাটফর্ম। এখানে ৪১তম থেকে ৫০তম BCS প্রিলিমিনারির ${bn(BANK.questions.length)}টি প্রশ্ন উত্তর ও ব্যাখ্যাসহ আছে, প্রতিটি প্রশ্ন বিষয় ও টপিক অনুযায়ী সাজানো।</p>
    <p>১ম থেকে ২০তম, যে গ্রেডের চাকরিই হোক, প্রস্তুতি শুরু হয় বিগত বছরের প্রশ্ন দিয়ে, আর BCS-এর এই টপিকগুলো থেকেই প্রশ্ন ঘুরে ফিরে আসে। তাই নাম “রিপিট”।</p>
    <p class="note">আপনার প্রোগ্রেস এখন এই ডিভাইসের ব্রাউজারে জমা থাকে। শিগগিরই Google দিয়ে লগইন যোগ হবে, তখন মোবাইল আর পিসি দুই জায়গাতেই একই প্রোগ্রেস দেখা যাবে।</p>
    <p class="small muted">কোনো উত্তর বা ব্যাখ্যায় ভুল পেলে প্রশ্নের পাশের “⚑ ভুল জানান” চাপুন, অথবা নিচের WhatsApp-এ জানান।</p>
    <button class="btn" data-act="reset">আমার সব প্রোগ্রেস মুছে ফেলুন</button>
  </section>${makerHTML()}`;
  $view().querySelector('[data-act="reset"]').onclick = () => {
    if (confirm('সব উত্তর, ভুল, ফেভারিট আর ইতিহাস মুছে যাবে। নিশ্চিত?')) { Store.data = { attempts: {}, fav: [], history: [] }; Store.save(); go(''); }
  };
}

/* ---------- শুরু ---------- */
async function boot() {
  Store.load();
  try {
    const r = await fetch('data/bank.json');
    BANK = await r.json();
  } catch (e) {
    $view().innerHTML = '<p class="card empty">প্রশ্নব্যাংক লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।</p>';
    return;
  }
  SUBJ = BANK.subjects;
  BANK.questions.forEach((q) => (BY_ID[q.id] = q));
  try { NOTES = await (await fetch('data/notes.json')).json(); } catch (e) { NOTES = {}; }
  window.addEventListener('hashchange', render);
  window.addEventListener('beforeunload', (e) => { if (Session.mode) { e.preventDefault(); e.returnValue = ''; } });
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // নতুন ভার্সন এলে একবার রিলোড, যাতে পুরনো কোড না চলে (পরীক্ষার মাঝখানে হলে পরে)
    const hadOld = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadOld || reloaded) return;
      reloaded = true;
      if (Session.mode) window.__updateReady = true; else location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
}
boot();
