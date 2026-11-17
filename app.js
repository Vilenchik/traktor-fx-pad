'use strict';

/* ---------- MIDI map ----------
   FX Unit 1: CC 20..33, FX Unit 2: CC 40..53, channel from settings (default 1). */
const BASE = [20, 40];
const CC = {
  dw: 0, x: 1, y: 2,
  fx1On: 3, fx2On: 4,
  fx1Prev: 5, fx1Next: 6, fx2Prev: 7, fx2Next: 8,
  deckA: 9, deckB: 10,              // CC +11 is free (was Unit On)
  fx1Idx: 12, fx2Idx: 13,          // incoming from Traktor (effect index feedback)
};
const KEY_BY_OFS = Object.fromEntries(Object.entries(CC).map(([k, v]) => [v, k]));
const LABEL = {
  dw: 'Dry/Wet (Knob)', x: 'XY по X → FX Knob 1', y: 'XY по Y → FX Knob 2',
  fx1On: 'FX 1 вкл (Button, Hold)', fx2On: 'FX 2 вкл (Button, Hold)',
  fx1Prev: 'FX 1 выбор − (Button, Dec)', fx1Next: 'FX 1 выбор + (Button, Inc)',
  fx2Prev: 'FX 2 выбор − (Button, Dec)', fx2Next: 'FX 2 выбор + (Button, Inc)',
  deckA: 'Назначить на деку A (Hold)', deckB: 'Назначить на деку B (Hold)',
  fx1Idx: '← Out: номер эффекта FX 1', fx2Idx: '← Out: номер эффекта FX 2',
};
const CONTINUOUS = new Set(['dw', 'x', 'y']);
const MOMENTARY = new Set(['fx1Prev', 'fx1Next', 'fx2Prev', 'fx2Next']);

const DEFAULT_FX = [
  'No Effect', 'Delay', 'Reverb', 'Flanger', 'Flanger Pulse', 'Flanger Flux', 'Gater',
  'Beatmasher 2', 'Delay T3', 'Filter LFO', 'Filter Pulse', 'Filter', 'Filter:92 LFO',
  'Filter:92 Pulse', 'Filter:92', 'Phaser', 'Phaser Pulse', 'Phaser Flux', 'Reverse Grain',
  'Turntable FX', 'Iceverb', 'Reverb T3', 'Ringmodulator', 'Digital LoFi', 'Mulholland Drive',
  'Transpose Stretch', 'BeatSlicer', 'Formant Filter', 'Peak Filter', 'Tape Delay', 'Ramp Delay',
  'Auto Bouncer', 'Bouncer', 'Wormhole', 'LaserSlicer', 'GranuPhase', 'Bass-o-Matic',
  'PolarWind', 'Event Horizon', 'Zzzurp', 'Flight Test', 'Strrretch (Slow)', 'Strrretch (Fast)',
  'Dark Matter',
].join('\n');

/* ---------- settings (per-device convenience) ---------- */
const LS = 'traktor-fx-pad.v1';
const settings = Object.assign(
  { outName: '', inName: '', ch: 1, spring: [false, false], dwMode: 'touch', autoOn: false, fx: DEFAULT_FX,
    idx: [[13, 12], [37, 20]],
    names: {} },                    // learned: number Traktor sends → effect name
  (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } })()
);
if (settings.padMode) { const s = settings.padMode === 'spring'; settings.spring = [s, s]; delete settings.padMode; }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(settings)); } catch {} };
let FX = [];
const parseFx = () => { FX = settings.fx.split('\n').map(s => s.trim()).filter(Boolean); if (!FX.length) FX = ['No Effect']; };
parseFx();

/* ---------- state ---------- */
const units = [0, 1].map(u => ({
  dw: 0, x: 0, y: 0, deckA: false, deckB: false,
  fx: [{ on: false, idx: settings.idx[u][0], fb: false }, { on: false, idx: settings.idx[u][1], fb: false }],
  padTouch: false, faderTouch: false, el: {},
}));

/* ---------- MIDI ---------- */
let access = null, out = null, inp = null;
const $ = id => document.getElementById(id);
const led = $('led');
let ledT = 0;

function setStatus(text, ok) {
  $('midiName').textContent = text;
  led.classList.toggle('ok', !!ok);
}

function send(u, key, val) {
  const num = BASE[u] + CC[key];
  if (out) {
    try { out.send([0xB0 | ((settings.ch - 1) & 15), num, val & 127]); } catch (e) { /* port gone */ }
    led.classList.add('act'); clearTimeout(ledT); ledT = setTimeout(() => led.classList.remove('act'), 60);
  }
}

