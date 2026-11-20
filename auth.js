/* রিপিট: Google লগইন, ভিজিটর গোনা, অগ্রগতি sync আর অ্যাডমিন (Firebase)।
   app.js থেকে আলাদা মডিউল, যাতে Firebase লোড না হলেও (অফলাইন) অ্যাপ চলে।
   অ্যাপ এটা ব্যবহার করে window.RA দিয়ে; বদল হলে window-এ 'ra-change' ইভেন্ট আসে। */
const V = '13.1.0';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;
const { initializeApp } = await import(`${CDN}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } = await import(`${CDN}/firebase-auth.js`);
const {
  getFirestore, doc, getDoc, setDoc, serverTimestamp, increment, collection, getDocs,
  getCountFromServer, query, where, orderBy, limit, Timestamp,
} = await import(`${CDN}/firebase-firestore.js`);

// ওয়েব কনফিগ: এটা গোপন নয়, ডাটা সুরক্ষিত থাকে Firestore-এর নিয়ম দিয়ে
const app = initializeApp({
  apiKey: 'AIzaSyBB3KoO1_cSztiqxoKCkuP4cD6iVXT5It8',
  authDomain: 'repeat---bcs.firebaseapp.com',
  projectId: 'repeat---bcs',
  storageBucket: 'repeat---bcs.firebasestorage.app',
  messagingSenderId: '164364141421',
  appId: '1:164364141421:web:102e71c1d1ae38572f1064',
  measurementId: 'G-4ZW4HCFX6J',
});
const auth = getAuth(app);
const db = getFirestore(app);

// Google Analytics: দিনে কতজন আসছে, কোথা থেকে (localhost-এ বন্ধ)
if (!/^(localhost|127\.)/.test(location.hostname)) {
  import(`${CDN}/firebase-analytics.js`).then(async (m) => { if (await m.isSupported()) m.getAnalytics(app); }).catch(() => {});
}

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* প্রাইভেট মোড */ } },
};
const emit = () => window.dispatchEvent(new CustomEvent('ra-change'));
const App = () => window.RepeatApp;

/* ---------- ভিজিটর গোনা: প্রতিটি ডিভাইস একবার, দিনে একবার হালনাগাদ ---------- */
function randomId() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
let vid = ls.get('repeat.vid');
if (!vid) { vid = randomId(); ls.set('repeat.vid', vid); }
async function countVisit() {
  const d = new Date(), today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; // ফোনের স্থানীয় তারিখ
  if (ls.get('repeat.vday') === today) return;
  const data = { last: serverTimestamp(), days: increment(1) };
  const created = ls.get('repeat.vcreated') === '1';
  if (!created) data.first = serverTimestamp(); // ঘরটা প্রথমবার সফলভাবে তৈরি না হওয়া পর্যন্ত
  try {
    await setDoc(doc(db, 'visitors', vid), data, { merge: true });
    ls.set('repeat.vday', today); ls.set('repeat.vcreated', '1');
  } catch (e) { /* নেট নেই বা নিয়ম আটকেছে */ }
}
countVisit();

/* ---------- অবস্থা ---------- */
const RA = {
  ready: false, user: null, profile: null, isAdmin: null, syncState: '',
  inAppBrowser: /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|; wv\)/i.test(navigator.userAgent),
};

/* ---------- লগইন / লগআউট ---------- */
RA.login = async () => {
  if (RA.inAppBrowser) throw Object.assign(new Error('in-app'), { code: 'in-app' });
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
};
RA.logout = async () => { await flushSync(); await signOut(auth); };

/* ---------- প্রোফাইল ---------- */
RA.saveProfile = async ({ whatsapp, bcs, consent }) => {
  const u = RA.user; if (!u) return;
  const wa = (whatsapp || '').replace(/[^\d+]/g, '').slice(0, 15);
  const data = {
    whatsapp: wa, hasWa: !!wa, bcs: bcs || '', consent: !!consent, profileDone: true,
    consentAt: consent ? serverTimestamp() : null,
  };
  await setDoc(doc(db, 'users', u.uid), data, { merge: true });
  RA.profile = Object.assign({}, RA.profile, data, { consentAt: consent ? new Date() : null });
  emit();
};

/* ---------- অগ্রগতি sync ---------- */
/* "সব মুছুন"-এর সময় (wipedAt) যে দিকে পুরনো, সেই দিকের মোছার আগের ডেটা বাদ যায়,
   যাতে অন্য ডিভাইসের পুরনো প্রোগ্রেস আবার ফিরে না আসে। */
function sinceWipe(d, w) {
  if (!w || (d.wipedAt || 0) >= w) return d;
  const att = {};
  for (const [id, a] of Object.entries(d.attempts || {})) if ((a.last || 0) > w) att[id] = a;
  return { attempts: att, fav: [], history: (d.history || []).filter((h) => new Date(h.date).getTime() > w),
    box: {}, mastered: {}, round: 1, roundStart: 0, wipedAt: w };
}
function mergeData(local0, remote0) {
  const w = Math.max(local0.wipedAt || 0, remote0.wipedAt || 0);
  const local = sinceWipe(local0, w), remote = sinceWipe(remote0, w);
  const out = { attempts: Object.assign({}, remote.attempts || {}), fav: [], history: [] };
  for (const [id, a] of Object.entries(local.attempts || {})) {
    const r = out.attempts[id];
    if (!r || (a.n || 0) > (r.n || 0) || ((a.n || 0) === (r.n || 0) && (a.last || 0) > (r.last || 0))) out.attempts[id] = a;
  }
  out.fav = [...new Set([...(local.fav || []), ...(remote.fav || [])])];
  const seen = new Set();
  out.history = [...(local.history || []), ...(remote.history || [])]
    .filter((h) => { const k = String(h.date) + h.label; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => (new Date(y.date) - new Date(x.date))).slice(0, 200);
  /* ৫ বক্স: যে দিকে প্রশ্নটার উত্তর পরে দেওয়া হয়েছে, বক্সের অবস্থা সেই দিকের */
  out.box = {}; out.mastered = {};
  const lb = local.box || {}, rb = remote.box || {}, lm = local.mastered || {}, rm = remote.mastered || {};
  const last = (d, id) => ((d.attempts || {})[id] || {}).last || 0;
  for (const id of new Set([...Object.keys(lb), ...Object.keys(rb), ...Object.keys(lm), ...Object.keys(rm)])) {
    const useLocal = last(local, id) >= last(remote, id);
    const [b1, m1, b2, m2] = useLocal ? [lb, lm, rb, rm] : [rb, rm, lb, lm];
    if (b1[id]) out.box[id] = b1[id];
    else if (m1[id]) out.mastered[id] = m1[id];
    else if (b2[id]) out.box[id] = b2[id];
    else if (m2[id]) out.mastered[id] = m2[id];
  }
  out.round = Math.max(local.round || 1, remote.round || 1);
  out.roundStart = Math.max(local.roundStart || 0, remote.roundStart || 0);
  if (w) out.wipedAt = w;
  return out;
}
let syncTimer = null, dirty = false;
async function pushNow() {
  const u = RA.user, A = App(); if (!u || !A || !dirty) return;
  dirty = false;
  try {
    await setDoc(doc(db, 'progress', u.uid), { data: JSON.stringify(A.Store.data), updated: serverTimestamp() });
    RA.syncState = 'saved';
  } catch (e) { dirty = true; RA.syncState = 'error'; }
}
async function flushSync() { clearTimeout(syncTimer); await pushNow(); }
RA.queueSync = () => {
  if (!RA.user) return;
  dirty = true; clearTimeout(syncTimer); syncTimer = setTimeout(pushNow, 8000);
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSync(); });

async function pullAndMerge(uid) {
  const A = App(); if (!A) return;
  try {
    const snap = await getDoc(doc(db, 'progress', uid));
    if (snap.exists()) {
      const remote = JSON.parse(snap.data().data || '{}');
      A.Store.data = mergeData(A.Store.data, remote);
      A.Store.save(true);
    }
    dirty = true; await pushNow();
    A.rerender && A.rerender();
  } catch (e) { RA.syncState = 'error'; }
}

/* ---------- লগইন অবস্থার বদল ---------- */
onAuthStateChanged(auth, async (u) => {
  RA.user = u ? { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' } : null;
  RA.profile = null; RA.isAdmin = null;
  if (u) {
    try {
      const ref = doc(db, 'users', u.uid);
      const snap = await getDoc(ref);
      const base = { name: u.displayName || '', email: u.email || '', photo: u.photoURL || '', lastLogin: serverTimestamp() };
      if (!snap.exists()) Object.assign(base, { created: serverTimestamp(), profileDone: false, whatsapp: '', hasWa: false, bcs: '', consent: false });
      await setDoc(ref, base, { merge: true });
      RA.profile = Object.assign({}, snap.exists() ? snap.data() : {}, base);
      setDoc(doc(db, 'visitors', vid), { li: true, last: serverTimestamp() }, { merge: true }).catch(() => {});
    } catch (e) { RA.profile = { profileDone: true }; }
    pullAndMerge(u.uid);
  }
  RA.ready = true;
  emit();
});

/* ---------- অ্যাডমিন (Firestore-এর নিয়ম শুধু অ্যাডমিন Gmail-কে পড়তে দেয়) ---------- */
RA.checkAdmin = async () => {
  if (!RA.user) return false;
  if (RA.isAdmin !== null) return RA.isAdmin;
  try { await getCountFromServer(collection(db, 'users')); RA.isAdmin = true; } catch (e) { RA.isAdmin = false; }
  return RA.isAdmin;
};
RA.adminStats = async () => {
  const startOf = (days) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - days); return Timestamp.fromDate(d); };
  const c = async (q) => (await getCountFromServer(q)).data().count;
  const V_ = collection(db, 'visitors'), U = collection(db, 'users');
  const [visitors, visitorsLoggedIn, visitorsToday, visitors7, users, usersToday, users7, withWa, consent] = await Promise.all([
    c(V_), c(query(V_, where('li', '==', true))), c(query(V_, where('last', '>=', startOf(0)))), c(query(V_, where('first', '>=', startOf(6)))),
    c(U), c(query(U, where('created', '>=', startOf(0)))), c(query(U, where('created', '>=', startOf(6)))),
    c(query(U, where('hasWa', '==', true))), c(query(U, where('consent', '==', true))),
  ]);
  return { visitors, visitorsLoggedIn, visitorsToday, visitors7, users, usersToday, users7, withWa, consent };
};
RA.adminUsers = async () => {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('created', 'desc'), limit(2000)));
  return snap.docs.map((d) => {
    const x = d.data();
    const t = (v) => (v && v.toDate ? v.toDate() : null);
    return { name: x.name || '', email: x.email || '', whatsapp: x.whatsapp || '', bcs: x.bcs || '', consent: !!x.consent, created: t(x.created), lastLogin: t(x.lastLogin) };
  });
};

window.RA = RA;
emit();
