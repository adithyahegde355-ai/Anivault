'use strict';
/* AniVault: browse, search and wishlist every anime, with posters, descriptions and trailers.
   Data comes from the free Jikan API (MyAnimeList data). No account, no key. */

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const enc = encodeURIComponent;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem('anivault.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('anivault.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked or full */ } }
};

/* ---------- Jikan API with a polite rate limiter ----------
   Jikan allows about 3 requests per second. Requests start at least 350 ms apart,
   and a 429 / 5xx answer is retried after a short wait. */
const API = 'https://api.jikan.moe/v4';
const GAP = 350;
let nextSlot = 0;
const cache = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path) {
  if (cache.has(path)) return cache.get(path);
  const TRIES = 4;
  for (let i = 0; i < TRIES; i++) {
    const now = Date.now();
    const start = Math.max(nextSlot, now);
    nextSlot = start + GAP;
    if (start > now) await sleep(start - now);

    let res;
    try { res = await fetch(API + path); }
    catch (e) { if (i === TRIES - 1) throw e; await sleep(700 * (i + 1)); continue; }

    if (res.status === 429 || res.status >= 500) {
      if (i === TRIES - 1) throw new Error('Server busy (' + res.status + ')');
      await sleep(1200 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    cache.set(path, json);
    return json;
  }
  throw new Error('Could not load');
}

/* ---------- anime helpers ---------- */
const reg = new Map();                     // id -> anime object, so a tapped card can open without refetching
const name = a => a.title_english || a.title || 'Untitled';
const poster = a => (a.images && ((a.images.jpg && (a.images.jpg.large_image_url || a.images.jpg.image_url)) ||
                     (a.images.webp && (a.images.webp.large_image_url || a.images.webp.image_url)))) || '';
const yearOf = a => a.year || (a.aired && a.aired.prop && a.aired.prop.from && a.aired.prop.from.year) || '';
const num = n => (n == null ? '' : Number(n).toLocaleString('en-US'));

function dedupe(list) {
  const seen = new Set();
  return (list || []).filter(a => a && a.mal_id != null && !seen.has(a.mal_id) && seen.add(a.mal_id));
}
function remember(list) { list.forEach(a => reg.set(a.mal_id, a)); return list; }

/* ---------- wishlist ---------- */
const STATUS = { plan: 'Plan to watch', watching: 'Watching', done: 'Completed' };
const getWL = () => store.get('wl', {});
function slim(a) {
  return { mal_id: a.mal_id, title: a.title, title_english: a.title_english, images: { jpg: { large_image_url: poster(a) } },
           score: a.score, type: a.type, year: yearOf(a), episodes: a.episodes };
}
function setWish(a, status) {
  const wl = getWL();
  if (!status) delete wl[a.mal_id];
  else wl[a.mal_id] = Object.assign({}, slim(a), { status, added: (wl[a.mal_id] && wl[a.mal_id].added) || Date.now() });
  store.set('wl', wl);
  reg.set(a.mal_id, reg.get(a.mal_id) || a);
  updateCount();
}
function updateCount() {
  const n = Object.keys(getWL()).length;
  const b = $('#wCount');
  b.textContent = n;
  b.hidden = n === 0;
}
const findAnime = id => reg.get(id) || getWL()[id] || null;

/* ---------- card rendering ---------- */
function cardHTML(a) {
  const on = !!getWL()[a.mal_id];
  const meta = [a.type, yearOf(a), a.episodes ? a.episodes + ' ep' : ''].filter(Boolean).join(' · ');
  return '<li class="acard" data-id="' + a.mal_id + '">' +
    '<button class="poster" data-act="open" type="button" aria-label="' + esc(name(a)) + '">' +
      (poster(a) ? '<img loading="lazy" alt="" src="' + esc(poster(a)) + '">' : '') +
      (a.score ? '<span class="sc">★ ' + Number(a.score).toFixed(1) + '</span>' : '') +
      (a.type ? '<span class="ty">' + esc(a.type) + '</span>' : '') +
    '</button>' +
    '<button class="heart' + (on ? ' on' : '') + '" data-act="wish" type="button" aria-label="' + (on ? 'Remove from wishlist' : 'Add to wishlist') + '">' + (on ? '♥' : '♡') + '</button>' +
    '<div class="nm" dir="auto">' + esc(name(a)) + '</div>' +
    '<div class="sub">' + esc(meta) + '</div>' +
  '</li>';
}

/* ---------- home ---------- */
const ROWS = [
  { id: 'airing',   title: 'Airing now',         path: '/top/anime?filter=airing&limit=18&sfw=true' },
  { id: 'popular',  title: 'Most popular',       path: '/top/anime?filter=bypopularity&limit=18&sfw=true' },
  { id: 'top',      title: 'Highest rated',      path: '/top/anime?limit=18&sfw=true' },
  { id: 'upcoming', title: 'Coming soon',        path: '/top/anime?filter=upcoming&limit=18&sfw=true' },
  { id: 'movies',   title: 'Top movies',         path: '/top/anime?type=movie&limit=18&sfw=true' }
];

function heroHTML(a) {
  const meta = [a.type, yearOf(a), a.episodes ? a.episodes + ' episodes' : '', a.score ? '★ ' + Number(a.score).toFixed(2) : ''].filter(Boolean).join(' · ');
  return '<img class="bg" alt="" src="' + esc(poster(a)) + '">' +
    '<div class="in"><img class="p" alt="" src="' + esc(poster(a)) + '">' +
    '<div><span class="tag">Airing now</span><h3 dir="auto">' + esc(name(a)) + '</h3>' +
    '<div class="meta">' + esc(meta) + '</div>' +
    '<button class="primary" data-hero="' + a.mal_id + '" type="button">View details</button></div></div>';
}

async function loadHome() {
  const rows = $('#rows');
  rows.innerHTML = ROWS.map(r =>
    '<div class="rowhead"><h2>' + esc(r.title) + '</h2></div>' +
    '<div class="row" id="row-' + r.id + '">' + '<div class="skel"></div>'.repeat(4) + '</div>').join('');
  $('#homeStatus').textContent = '';
  let ok = 0, fail = 0;
  for (const r of ROWS) {
    try {
      const d = await api(r.path);
      const list = remember(dedupe(d.data));
      $('#row-' + r.id).innerHTML = list.map(cardHTML).join('');
      if (r.id === 'airing' && list.length) {
        const h = $('#hero');
        h.innerHTML = heroHTML(list[0]);
        h.hidden = false;
      }
      ok++;
    } catch (e) {
      fail++;
      $('#row-' + r.id).innerHTML = '';
    }
  }
  if (fail) {
    $('#homeStatus').innerHTML = (ok ? 'Some lists could not load.' : 'Could not reach the anime database. Check your internet connection.') +
      ' <button class="chip" id="retryHome" type="button">Try again</button>';
    const b = $('#retryHome');
    if (b) b.onclick = () => { loadHome(); };
  }
}

/* ---------- browse / search ---------- */
const GENRES = [['All', ''], ['Action', 1], ['Adventure', 2], ['Comedy', 4], ['Drama', 8], ['Fantasy', 10], ['Romance', 22],
  ['Sci-Fi', 24], ['Slice of Life', 36], ['Supernatural', 37], ['Mystery', 7], ['Suspense', 41], ['Horror', 14],
  ['Sports', 30], ['Mecha', 18], ['Music', 19], ['Isekai', 62], ['Shounen', 27], ['Shoujo', 25], ['Seinen', 42]];

const B = { q: '', genre: '', order: 'popularity', page: 1, more: false, items: [], busy: false, token: 0 };

function browsePath(page) {
  const sort = B.order === 'popularity' || B.order === 'title' ? 'asc' : 'desc';
  let p = '/anime?limit=24&sfw=true&page=' + page + '&order_by=' + B.order + '&sort=' + sort;
  if (B.q) p += '&q=' + enc(B.q);
  if (B.genre) p += '&genres=' + B.genre;
  return p;
}

async function loadBrowse(reset) {
  if (B.busy && !reset) return;
  const token = ++B.token;
  if (reset) { B.items = []; B.page = 1; $('#bGrid').innerHTML = ''; }
  B.busy = true;
  $('#bStatus').textContent = reset ? 'Searching…' : 'Loading more…';
  $('#bMore').hidden = true;
  try {
    const d = await api(browsePath(B.page));
    if (token !== B.token) return;
    const have = new Set(B.items.map(a => a.mal_id));
    const fresh = remember(dedupe(d.data)).filter(a => !have.has(a.mal_id));
    B.items = B.items.concat(fresh);
    B.more = !!(d.pagination && d.pagination.has_next_page);
    B.page += 1;
    $('#bGrid').innerHTML = B.items.map(cardHTML).join('');
    $('#bStatus').textContent = B.items.length ? '' : 'No anime found. Try another spelling or remove the genre filter.';
  } catch (e) {
    if (token !== B.token) return;
    $('#bStatus').textContent = 'Could not load: ' + (e && e.message ? e.message : 'network error') + '. Check your internet and try again.';
  }
  B.busy = false;
  $('#bMore').hidden = !B.more;
}

function renderGenres() {
  $('#genres').innerHTML = GENRES.map(g =>
    '<button type="button" class="chip' + (String(g[1]) === String(B.genre) ? ' on' : '') + '" data-g="' + g[1] + '">' + esc(g[0]) + '</button>').join('');
}

/* ---------- wishlist view ---------- */
let wTab = 'all';
function renderWish() {
  const items = Object.values(getWL()).sort((a, b) => b.added - a.added).filter(x => wTab === 'all' || x.status === wTab);
  items.forEach(x => { if (!reg.has(x.mal_id)) reg.set(x.mal_id, x); });
  $('#wGrid').innerHTML = items.map(cardHTML).join('');
  $('#wEmpty').hidden = items.length > 0;
  $('#wEmpty').textContent = wTab === 'all' ? 'Nothing here yet. Tap the ♥ on any anime to add it.' : 'Nothing in this list yet.';
  $$('#wTabs .chip').forEach(c => c.classList.toggle('on', c.dataset.w === wTab));
}

/* ---------- detail page ---------- */
const D = { id: null, token: 0 };

function trailerHTML(a) {
  const t = a.trailer || {};
  let id = t.youtube_id;
  if (!id && t.embed_url) { const m = String(t.embed_url).match(/embed\/([\w-]{6,})/); if (m) id = m[1]; }
  if (!id) return '<p class="small">No official trailer is listed for this anime.</p>';
  const thumb = (t.images && (t.images.maximum_image_url || t.images.large_image_url)) || ('https://img.youtube.com/vi/' + id + '/hqdefault.jpg');
  return '<div class="trailer" id="trailerBox" data-yt="' + esc(id) + '">' +
    '<img alt="" src="' + esc(thumb) + '">' +
    '<button class="play" data-play="1" type="button" aria-label="Play trailer"><span>▶</span></button></div>' +
    '<p class="small">Official trailer. <a href="https://www.youtube.com/watch?v=' + esc(id) + '" target="_blank" rel="noopener">Open on YouTube</a> if it does not play here.</p>';
}

function playTrailer() {
  const box = $('#trailerBox');
  if (!box) return;
  const id = box.dataset.yt;
  box.innerHTML = '<iframe src="https://www.youtube.com/embed/' + enc(id) + '?autoplay=1&rel=0&playsinline=1" ' +
    'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
}

function names(list) { return (list || []).map(x => x.name).filter(Boolean); }

function detailHTML(a) {
  const st = (getWL()[a.mal_id] || {}).status || '';
  const stats = [
    a.score ? '<span class="pill score">★ ' + Number(a.score).toFixed(2) + (a.scored_by ? ' (' + num(a.scored_by) + ')' : '') + '</span>' : '',
    a.rank ? '<span class="pill">Rank #' + num(a.rank) + '</span>' : '',
    a.popularity ? '<span class="pill">Popularity #' + num(a.popularity) + '</span>' : '',
    a.type ? '<span class="pill">' + esc(a.type) + '</span>' : '',
    a.episodes ? '<span class="pill">' + a.episodes + ' ep</span>' : '',
    a.status ? '<span class="pill">' + esc(a.status) + '</span>' : ''
  ].join('');
  const facts = [
    ['Japanese', a.title_japanese], ['Aired', a.aired && a.aired.string], ['Season', a.season ? a.season + ' ' + (a.year || '') : ''],
    ['Studio', names(a.studios).join(', ')], ['Source', a.source], ['Duration', a.duration], ['Rating', a.rating]
  ].filter(f => f[1]).map(f => '<dt>' + f[0] + '</dt><dd dir="auto">' + esc(f[1]) + '</dd>').join('');
  const genres = names(a.genres).concat(names(a.themes), names(a.demographics));
  const streams = (a.streaming || []).filter(s => s.url).map(s => '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>').join('');
  const syn = a.synopsis ? esc(a.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim()) : 'No description available yet.';

  return '<div class="dhero"><img class="bg" alt="" src="' + esc(poster(a)) + '"><div class="in">' +
      '<img class="p" alt="" src="' + esc(poster(a)) + '"><div>' +
      '<h1 dir="auto">' + esc(name(a)) + '</h1>' +
      (a.title_english && a.title && a.title !== a.title_english ? '<div class="jp" dir="auto">' + esc(a.title) + '</div>' : '') +
      '<div class="stats">' + stats + '</div></div></div></div>' +
    '<div class="wishrow"><select id="wishSel" aria-label="Wishlist status">' +
      '<option value="">Not in my wishlist</option>' +
      Object.keys(STATUS).map(k => '<option value="' + k + '"' + (st === k ? ' selected' : '') + '>' + STATUS[k] + '</option>').join('') +
      '</select><button id="wishHeart" class="heartbtn' + (st ? ' on' : '') + '" type="button" aria-label="Toggle wishlist">' + (st ? '♥' : '♡') + '</button></div>' +
    '<div class="dsec"><h3>Official trailer</h3>' + trailerHTML(a) + '</div>' +
    '<div class="dsec"><h3>Story</h3><div class="syn" dir="auto">' + syn + '</div></div>' +
    (genres.length ? '<div class="dsec"><h3>Genres</h3><div class="stats">' + genres.map(g => '<span class="pill">' + esc(g) + '</span>').join('') + '</div></div>' : '') +
    (facts ? '<div class="dsec"><h3>Details</h3><dl class="facts">' + facts + '</dl></div>' : '') +
    (streams ? '<div class="dsec"><h3>Where to watch</h3><div class="links">' + streams + '</div></div>' : '');
}

async function openDetail(id, pushed) {
  id = Number(id);
  D.id = id;
  const token = ++D.token;
  $('#detail').hidden = false;
  if (!pushed) history.pushState({ d: id }, '');
  const base = findAnime(id);
  $('#dBody').innerHTML = base ? detailHTML(base) : '<p class="status">Loading…</p>';
  $('#dBody').scrollTop = 0;
  try {
    const d = await api('/anime/' + id + '/full');
    if (token !== D.token) return;
    reg.set(id, d.data);
    $('#dBody').innerHTML = detailHTML(d.data);
  } catch (e) {
    if (token !== D.token) return;
    if (!base) {
      $('#dBody').innerHTML = '<p class="status">Could not load this anime. Check your internet connection. ' +
        '<button class="chip" id="retryDetail" type="button">Try again</button></p>';
      const b = $('#retryDetail');
      if (b) b.onclick = () => openDetail(id, true);
    }
  }
}

function closeDetail() {
  D.id = null; D.token++;
  $('#detail').hidden = true;
  $('#dBody').innerHTML = '';              // also stops any playing trailer
  if (!$('#view-wish').hidden) renderWish();
  refreshHearts();
}

function refreshHearts() {
  const wl = getWL();
  $$('.acard').forEach(li => {
    const on = !!wl[li.dataset.id];
    const h = $('.heart', li);
    if (!h) return;
    h.classList.toggle('on', on);
    h.textContent = on ? '♥' : '♡';
  });
}

/* ---------- navigation and wiring ---------- */
function showView(v) {
  ['home', 'browse', 'wish'].forEach(x => { $('#view-' + x).hidden = x !== v; });
  $$('.bottom button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#main').scrollTop = 0;
  if (v === 'wish') renderWish();
  if (v === 'browse' && !B.items.length && !B.busy) loadBrowse(true);
}

function onCardClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const li = btn.closest('.acard');
  const a = li && findAnime(Number(li.dataset.id));
  if (!a) return;
  if (btn.dataset.act === 'open') { openDetail(a.mal_id); return; }
  const on = !!getWL()[a.mal_id];
  setWish(a, on ? '' : 'plan');
  refreshHearts();
  if (!$('#view-wish').hidden) renderWish();
}

function init() {
  updateCount();
  renderGenres();

  $$('.bottom button').forEach(b => { b.onclick = () => showView(b.dataset.view); });
  $('#goSearch').onclick = () => { showView('browse'); $('#q').focus(); };

  ['#rows', '#bGrid', '#wGrid'].forEach(s => $(s).addEventListener('click', onCardClick));
  $('#hero').addEventListener('click', e => {
    const b = e.target.closest('[data-hero]');
    if (b) openDetail(b.dataset.hero);
  });

  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    B.q = $('#q').value.trim();
    $('#q').blur();
    loadBrowse(true);
  });
  $('#genres').addEventListener('click', e => {
    const c = e.target.closest('[data-g]');
    if (!c) return;
    B.genre = c.dataset.g;
    renderGenres();
    loadBrowse(true);
  });
  $('#order').addEventListener('change', () => { B.order = $('#order').value; loadBrowse(true); });
  $('#bMore').onclick = () => loadBrowse(false);

  $('#wTabs').addEventListener('click', e => {
    const c = e.target.closest('[data-w]');
    if (!c) return;
    wTab = c.dataset.w;
    renderWish();
  });

  /* detail page */
  $('#dBack').onclick = () => history.back();
  $('#dBody').addEventListener('click', e => {
    if (e.target.closest('[data-play]')) { playTrailer(); return; }
    if (e.target.closest('#wishHeart')) {
      const a = findAnime(D.id);
      if (!a) return;
      setWish(a, getWL()[D.id] ? '' : 'plan');
      $('#dBody').querySelector('#wishSel').value = (getWL()[D.id] || {}).status || '';
      const h = $('#wishHeart');
      const on = !!getWL()[D.id];
      h.classList.toggle('on', on);
      h.textContent = on ? '♥' : '♡';
    }
  });
  $('#dBody').addEventListener('change', e => {
    if (e.target.id !== 'wishSel') return;
    const a = findAnime(D.id);
    if (!a) return;
    setWish(a, e.target.value);
    const h = $('#wishHeart');
    h.classList.toggle('on', !!e.target.value);
    h.textContent = e.target.value ? '♥' : '♡';
  });

  window.addEventListener('popstate', () => { if (!$('#detail').hidden) closeDetail(); });

  loadHome();
}

document.addEventListener('DOMContentLoaded', init);