async function initMidi() {
  if (!navigator.requestMIDIAccess) {
    setStatus(window.isSecureContext ? 'Web MIDI не поддерживается этим браузером' : 'Нужен https — Web MIDI недоступен', false);
    return;
  }
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = refreshPorts;
    refreshPorts();
  } catch (e) {
    setStatus('Нет доступа к MIDI: ' + (e.message || e.name), false);
  }
}

function pickPort(list, saved) {
  return list.find(p => p.name === saved)
    || list.find(p => /android|peripheral|usb/i.test(p.name))
    || list[0] || null;
}

function refreshPorts() {
  if (!access) return;
  const outs = [...access.outputs.values()];
  const ins = [...access.inputs.values()];
  const prevOut = out;
  out = pickPort(outs, settings.outName);
  if (out && out !== prevOut) syncDw();      // touch mode: start dry
  const newIn = pickPort(ins, settings.inName);
  if (inp && inp !== newIn) inp.onmidimessage = null;
  inp = newIn;
  if (inp) inp.onmidimessage = onMidi;

  fillSelect($('selOut'), outs, out);
  fillSelect($('selIn'), ins, inp);
  setStatus(out ? out.name : 'Нет MIDI-выходов (USB в режиме MIDI?)', !!out);
}

function fillSelect(sel, list, cur) {
  sel.innerHTML = '';
  if (!list.length) sel.add(new Option('— нет —', ''));
  for (const p of list) sel.add(new Option(p.name, p.name, false, p === cur));
}

function onMidi(e) {
  const [s, n, v] = e.data;
  if ((s & 0xF0) !== 0xB0 || (s & 15) !== settings.ch - 1) return;
  for (let u = 0; u < 2; u++) {
    const key = KEY_BY_OFS[n - BASE[u]];
    if (!key) continue;
    const U = units[u];
    switch (key) {
      case 'dw': if (!U.faderTouch && settings.dwMode !== 'touch') U.dw = v; break;
      case 'x': case 'y': if (!U.padTouch) U[key] = v; break;
      case 'fx1On': U.fx[0].on = v > 63; break;
      case 'fx2On': U.fx[1].on = v > 63; break;
      case 'deckA': case 'deckB': U[key] = v > 63; break;
      case 'fx1Idx': U.fx[0].fb = true; setIdx(u, 0, v); break;
      case 'fx2Idx': U.fx[1].fb = true; setIdx(u, 1, v); break;
      default: return;
    }
    render(u);
  }
}

// Name for a number: a learned name wins, otherwise position in our list
const fxName = i => settings.names[i] ?? FX[i] ?? ('#' + i);

function setIdx(u, s, i) {
  // feedback from Traktor may exceed our list, so only clamp locally counted values
  const max = units[u].fx[s].fb ? 127 : FX.length - 1;
  units[u].fx[s].idx = Math.max(0, Math.min(max, i));
  settings.idx[u][s] = units[u].fx[s].idx;
  save();
}

/* ---------- Dry/Wet: "touch" mode = fader sets depth, pad touch applies it ---------- */
const dwLive = u => settings.dwMode !== 'touch' || units[u].padTouch !== false;
// send the Dry/Wet value Traktor should have right now
function syncDw() { for (let u = 0; u < 2; u++) send(u, 'dw', dwLive(u) ? units[u].dw : 0); }

/* ---------- UI ---------- */
const clamp01 = v => Math.max(0, Math.min(1, v));

