'use strict';

const API = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const KEY_STORE = 'groq_api_key';
const TIMEOUT_MS = 60000;

const SYSTEM = {
  short:  'Ringkas teks pengguna menjadi 1-2 kalimat inti. Bahasa Indonesia, tanpa basa-basi, tanpa pembuka seperti "Berikut ringkasannya". Balas hanya ringkasannya.',
  medium: 'Ringkas teks pengguna menjadi satu paragraf padat (3-5 kalimat) yang memuat poin-poin utama. Bahasa Indonesia, tanpa basa-basi, tanpa pembuka seperti "Berikut ringkasannya". Balas hanya ringkasannya.',
  long:   'Ringkas teks pengguna menjadi 2-3 paragraf yang mempertahankan poin utama, detail penting, dan kesimpulan. Bahasa Indonesia, tanpa basa-basi, tanpa pembuka seperti "Berikut ringkasannya". Balas hanya ringkasannya.',
};

const MESSAGES = {
  NO_API_KEY:      'Groq API key belum diisi. Buka bagian "Groq API Key" di bawah dan tempel key-mu.',
  INVALID_API_KEY: 'Groq API key ditolak. Periksa kembali key-mu di console.groq.com/keys.',
  RATE_LIMITED:    'Kuota permintaan tercapai. Tunggu sebentar, lalu coba lagi.',
  FETCH_TIMEOUT:   'Permintaan terlalu lama dan dibatalkan. Coba teks yang lebih pendek atau ulangi.',
  NETWORK_ERROR:   'Gagal meringkas teks. Periksa koneksi internet, lalu coba lagi.',
  EMPTY_RESPONSE:  'Model tidak mengembalikan ringkasan. Coba lagi.',
};

const $ = (id) => document.getElementById(id);
const el = {
  input: $('input'), srcCount: $('srcCount'), emptyErr: $('emptyErr'),
  run: $('run'), clear: $('clear'), copy: $('copy'), retry: $('retry'),
  idle: $('idle'), loading: $('loading'), result: $('result'), error: $('error'),
  summary: $('summary'), outCount: $('outCount'), errMsg: $('errMsg'), errCode: $('errCode'),
  apiKey: $('apiKey'), saveKey: $('saveKey'), settings: $('settings'),
};

/* ── pure helpers ─────────────────────────────────────────────────────── */

const countWords = (t) => (t || '').trim() ? t.trim().split(/\s+/).length : 0;

// % teks yang dipangkas; 0 kalau ringkasan tidak lebih pendek
const reduction = (src, out) =>
  src > 0 && out > 0 ? Math.max(0, Math.round((1 - out / src) * 100)) : 0;

const selectedLength = () => document.querySelector('input[name="len"]:checked').value;

/* ── state → UI ───────────────────────────────────────────────────────── */

function show(state) {
  el.idle.hidden = state !== 'idle';
  el.loading.hidden = state !== 'loading';
  el.result.hidden = state !== 'done';
  el.error.hidden = state !== 'fail';
  el.run.disabled = state === 'loading';
  el.clear.disabled = state === 'loading';
  el.run.textContent = state === 'loading' ? 'Meringkas…' : 'Ringkas';
}

function markEmpty(on) {
  el.emptyErr.hidden = !on;
  el.input.classList.toggle('invalid', on);
}

function updateSrcCount() {
  el.srcCount.textContent = countWords(el.input.value) + ' kata';
}

function fail(code) {
  el.errMsg.textContent = MESSAGES[code] || MESSAGES.NETWORK_ERROR;
  el.errCode.textContent = 'Kode: ' + code;
  show('fail');
}

/* ── API ──────────────────────────────────────────────────────────────── */

const codedError = (code) => Object.assign(new Error(code), { code });

async function fetchSummary(text, length) {
  const key = localStorage.getItem(KEY_STORE);
  if (!key) throw codedError('NO_API_KEY');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM[length] },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!res.ok) {
      if (res.status === 401) throw codedError('INVALID_API_KEY');
      if (res.status === 429) throw codedError('RATE_LIMITED');
      throw codedError('HTTP_' + res.status);
    }

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content?.trim();
    if (!summary) throw codedError('EMPTY_RESPONSE');
    return summary;
  } catch (e) {
    if (e.code) throw e;
    throw codedError(e.name === 'AbortError' ? 'FETCH_TIMEOUT' : 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

/* ── actions ──────────────────────────────────────────────────────────── */

async function run() {
  const text = el.input.value;
  if (!text.trim()) {
    markEmpty(true);
    show('idle');
    el.input.focus();
    return;
  }
  markEmpty(false);
  show('loading');

  try {
    const summary = await fetchSummary(text, selectedLength());
    const src = countWords(text), out = countWords(summary);
    el.summary.textContent = summary;
    el.outCount.textContent = out + ' kata · ' + reduction(src, out) + '% lebih ringkas';
    el.copy.textContent = 'Copy';
    show('done');
  } catch (e) {
    fail(e.code);
    if (e.code === 'NO_API_KEY') el.settings.open = true;
  }
}

function clearAll() {
  el.input.value = '';
  markEmpty(false);
  updateSrcCount();
  show('idle');
  el.input.focus();
}

async function copySummary() {
  try {
    await navigator.clipboard.writeText(el.summary.textContent);
    el.copy.textContent = 'Tersalin';
  } catch {
    el.copy.textContent = 'Gagal salin';
  }
  setTimeout(() => { el.copy.textContent = 'Copy'; }, 1600);
}

/* ── wiring ───────────────────────────────────────────────────────────── */

el.input.addEventListener('input', () => {
  updateSrcCount();
  if (el.input.value.trim()) markEmpty(false);
});
el.input.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
});
el.run.addEventListener('click', run);
el.retry.addEventListener('click', run);
el.clear.addEventListener('click', clearAll);
el.copy.addEventListener('click', copySummary);

el.saveKey.addEventListener('click', () => {
  const key = el.apiKey.value.trim();
  if (key) localStorage.setItem(KEY_STORE, key); else localStorage.removeItem(KEY_STORE);
  el.saveKey.textContent = 'Tersimpan';
  setTimeout(() => { el.saveKey.textContent = 'Simpan'; }, 1600);
});

el.apiKey.value = localStorage.getItem(KEY_STORE) || '';
if (!el.apiKey.value) el.settings.open = true;
updateSrcCount();
show('idle');

/* Self-check: buka index.html#selftest, lihat console. */
if (location.hash === '#selftest') {
  console.assert(countWords('') === 0, 'kosong = 0');
  console.assert(countWords('   \n ') === 0, 'whitespace = 0');
  console.assert(countWords('satu dua  tiga\nempat') === 4, 'hitung kata');
  console.assert(reduction(100, 25) === 75, '75% ringkas');
  console.assert(reduction(0, 5) === 0 && reduction(10, 20) === 0, 'tidak negatif');
  console.log('selftest selesai — tidak ada assert yang gagal berarti lulus.');
}
