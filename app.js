/* P05 Next-Shuttle Countdown Board — testing prototype
 * Board view:   shows the next two shuttles, walking times and last-updated time.
 * Control view: a teammate reports departures and arrivals; arrivals are logged
 *               as predicted vs actual (assumption A2) and can be exported as CSV.
 * Sync: same device → localStorage; other device → PeerJS (board code).
 */
(() => {
  'use strict';

  const KEY = 'p05-shuttle-state-v1';
  const PEER_PREFIX = 'p05-shuttle-board-';
  const STALE_MS = 15 * 60 * 1000; // hide a shuttle 15 min after its predicted time

  // ---------- State ----------
  const defaults = () => ({
    settings: { gate: 'Main Gate', prevStop: 'previous stop', travelMin: null, range: false, walks: [] },
    shuttles: [],   // { id, departedAt, eta, seats: '' | 'available' | 'full' }
    log: [],        // { n, departedAt, eta, arrivedAt, diffMin, seats }
    updatedAt: null
  });

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.settings) {
        const d = defaults();
        return { ...d, ...s, settings: { ...d.settings, ...s.settings } };
      }
    } catch (e) { /* ignore */ }
    return defaults();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  let state = load();

  // ---------- Helpers ----------
  const $ = id => document.getElementById(id);
  const fmtTime = ms => ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const minutesLeft = eta => Math.ceil((eta - Date.now()) / 60000);

  function upcoming() {
    const now = Date.now();
    return state.shuttles
      .filter(s => now - s.eta < STALE_MS)
      .sort((a, b) => a.eta - b.eta);
  }

  function minutesText(eta) {
    const m = minutesLeft(eta);
    if (m <= 0) return { text: 'Due now', due: true };
    if (state.settings.range) {
      const lo = Math.max(1, m - 1), hi = m + 1;
      return { text: `${lo}–${hi} min`, due: false };
    }
    return { text: `${m} min`, due: false };
  }

  // ---------- Routing ----------
  const started = { board: false, control: false };
  function route() {
    const view = (location.hash.replace('#', '') || 'home');
    const name = ['home', 'board', 'control'].includes(view) ? view : 'home';
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== name; });
    document.body.className = 'mode-' + name;
    if (name === 'board' && !started.board) { started.board = true; initBoard(); }
    if (name === 'control' && !started.control) { started.control = true; initControl(); }
  }
  window.addEventListener('hashchange', route);

  // Same-device sync between tabs
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    state = load();
    if (started.board) renderBoard();
    if (started.control) renderControl();
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

  function setVal(node, eta) {
    node.classList.remove('due', 'none');
    if (!eta) { node.textContent = 'No report yet'; node.classList.add('none'); return; }
    const t = minutesText(eta);
    node.textContent = t.text;
    if (t.due) node.classList.add('due');
  }

  function renderBoard() {
    const st = state.settings;
    $('b-gate').textContent = st.gate || 'Main Gate';
    $('b-clock').textContent = fmtTime(Date.now());

    const list = upcoming();
    setVal($('b-next'), list[0] && list[0].eta);
    setVal($('b-after'), list[1] && list[1].eta);

    const seats = $('b-next-seats');
    const s0 = list[0] && list[0].seats;
    seats.hidden = !s0;
    seats.className = 'b-seats ' + (s0 || '');
    seats.textContent = s0 === 'full' ? 'Next shuttle: FULL' : s0 === 'available' ? 'Next shuttle: seats available' : '';

    const walks = $('b-walks');
    walks.replaceChildren();
    (st.walks || []).forEach(w => {
      const row = el('div', 'b-walk');
      row.append(el('span', '', `Walk to ${w.block}`), el('strong', '', `${w.min} min`));
      walks.append(row);
    });
    $('b-walks-wrap').hidden = !(st.walks && st.walks.length);

    $('b-updated').textContent = fmtTime(state.updatedAt);
  }

  function startBoardPeer() {
    const codeEl = $('b-code');
    if (!window.Peer) { codeEl.textContent = 'Same-device mode'; return; }
    let code = sessionStorage.getItem('p05-board-code') || String(Math.floor(1000 + Math.random() * 9000));
    const peer = new Peer(PEER_PREFIX + code);
    peer.on('open', () => {
      sessionStorage.setItem('p05-board-code', code);
      codeEl.textContent = 'Board code: ' + code;
    });
    peer.on('connection', conn => {
      conn.on('data', d => {
        if (d && d.type === 'state' && d.state && d.state.settings) {
          state = d.state;
          save();
          renderBoard();
        }
      });
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id') {
        sessionStorage.removeItem('p05-board-code');
        peer.destroy();
        setTimeout(startBoardPeer, 300);
      } else {
        codeEl.textContent = 'Sync offline (same-device mode)';
      }
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
  }

  // =========================================================
  // CONTROL
  // =========================================================
  let peer = null, conn = null;

  function commit() {
    state.updatedAt = Date.now();
    save();
    broadcast();
    renderControl();
  }
  function broadcast() {
    if (conn && conn.open) conn.send({ type: 'state', state });
  }
  function setStatus(text, cls) {
    const s = $('c-status');
    s.textContent = text;
    s.className = 'status ' + (cls || '');
  }

  function connect(code) {
    if (!/^\d{4}$/.test(code)) { setStatus('Enter the 4-digit code shown on the board.', 'bad'); return; }
    if (!window.Peer) { setStatus('Sync library did not load. Check the internet connection.', 'bad'); return; }
    if (conn) { try { conn.close(); } catch (e) { /* ignore */ } }
    setStatus('Connecting…');
    const go = () => {
      conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      conn.on('open', () => {
        setStatus('Connected to board ' + code, 'ok');
        localStorage.setItem('p05-last-code', code);
        broadcast();
      });
      conn.on('close', () => setStatus('Disconnected from the board. Press Connect again.', 'bad'));
    };
    if (!peer || peer.destroyed) {
      peer = new Peer();
      peer.on('error', e => setStatus('Could not connect (' + e.type + '). Check the code and try again.', 'bad'));
    }
    if (peer.open) go(); else peer.once('open', go);
  }

  function addShuttle(minutesAway) {
    const now = Date.now();
    state.shuttles.push({ id: uid(), departedAt: now, eta: now + minutesAway * 60000, seats: '' });
    commit();
  }

  function arrived(id) {
    const s = state.shuttles.find(x => x.id === id);
    if (!s) return;
    const now = Date.now();
    state.log.push({
      n: state.log.length + 1,
      departedAt: s.departedAt,
      eta: s.eta,
      arrivedAt: now,
      diffMin: Math.round((now - s.eta) / 6000) / 10,
      seats: s.seats || ''
    });
    state.shuttles = state.shuttles.filter(x => x.id !== id);
    commit();
  }

  function initControl() {
    const st = state.settings;
    $('s-gate').value = st.gate;
    $('s-prev').value = st.prevStop;
    $('s-travel').value = st.travelMin || '';
    $('s-range').checked = !!st.range;
    $('c-code').value = localStorage.getItem('p05-last-code') || '';

    $('c-connect').addEventListener('click', () => connect($('c-code').value.trim()));

    $('c-left').addEventListener('click', () => {
      if (state.settings.travelMin) addShuttle(state.settings.travelMin);
    });
    $('c-add-manual').addEventListener('click', () => {
      const m = Number($('c-manual').value);
      if (m >= 0 && $('c-manual').value !== '') { addShuttle(m); $('c-manual').value = ''; }
    });

    $('s-gate').addEventListener('change', e => { state.settings.gate = e.target.value.trim() || 'Main Gate'; commit(); });
    $('s-prev').addEventListener('change', e => { state.settings.prevStop = e.target.value.trim() || 'previous stop'; commit(); });
    $('s-travel').addEventListener('change', e => {
      const v = Number(e.target.value);
      state.settings.travelMin = v > 0 ? v : null;
      commit();
    });
    $('s-range').addEventListener('change', e => { state.settings.range = e.target.checked; commit(); });

    $('s-walk-add').addEventListener('click', () => {
      const block = $('s-walk-block').value.trim();
      const min = Number($('s-walk-min').value);
      if (!block || !(min > 0)) return;
      state.settings.walks.push({ block, min });
      $('s-walk-block').value = '';
      $('s-walk-min').value = '';
      commit();
    });

    $('c-export').addEventListener('click', exportCsv);
    $('c-clear').addEventListener('click', () => {
      if (state.log.length && confirm('Clear the whole arrival log? Export it first if you need it.')) {
        state.log = [];
        commit();
      }
    });

    renderControl();
    setInterval(renderShuttles, 15000); // keep the "in X min" text fresh
  }

  function renderControl() {
    if (!started.control) return;
    const st = state.settings;
    $('c-prev').textContent = st.prevStop || 'previous stop';
    $('c-left').disabled = !st.travelMin;
    $('c-need-settings').hidden = !!st.travelMin;
    renderShuttles();
    renderWalks();
    renderLog();
  }

  function renderShuttles() {
    const ul = $('c-shuttles');
    ul.replaceChildren();
    const list = upcoming();
    if (!list.length) { ul.append(el('li', 'empty', 'No shuttles reported.')); return; }
    list.forEach(s => {
      const li = el('li');
      const info = el('div', 'sh-info');
      const m = minutesLeft(s.eta);
      info.append(
        el('span', 'sh-eta', `Predicted ${fmtTime(s.eta)} · ${m <= 0 ? 'due now' : 'in ' + m + ' min'}`),
        el('span', 'sh-sub', `Reported at ${fmtTime(s.departedAt)}`)
      );
      const actions = el('div', 'sh-actions');
      const sel = el('select');
      [['', 'Seats: unknown'], ['available', 'Seats available'], ['full', 'Full']].forEach(([v, t]) => {
        const o = el('option', '', t); o.value = v; if (s.seats === v) o.selected = true; sel.append(o);
      });
      sel.addEventListener('change', () => { s.seats = sel.value; commit(); });
      const arr = el('button', 'btn btn-sm', 'Arrived');
      arr.type = 'button';
      arr.addEventListener('click', () => arrived(s.id));
      const rm = el('button', 'btn btn-sm btn-outline', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', () => { state.shuttles = state.shuttles.filter(x => x.id !== s.id); commit(); });
      actions.append(sel, arr, rm);
      li.append(info, actions);
      ul.append(li);
    });
  }

  function renderWalks() {
    const ul = $('s-walks');
    ul.replaceChildren();
    if (!state.settings.walks.length) { ul.append(el('li', 'empty', 'No walking times added yet.')); return; }
    state.settings.walks.forEach((w, i) => {
      const li = el('li');
      li.append(el('span', '', `${w.block} — ${w.min} min`));
      const rm = el('button', 'btn btn-sm btn-outline', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', () => { state.settings.walks.splice(i, 1); commit(); });
      li.append(rm);
      ul.append(li);
    });
  }

  function renderLog() {
    const tb = $('c-log');
    tb.replaceChildren();
    state.log.forEach(r => {
      const tr = el('tr');
      [r.n, fmtTime(r.departedAt), fmtTime(r.eta), fmtTime(r.arrivedAt),
       (r.diffMin > 0 ? '+' : '') + r.diffMin, r.seats || '—'].forEach(v => tr.append(el('td', '', String(v))));
      tb.append(tr);
    });
    const n = state.log.length;
    const within = state.log.filter(r => Math.abs(r.diffMin) <= 2).length;
    $('c-log-summary').textContent = n
      ? `${within} of ${n} arrivals were within 2 minutes of the prediction.`
      : 'No arrivals logged yet.';
  }

  function exportCsv() {
    if (!state.log.length) return;
    const iso = ms => new Date(ms).toISOString();
    const rows = [['#', 'reported_at', 'predicted_arrival', 'actual_arrival', 'difference_min', 'seats']]
      .concat(state.log.map(r => [r.n, iso(r.departedAt), iso(r.eta), iso(r.arrivedAt), r.diffMin, r.seats]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `p05-arrival-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  route();
})();