function buildUnit(u) {
  const U = units[u];
  const el = document.createElement('section');
  el.className = 'unit';
  el.innerHTML = `
    <div class="uhead">
      <span class="unum">FX ${u + 1}</span>
      <button class="tg" data-t="deckA">A</button>
      <button class="tg" data-t="deckB">B</button>
      <button class="tg ret" title="Возврат XY в 0 при отпускании">↺ 0</button>
    </div>
    <div class="ubody">
      <div class="fader"><div class="fill"></div><span class="lbl">D/W</span><span class="val"></span></div>
      <div class="pad"><i class="hx"></i><i class="hy"></i><i class="dot"></i>
        <span class="ax y"></span><span class="ax x"></span></div>
    </div>
    <div class="slots">
      ${[0, 1].map(s => `
      <div class="slot" data-s="${s}">
        <button class="nav" data-nav="-1">‹</button>
        <button class="name"><small>FX ${s + 1}</small><span></span></button>
        <button class="nav" data-nav="1">›</button>
      </div>`).join('')}
    </div>`;
  const q = s => el.querySelector(s);
  U.el = {
    root: el, fader: q('.fader'), fill: q('.fill'), val: q('.val'), pad: q('.pad'), hx: q('.hx'), hy: q('.hy'), dot: q('.dot'),
    ax: q('.ax.x'), ay: q('.ax.y'), tg: el.querySelectorAll('.tg[data-t]'), ret: q('.ret'),
    names: el.querySelectorAll('.slot .name'),
  };

  // toggles A / B
  for (const b of U.el.tg) b.addEventListener('click', () => {
    const k = b.dataset.t; U[k] = !U[k]; send(u, k, U[k] ? 127 : 0); render(u);
  });
  // return-to-0 toggle (local setting, no MIDI); turning it on also resets an idle pad
  U.el.ret.addEventListener('click', () => {
    settings.spring[u] = !settings.spring[u]; save();
    if (settings.spring[u] && U.padTouch === false) springBack(u);
    render(u);
  });

  // dry/wet fader
  const fader = q('.fader');
  const fMove = e => {
    const r = fader.getBoundingClientRect();
    const v = Math.round(clamp01(1 - (e.clientY - r.top) / r.height) * 127);
    if (v !== U.dw) { U.dw = v; if (dwLive(u)) send(u, 'dw', v); render(u); }
  };
  fader.addEventListener('pointerdown', e => { fader.setPointerCapture(e.pointerId); U.faderTouch = true; fMove(e); });
  fader.addEventListener('pointermove', e => { if (U.faderTouch) fMove(e); });
  const fUp = () => { U.faderTouch = false; };
  fader.addEventListener('pointerup', fUp); fader.addEventListener('pointercancel', fUp);

  // XY pad
  const pad = U.el.pad;
  const pMove = e => {
    const r = pad.getBoundingClientRect();
    const x = Math.round(clamp01((e.clientX - r.left) / r.width) * 127);
    const y = Math.round(clamp01(1 - (e.clientY - r.top) / r.height) * 127);
    if (x !== U.x) { U.x = x; send(u, 'x', x); }
    if (y !== U.y) { U.y = y; send(u, 'y', y); }
    render(u);
  };
  pad.addEventListener('pointerdown', e => {
    if (U.padTouch) return;                 // one finger per pad
    pad.setPointerCapture(e.pointerId); U.padTouch = e.pointerId;
    if (settings.autoOn) setFxOn(u, true);
    pMove(e);                                // set X/Y first, then open Dry/Wet
    if (settings.dwMode === 'touch') send(u, 'dw', U.dw);
  });
  pad.addEventListener('pointermove', e => { if (U.padTouch === e.pointerId) pMove(e); });
  const pUp = e => {
    if (U.padTouch !== e.pointerId) return;
    U.padTouch = false;
    if (settings.dwMode === 'touch') send(u, 'dw', 0);   // back to dry first
    if (settings.spring[u]) springBack(u);
    if (settings.autoOn) setFxOn(u, false);
    render(u);
  };
  pad.addEventListener('pointerup', pUp); pad.addEventListener('pointercancel', pUp);

  // effect slots
  el.querySelectorAll('.slot').forEach(slot => {
    const s = +slot.dataset.s;
    const kOn = s ? 'fx2On' : 'fx1On';
    slot.querySelectorAll('.nav').forEach(b => {
      const dir = +b.dataset.nav;
      const k = (s ? 'fx2' : 'fx1') + (dir > 0 ? 'Next' : 'Prev');
      b.addEventListener('pointerdown', () => {
        send(u, k, 127);
        setIdx(u, s, U.fx[s].idx + dir);
        render(u);
      });
      const rel = () => send(u, k, 0);
      b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel);
    });
    // name: tap = effect on/off, long press = pick name (sync display only)
    const name = slot.querySelector('.name');
    let lpT = 0, longFired = false;
    name.addEventListener('pointerdown', () => {
      longFired = false;
      lpT = setTimeout(() => { longFired = true; openPicker(u, s); }, 550);
    });
    const cancel = () => clearTimeout(lpT);
    name.addEventListener('pointerup', () => {
      cancel();
      if (longFired) return;
      U.fx[s].on = !U.fx[s].on; send(u, kOn, U.fx[s].on ? 127 : 0); render(u);
    });
    name.addEventListener('pointercancel', cancel);
    name.addEventListener('contextmenu', e => e.preventDefault());
  });

  $('units').appendChild(el);
}

function springBack(u) {
  const U = units[u];
  if (U.x) { U.x = 0; send(u, 'x', 0); }
  if (U.y) { U.y = 0; send(u, 'y', 0); }
}

function setFxOn(u, on) {
  const U = units[u];
  U.fx.forEach((f, s) => { if (f.on !== on) { f.on = on; send(u, s ? 'fx2On' : 'fx1On', on ? 127 : 0); } });
}

