/* =========================================================
 * P05 Next-Shuttle Countdown Board — testing prototype
 *
 *  #home     landing page
 *  #board    big screen at the stop (students read this)
 *  #control  spotter's phone: report shuttles, arrival log, settings
 *
 *  Sync: tabs on one device share localStorage; a board on another device
 *        receives updates through PeerJS using a 4-digit board code.
 * ========================================================= */
(() => {
  'use strict';

  // ---------- Constants ----------
  const KEY = 'p05-shuttle-state-v1';        // shared board data (synced)
  const PEER_PREFIX = 'p05-shuttle-board-';
  const STALE_MS = 15 * 60 * 1000;           // hide a shuttle 15 min after its predicted time
  const PAGES = ['home', 'board', 'control'];

  // =========================================================
  // STATE
  // =========================================================
  const defaults = () => ({
    settings: { gate: 'Main Gate', prevStop: 'previous stop', travelMin: null, range: false, walks: [], notice: '' },
    shuttles: [],   // { id, no, departedAt, eta, seats }
    log: [],        // { n, departedAt, eta, arrivedAt, diffMin, seats }
    counter: 0,
    updatedAt: null
  });

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.settings) {
        const d = defaults();
        return { ...d, ...s, settings: { ...d.settings, ...s.settings } };
      }
    } catch (e) { /* start fresh */ }
    return defaults();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* blocked */ } }


  let state = load();

  // =========================================================
  // HELPERS
  // =========================================================
  const $ = id => document.getElementById(id);
  const fmtTime = ms => ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const minutesLeft = eta => Math.ceil((eta - Date.now()) / 60000);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;   // textContent never runs HTML
    return e;
  }

  function upcoming() {
    const now = Date.now();
    return state.shuttles.filter(s => now - s.eta < STALE_MS).sort((a, b) => a.eta - b.eta);
  }

  function countdown(eta) {
    const m = minutesLeft(eta);
    if (m <= 0) return { due: true, num: 'Due now', unit: '' };
    if (state.settings.range) return { due: false, num: `${Math.max(1, m - 1)}–${m + 1}`, unit: 'min' };
    return { due: false, num: String(m), unit: 'min' };
  }

  let toastTimer = null;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const toCsv = rows => rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const today = () => new Date().toISOString().slice(0, 10);


  // Tabs inside a page: <div data-tabs="x"> buttons + <div data-panel="x:name">
  function initTabs() {
    document.querySelectorAll('[data-tabs]').forEach(group => {
      group.addEventListener('click', e => {
        const b = e.target.closest('.tab');
        if (b) showTab(group.dataset.tabs, b.dataset.tab);
      });
    });
  }
  function showTab(group, name) {
    document.querySelectorAll(`[data-tabs="${group}"] .tab`).forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    document.querySelectorAll(`[data-panel^="${group}:"]`).forEach(p => { p.hidden = p.dataset.panel !== `${group}:${name}`; });
  }

  // =========================================================
  // ROUTING
  // =========================================================
  const started = {};
  const inits = { board: initBoard, control: initControl };

  function route() {
    const want = location.hash.replace('#', '') || 'home';
    const name = PAGES.includes(want) ? want : 'home';
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'v-' + name; });
    document.body.className = 'mode-' + name;
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name));
    if (inits[name] && !started[name]) { started[name] = true; inits[name](); }
    requestAnimationFrame(() => window.scrollTo(0, 0));   // undo the browser jumping to the #id
  }
  window.addEventListener('hashchange', route);

  window.addEventListener('storage', e => {
    if (e.key === KEY) {
      state = load();
      if (started.board) renderBoard();
      if (started.control) renderControl();
    }
  });

  // =========================================================
  // BOARD
  // =========================================================
  function initBoard() {
    renderBoard();
    setInterval(renderBoard, 1000);
    $('b-fs').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
    startBoardPeer();
  }

  function paintCountdown(node, shuttle) {
    node.classList.remove('due', 'none');
    node.replaceChildren();
    if (!shuttle) { node.textContent = 'No shuttle reported'; node.classList.add('none'); return; }
    const c = countdown(shuttle.eta);
    node.append(document.createTextNode(c.num));
    if (c.unit) node.append(el('span', 'unit', c.unit));
    if (c.due) node.classList.add('due');
  }

  function paintSeats(node, shuttle) {
    const s = shuttle && shuttle.seats;
    node.hidden = !s;
    node.className = 'b-seats ' + (s || '');
    node.textContent = s === 'full' ? 'FULL' : s === 'available' ? 'Seats available' : '';
  }

  function renderBoard() {
    const st = state.settings;
    const [next, after] = upcoming();

    $('b-gate').textContent = st.gate || 'Main Gate';
    $('b-clock').textContent = fmtTime(Date.now());

    const notice = $('b-notice');
    notice.hidden = !st.notice;
    notice.textContent = st.notice || '';

    paintCountdown($('b-next'), next);
    paintCountdown($('b-after'), after);
    paintSeats($('b-next-seats'), next);
    paintSeats($('b-after-seats'), after);

    const bar = $('b-next-bar');
    if (next) {
      const total = next.eta - next.departedAt;
      const done = total > 0 ? (Date.now() - next.departedAt) / total : 1;
      bar.style.width = Math.min(100, Math.max(0, done * 100)) + '%';
      bar.classList.toggle('due', minutesLeft(next.eta) <= 0);
      $('b-next-sub').textContent = `Expected at ${fmtTime(next.eta)}`;
    } else {
      bar.style.width = '0%';
      $('b-next-sub').textContent = 'Check back in a moment';
    }

    const walks = $('b-walks');
    walks.replaceChildren();
    (st.walks || []).forEach(w => {
      const row = el('div', 'b-walk');
      row.append(el('span', '', w.block), el('strong', '', `${w.min} min`));
      walks.append(row);
    });
    const hasWalks = !!(st.walks && st.walks.length);
    $('b-walks-wrap').hidden = !hasWalks;
    document.querySelector('.b-grid').classList.toggle('no-walks', !hasWalks);

    $('b-updated').textContent = fmtTime(state.updatedAt);
    const dot = $('b-dot');
    if (state.updatedAt) {
      const ago = Math.floor((Date.now() - state.updatedAt) / 60000);
      $('b-ago').textContent = ago < 1 ? '(just now)' : `(${ago} min ago)`;
      dot.className = 'dot ' + (ago <= 5 ? 'fresh' : ago <= 15 ? 'aging' : 'stale');
    } else {
      $('b-ago').textContent = '';
      dot.className = 'dot';
    }
  }

  function startBoardPeer() {
    const codeEl = $('b-code');
    if (!window.Peer) { codeEl.textContent = 'Same-device mode'; return; }
    const code = sessionStorage.getItem('p05-board-code') || String(Math.floor(1000 + Math.random() * 9000));
    const peer = new Peer(PEER_PREFIX + code);
    peer.on('open', () => { sessionStorage.setItem('p05-board-code', code); codeEl.textContent = 'Board code ' + code; });
    peer.on('connection', conn => {
      conn.on('data', d => {
        if (d && d.type === 'state' && d.state && d.state.settings) { state = d.state; save(); renderBoard(); }
      });
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id') {
        sessionStorage.removeItem('p05-board-code');
        peer.destroy();
        setTimeout(startBoardPeer, 300);
      } else {
        codeEl.textContent = 'Sync offline · same-device mode';
      }
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
  }

  // =========================================================
  // CONTROL
  // =========================================================
  let peer = null, conn = null;

  function commit(message) {
    state.updatedAt = Date.now();
    save();
    broadcast();
    renderControl();
    if (message) toast(message);
  }
  function broadcast() { if (conn && conn.open) conn.send({ type: 'state', state }); }

  function setLink(text, cls, pill) {
    $('c-status').textContent = text;
    $('c-status').className = 'hint ' + (cls === 'ok' || cls === 'bad' ? cls : '');
    $('c-pill').textContent = pill;
    $('c-pill').className = 'pill ' + (cls || '');
  }

  function connect(code) {
    if (!/^\d{4}$/.test(code)) { setLink('Enter the 4-digit code shown on the board.', 'bad', 'No code'); return; }
    if (!window.Peer) { setLink('Sync library did not load. Check the internet connection.', 'bad', 'Offline'); return; }
    if (conn) { try { conn.close(); } catch (e) { /* ignore */ } }
    setLink('Connecting…', 'wait', 'Connecting…');
    const go = () => {
      conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      conn.on('open', () => {
        setLink(`Connected to board ${code}. Changes appear on it instantly.`, 'ok', `Board ${code}`);
        localStorage.setItem('p05-last-code', code);
        broadcast();
        toast('Connected to the board');
      });
      conn.on('close', () => setLink('Disconnected from the board. Tap Connect again.', 'bad', 'Disconnected'));
    };
    if (!peer || peer.destroyed) {
      peer = new Peer();
      peer.on('error', e => setLink(`Could not connect (${e.type}). Check the code and try again.`, 'bad', 'Not connected'));
    }
    if (peer.open) go(); else peer.once('open', go);
  }

  function addShuttle(minutesAway) {
    const now = Date.now();
    state.counter += 1;
    state.shuttles.push({ id: uid(), no: state.counter, departedAt: now, eta: now + minutesAway * 60000, seats: '' });
    commit(`Shuttle ${state.counter} added · ${minutesAway} min away`);
  }

  function arrived(id) {
    const s = state.shuttles.find(x => x.id === id);
    if (!s) return;
    const now = Date.now();
    const diffMin = Math.round((now - s.eta) / 6000) / 10;
    state.log.push({ n: state.log.length + 1, departedAt: s.departedAt, eta: s.eta, arrivedAt: now, diffMin, seats: s.seats || '' });
    state.shuttles = state.shuttles.filter(x => x.id !== id);
    commit(`Logged: ${diffMin > 0 ? '+' : ''}${diffMin} min vs prediction`);
  }

  function initControl() {
    const st = state.settings;
    $('s-gate').value = st.gate;
    $('s-prev').value = st.prevStop;
    $('s-travel').value = st.travelMin || '';
    $('s-range').checked = !!st.range;
    $('c-notice').value = st.notice || '';
    $('c-code').value = localStorage.getItem('p05-last-code') || '';
    if (!st.travelMin) showTab('control', 'settings');

    // Connection
    $('c-connect').addEventListener('click', () => connect($('c-code').value.trim()));
    $('c-code').addEventListener('keydown', e => { if (e.key === 'Enter') connect($('c-code').value.trim()); });

    // Report
    $('c-left').addEventListener('click', () => { if (state.settings.travelMin) addShuttle(state.settings.travelMin); });
    document.querySelectorAll('.chip[data-min]').forEach(b => b.addEventListener('click', () => addShuttle(Number(b.dataset.min))));
    $('c-add-manual').addEventListener('click', () => {
      const v = $('c-manual').value;
      if (v !== '' && Number(v) >= 0) { addShuttle(Number(v)); $('c-manual').value = ''; }
    });
    $('c-open-settings').addEventListener('click', e => { e.preventDefault(); showTab('control', 'settings'); $('s-travel').focus(); });

    // Board message
    $('c-notice-set').addEventListener('click', () => {
      const v = $('c-notice').value.trim();
      if (!v) { toast('Type a message first'); return; }
      state.settings.notice = v;
      commit('Message shown on the board');
    });
    $('c-notice-clear').addEventListener('click', () => { state.settings.notice = ''; $('c-notice').value = ''; commit('Message cleared'); });

    // Settings
    $('s-gate').addEventListener('change', e => { state.settings.gate = e.target.value.trim() || 'Main Gate'; commit('Stop name saved'); });
    $('s-prev').addEventListener('change', e => { state.settings.prevStop = e.target.value.trim() || 'previous stop'; commit('Previous stop saved'); });
    $('s-travel').addEventListener('change', e => {
      const v = Number(e.target.value);
      state.settings.travelMin = v > 0 ? v : null;
      commit(v > 0 ? `Travel time set to ${v} min` : 'Travel time cleared');
    });
    $('s-range').addEventListener('change', e => { state.settings.range = e.target.checked; commit(e.target.checked ? 'Board shows ranges' : 'Board shows exact minutes'); });
    $('s-walk-add').addEventListener('click', () => {
      const block = $('s-walk-block').value.trim();
      const min = Number($('s-walk-min').value);
      if (!block || !(min > 0)) { toast('Enter a block name and minutes'); return; }
      state.settings.walks.push({ block, min });
      $('s-walk-block').value = '';
      $('s-walk-min').value = '';
      commit(`${block} added`);
    });

    // Backup / restore / reset
    $('s-backup').addEventListener('click', () => {
      download(`p05-backup-${today()}.json`, JSON.stringify({ state }, null, 2), 'application/json');
      toast('Backup downloaded');
    });
    $('s-restore').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data.state || !data.state.settings) throw new Error('bad file');
        state = { ...defaults(), ...data.state, settings: { ...defaults().settings, ...data.state.settings } };
        refreshSettingsInputs();
        commit('Backup restored');
      } catch (err) {
        toast('That file is not a P05 backup');
      }
      e.target.value = '';
    });
    $('s-reset').addEventListener('click', () => {
      if (!confirm('Delete ALL settings, shuttles and the arrival log on this device?')) return;
      state = defaults();
      refreshSettingsInputs();
      commit('Everything reset');
    });

    // Log
    $('c-export').addEventListener('click', exportLog);
    $('c-clear').addEventListener('click', () => {
      if (state.log.length && confirm('Clear the whole arrival log? Export it first if you need it.')) { state.log = []; commit('Log cleared'); }
    });

    renderControl();
    setInterval(renderShuttles, 5000);
  }

  function refreshSettingsInputs() {
    const st = state.settings;
    $('s-gate').value = st.gate;
    $('s-prev').value = st.prevStop;
    $('s-travel').value = st.travelMin || '';
    $('s-range').checked = !!st.range;
    $('c-notice').value = st.notice || '';
  }

  function renderControl() {
    if (!started.control) return;
    const st = state.settings;
    $('c-gate-name').textContent = st.gate || 'Main Gate';
    $('c-prev').textContent = st.prevStop || 'previous stop';
    $('c-left').disabled = !st.travelMin;
    $('c-left-sub').textContent = st.travelMin ? `Board will show ${st.travelMin} min` : 'Set travel time first';
    $('c-need-settings').hidden = !!st.travelMin;
    renderShuttles();
    renderWalks();
    renderLog();
  }

  function renderShuttles() {
    const ul = $('c-shuttles');
    const list = upcoming();
    $('c-count').textContent = list.length;
    ul.replaceChildren();
    if (!list.length) { ul.append(el('li', 'empty', 'No shuttles on the way.')); return; }

    list.forEach((s, i) => {
      const li = el('li', 'sh' + (i === 0 ? ' first' : ''));
      const m = minutesLeft(s.eta);

      const top = el('div', 'sh-row');
      const name = el('div');
      name.append(el('div', 'sh-name', `Shuttle ${s.no || ''}${i === 0 ? ' · next on board' : ''}`),
                  el('div', 'sh-time', `Predicted ${fmtTime(s.eta)} · reported ${fmtTime(s.departedAt)}`));
      top.append(name, el('div', 'sh-count' + (m <= 0 ? ' due' : ''), m <= 0 ? 'Due' : `${m} min`));

      const bottom = el('div', 'sh-row');
      const seg = el('div', 'seg');
      [['', 'Unknown'], ['available', 'Seats'], ['full', 'Full']].forEach(([v, label]) => {
        const b = el('button', (s.seats === v ? 'on ' : '') + v, label);
        b.type = 'button';
        b.addEventListener('click', () => { s.seats = v; commit(v ? `Shuttle ${s.no}: ${label}` : null); });
        seg.append(b);
      });
      const actions = el('div', 'sh-actions');
      const arr = el('button', 'btn btn-arrived', 'Arrived');
      arr.type = 'button';
      arr.addEventListener('click', () => arrived(s.id));
      const rm = el('button', 'btn btn-remove', '✕');
      rm.type = 'button';
      rm.title = 'Remove (reported by mistake)';
      rm.addEventListener('click', () => { state.shuttles = state.shuttles.filter(x => x.id !== s.id); commit('Shuttle removed'); });
      actions.append(arr, rm);
      bottom.append(seg, actions);

      li.append(top, bottom);
      ul.append(li);
    });
  }

  function renderWalks() {
    const ul = $('s-walks');
    ul.replaceChildren();
    if (!state.settings.walks.length) { ul.append(el('li', 'empty', 'No walking times yet.')); return; }
    state.settings.walks.forEach((w, i) => {
      const li = el('li');
      li.append(el('span', '', `🚶 ${w.block} — ${w.min} min`));
      const rm = el('button', 'btn btn-remove', '✕');
      rm.type = 'button';
      rm.addEventListener('click', () => { state.settings.walks.splice(i, 1); commit('Walking time removed'); });
      li.append(rm);
      ul.append(li);
    });
  }

  function logStats() {
    const n = state.log.length;
    const within = state.log.filter(r => Math.abs(r.diffMin) <= 2).length;
    const avg = n ? state.log.reduce((a, r) => a + r.diffMin, 0) / n : 0;
    return { n, within, avg };
  }

  function renderLog() {
    const tb = $('c-log');
    tb.replaceChildren();
    [...state.log].reverse().forEach(r => {
      const tr = el('tr');
      [r.n, fmtTime(r.departedAt), fmtTime(r.eta), fmtTime(r.arrivedAt)].forEach(v => tr.append(el('td', '', String(v))));
      tr.append(el('td', r.diffMin > 2 ? 'late' : r.diffMin < -2 ? 'early' : '', (r.diffMin > 0 ? '+' : '') + r.diffMin));
      tr.append(el('td', '', r.seats === 'full' ? 'Full' : r.seats === 'available' ? 'Seats' : '—'));
      tb.append(tr);
    });
    const { n, within, avg } = logStats();
    $('c-log-count').textContent = n;
    $('st-n').textContent = n;
    $('st-within').textContent = n ? `${within}/${n}` : '—';
    $('st-avg').textContent = n ? `${avg > 0 ? '+' : ''}${avg.toFixed(1)} min` : '—';
  }

  function exportLog() {
    if (!state.log.length) { toast('Nothing to export yet'); return; }
    const iso = ms => new Date(ms).toISOString();
    const rows = [['#', 'reported_at', 'predicted_arrival', 'actual_arrival', 'difference_min', 'seats']]
      .concat(state.log.map(r => [r.n, iso(r.departedAt), iso(r.eta), iso(r.arrivedAt), r.diffMin, r.seats]));
    download(`p05-arrival-log-${today()}.csv`, toCsv(rows), 'text/csv');
    toast('Arrival log downloaded');
  }

  // =========================================================
  initTabs();
  route();
})();