function render(u) {
  const U = units[u], E = U.el;
  E.fill.style.height = (U.dw / 127 * 100) + '%';
  E.fader.classList.toggle('armed', !dwLive(u));
  E.val.textContent = Math.round(U.dw / 127 * 100) + '%';
  const px = U.x / 127 * 100, py = 100 - U.y / 127 * 100;
  E.hx.style.left = px + '%'; E.hy.style.top = py + '%';
  E.dot.style.left = px + '%'; E.dot.style.top = py + '%';
  E.pad.classList.toggle('touch', U.padTouch !== false);
  E.ax.textContent = `${fxName(U.fx[0].idx)} → ${Math.round(U.x / 1.27)}%`;
  E.ay.textContent = `↑ ${fxName(U.fx[1].idx)} ${Math.round(U.y / 1.27)}%`;
  E.tg.forEach(b => b.classList.toggle('on', !!U[b.dataset.t]));
  E.ret.classList.toggle('on', !!settings.spring[u]);
  E.names.forEach((n, s) => {
    const f = U.fx[s];
    n.classList.toggle('on', f.on);
    // small line shows the raw number once Traktor sends it — handy for checking sync
    n.querySelector('small').textContent = `FX ${s + 1}` + (f.fb ? ` · ${f.idx}` : '');
    n.querySelector('span').textContent = fxName(f.idx);
  });
}
const renderAll = () => { render(0); render(1); };

/* ---------- effect picker (fixes the displayed name if it drifted) ---------- */
// Without feedback: picking a name moves our counter there.
// With feedback: the number came from Traktor and is right, so picking a name
// teaches "this number = this name" (remembered for good).
function openPicker(u, s) {
  const f = units[u].fx[s];
  $('fxTitle').textContent = f.fb
    ? `Traktor прислал № ${f.idx} — какой это эффект?`
    : `FX ${u + 1} · слот ${s + 1} — какой эффект сейчас в Traktor?`;
  const list = $('fxList');
  list.innerHTML = '';
  FX.forEach((name, i) => {
    const b = document.createElement('button');
    b.textContent = f.fb ? name : `${i}. ${name}`;
    if (name === fxName(f.idx)) b.className = 'cur';
    b.onclick = () => {
      if (f.fb) { settings.names[f.idx] = name; save(); }
      else setIdx(u, s, i);
      renderAll(); $('dlgFx').close();
    };
    list.appendChild(b);
  });
  if (f.fb && settings.names[f.idx] !== undefined) {
    const r = document.createElement('button');
    r.textContent = '↺ Забыть привязку для этого номера';
    r.onclick = () => { delete settings.names[f.idx]; save(); renderAll(); $('dlgFx').close(); };
    list.prepend(r);
  }
  $('dlgFx').showModal();
}

/* ---------- settings dialog ---------- */
function buildSettings() {
  const ch = $('selCh');
  for (let i = 1; i <= 16; i++) ch.add(new Option(i, i, false, i === settings.ch));
  ch.onchange = () => { settings.ch = +ch.value; save(); buildMap(); };
  $('selOut').onchange = e => { settings.outName = e.target.value; save(); refreshPorts(); };
  $('selIn').onchange = e => { settings.inName = e.target.value; save(); refreshPorts(); };
  $('btnMidi').onclick = initMidi;
  $('selDw').value = settings.dwMode;
  $('selDw').onchange = e => { settings.dwMode = e.target.value; save(); syncDw(); renderAll(); };
  $('selAuto').value = settings.autoOn ? '1' : '0';
  $('selAuto').onchange = e => { settings.autoOn = e.target.value === '1'; save(); };
  const tx = $('txtFx');
  tx.value = settings.fx;
  tx.onchange = () => { settings.fx = tx.value; save(); parseFx(); renderAll(); };
  buildMap();
}

function buildMap() {
  const t = $('tblMap');
  t.innerHTML = '';
  for (let u = 0; u < 2; u++) {
    const h = t.insertRow(); const c = h.insertCell(); c.colSpan = 3;
    c.innerHTML = `<b style="color:var(--teal)">FX Unit ${u + 1}</b> · канал ${settings.ch}`;
    for (const key of Object.keys(CC)) {
      const r = t.insertRow();
      r.insertCell().outerHTML = `<td class="n">CC ${BASE[u] + CC[key]}</td>`;
      r.insertCell().textContent = LABEL[key];
      const b = r.insertCell(); b.className = 'b';
      if (key.endsWith('Idx')) continue;
      const btn = document.createElement('button'); btn.textContent = '▶';
      btn.onclick = () => {
        if (CONTINUOUS.has(key)) send(u, key, 64);
        else { send(u, key, 127); setTimeout(() => send(u, key, 0), MOMENTARY.has(key) ? 80 : 150); }
      };
      b.appendChild(btn);
    }
  }
}

/* ---------- misc: dialogs, fullscreen, wake lock, SW ---------- */
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
$('btnSet').onclick = () => $('dlgSet').showModal();
$('btnFull').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
};

let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.onrelease = () => { wakeLock = null; }; } } catch {}
}
document.addEventListener('pointerdown', keepAwake);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});

buildUnit(0); buildUnit(1); buildSettings(); renderAll(); initMidi();
