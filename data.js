/* ══════════════════════════════════════════════════════════════════════════════
   ShiftScheduler — data.js
   Shared constants, global state, and pure data helpers.
   ══════════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────────
//  DEFAULT SHIFT DEFINITIONS  (matches the original screenshot)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_SHIFTS = [
  { id: 'night',   lbl: '夜班', sub: '0-8',   time: '00:00–08:00', color: '#1e3a5f', txt: '#ffffff', orig: 'Patrol/0-8',   consec: 3 },
  { id: 'day',     lbl: '白班', sub: '8-16',  time: '08:00–16:00', color: '#f59e0b', txt: '#1a1a1a', orig: 'Patrol/8-16',  consec: 5 },
  { id: 'evening', lbl: '晚班', sub: '16-24', time: '16:00–00:00', color: '#0d9488', txt: '#ffffff', orig: 'Patrol/16-24', consec: 4 },
  { id: 'off',     lbl: '休息', sub: '—',     time: '当天休息',    color: '#e5e7eb', txt: '#6b7280', orig: '休息',         consec: 2 },
];

const DEFAULT_DEPT = 'Starsun';

// ─────────────────────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────────────────────
let SHIFTS      = [];
let SMAP        = {};   // { shiftId → shift obj }
let OMAP        = {};   // { orig string → shiftId }

let curYear, curMonth;
let employees    = [];   // [{ id, name, eid, dept, deptManual, hidden }]
let schedule     = {};   // { empId: { 'YYYY-MM-DD': shiftId } }
let defaultDept  = DEFAULT_DEPT;
let lockedMonths = {};   // { 'YYYY-MM': true } — months that cannot be edited

let curView     = 'grid';

// drag state
let dragging    = false;
let dragShift   = null;
let dragSet     = new Set();

// context menu state
let _ctxCell    = null;   // { eid, date }
let _ctxEmpId   = null;

// employee modal edit state
let _editingEmpId = null;

// row drag-to-reorder state
let _rowDragId = null;

// worker detail modal state
let _wdEmpId  = null;
let _wdYear, _wdMonth;
let _wdChart  = null;

// last computed violations map (empId → { consecViol, weekViol, rowViol, reasons })
let _lastViol    = {};
// last computed day violations map (day number → { violations, hasViol })
let _lastDayViol = {};

// ─────────────────────────────────────────────────────────────────────────────
//  ROW DRAG-TO-REORDER
// ─────────────────────────────────────────────────────────────────────────────
function rowDragStart(e, empId) {
  _rowDragId = empId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', empId);
  setTimeout(() => {
    document.querySelector(`tr[data-eid="${empId}"]`)?.classList.add('row-dragging');
  }, 0);
}

function rowDragOver(e, empId) {
  if (!_rowDragId || _rowDragId === empId) return;
  e.preventDefault();
  document.querySelectorAll('.emp-row').forEach(r =>
    r.classList.remove('row-drag-over-top', 'row-drag-over-bottom'));
  const tr = document.querySelector(`tr[data-eid="${empId}"]`);
  if (!tr) return;
  const mid = tr.getBoundingClientRect().top + tr.getBoundingClientRect().height / 2;
  tr.classList.add(e.clientY < mid ? 'row-drag-over-top' : 'row-drag-over-bottom');
}

function rowDrop(e, targetId) {
  e.preventDefault();
  if (!_rowDragId || _rowDragId === targetId) { rowDragEnd(); return; }
  const tr = document.querySelector(`tr[data-eid="${targetId}"]`);
  const below = tr?.classList.contains('row-drag-over-bottom');
  const fromIdx = employees.findIndex(em => em.id === _rowDragId);
  let   toIdx   = employees.findIndex(em => em.id === targetId);
  if (fromIdx < 0 || toIdx < 0) { rowDragEnd(); return; }
  const [emp] = employees.splice(fromIdx, 1);
  toIdx = employees.findIndex(em => em.id === targetId);
  employees.splice(below ? toIdx + 1 : toIdx, 0, emp);
  save();
  rowDragEnd();
  render();
}

function rowDragEnd() {
  document.querySelectorAll('.emp-row').forEach(r =>
    r.classList.remove('row-dragging', 'row-drag-over-top', 'row-drag-over-bottom'));
  _rowDragId = null;
}

// show-hidden toggle
let showHidden = false;

// ─────────────────────────────────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────────────────────────────────
const uid  = () => 'e' + Math.random().toString(36).slice(2, 10);
const ds   = (y, m, d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const dim  = (y, m)    => new Date(y, m, 0).getDate();
const wday = (y, m, d) => new Date(y, m - 1, d).getDay();
const isWE = (y, m, d) => { const w = wday(y, m, d); return w === 0 || w === 6; };
const isTD = (y, m, d) => { const n = new Date(); return n.getFullYear() === y && n.getMonth() + 1 === m && n.getDate() === d; };
const esc  = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const WDAYS = ['周日','周一','周二','周三','周四','周五','周六'];

function visibleEmployees() {
  return showHidden ? employees : employees.filter(e => !e.hidden);
}

const _EYE_OPEN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const _EYE_SHUT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function _updateHiddenBtn() {
  const hiddenCount = employees.filter(e => e.hidden).length;
  const btn = document.getElementById('btn-show-hidden');
  btn.style.display = hiddenCount > 0 ? '' : 'none';
  btn.classList.toggle('active', showHidden);
  btn.innerHTML = showHidden ? _EYE_OPEN : _EYE_SHUT;
  btn.title = showHidden
    ? `点击隐藏（${hiddenCount} 人已隐藏）`
    : `显示已隐藏员工（${hiddenCount} 人）`;
}

function toggleShowHidden() {
  showHidden = !showHidden;
  _updateHiddenBtn();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
//  VALIDATION RULES
//  Rule 1  – consecutive limits: per shift, stored as shift.consec
//  Rule 2  – after hitting the consecutive limit the NEXT day must be rest
//  Rule 3  – no more than MAX_WORK_RUN consecutive work days (any shift type)
//  Rule 4  – exactly 8 rest days/month, with exactly one 2-day block
//  Rule 5  – per-day: every shift needs ≥1 worker; max scales with team size
//  Rule 6  – rest between consecutive shifts must be > MIN_SHIFT_GAP hours
// ─────────────────────────────────────────────────────────────────────────────
// Derived from SHIFTS[].consec — rebuilt by rebuildMaps() whenever shifts change
let CONSEC_LIMITS     = {};
const MAX_WORK_RUN    = 5;   // Rule 3: max consecutive work days (any shift type) before rest
const MIN_SHIFT_GAP   = 8;   // Rule 6: gap between consecutive shifts (hours, exclusive)
const REST_DAYS_MONTH = 8;   // Rule 4: required rest days per month
const REST_CONSEC_LEN = 2;   // Rule 4: exactly-N consecutive rest block length
const REST_CONSEC_CNT = 1;   // Rule 4: how many such blocks required
const MIN_PER_SHIFT   = 1;   // Rule 5: minimum workers per shift per day

// Parse shift end hour from time string "HH:MM–HH:MM" (midnight end → 24)
function _shiftEndH(sid) {
  const s = SMAP[sid];
  if (!s || sid === 'off') return null;
  const m = s.time.match(/–(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1]) + parseInt(m[2]) / 60;
  return h === 0 ? 24 : h;
}
// Parse shift start hour from time string
function _shiftStartH(sid) {
  const s = SMAP[sid];
  if (!s || sid === 'off') return null;
  const m = s.time.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) + parseInt(m[2]) / 60;
}
// Rest hours between end of sid1 on day d and start of sid2 on day d+1
function _restHours(sid1, sid2) {
  const e1 = _shiftEndH(sid1), s2 = _shiftStartH(sid2);
  if (e1 === null || s2 === null) return 24;
  return (s2 + 24) - e1;
}

function getShift(eid, d)      { return (schedule[eid] || {})[d] || null; }
function setShift(eid, d, sid) {
  if (!schedule[eid]) schedule[eid] = {};
  if (sid === null) delete schedule[eid][d]; else schedule[eid][d] = sid;
  save();
}

function rebuildMaps() {
  SMAP          = Object.fromEntries(SHIFTS.map(s => [s.id, s]));
  OMAP          = Object.fromEntries(SHIFTS.map(s => [s.orig, s.id]));
  CONSEC_LIMITS = Object.fromEntries(SHIFTS.map(s => [s.id, s.consec ?? 99]));
}

function cycleShift(cur) {
  const ids = SHIFTS.map(s => s.id);
  return ids[cur ? (ids.indexOf(cur) + 1) % ids.length : 0];
}

// ─────────────────────────────────────────────────────────────────────────────
//  PERSIST
// ─────────────────────────────────────────────────────────────────────────────
function save() {
  localStorage.setItem('ss_emp',          JSON.stringify(employees));
  localStorage.setItem('ss_sch',          JSON.stringify(schedule));
  localStorage.setItem('ss_shifts',       JSON.stringify(SHIFTS));
  localStorage.setItem('ss_default_dept', defaultDept);
  localStorage.setItem('ss_mon',          JSON.stringify({ y: curYear, m: curMonth }));
  localStorage.setItem('ss_locked',       JSON.stringify(lockedMonths));
}

function isMonthLocked(y, m) {
  const yr = y ?? curYear, mo = m ?? curMonth;
  return !!lockedMonths[yr + '-' + String(mo).padStart(2, '0')];
}

function toggleMonthLock() {
  const key = curYear + '-' + String(curMonth).padStart(2, '0');
  if (lockedMonths[key]) delete lockedMonths[key];
  else lockedMonths[key] = true;
  save();
  _updateLockBtn();
}

function _updateLockBtn() {
  const btn = document.getElementById('btn-lock-month');
  if (!btn) return;
  const locked = isMonthLocked();
  btn.classList.toggle('is-locked', locked);
  btn.title = locked ? '当前月已锁定（点击解锁）' : '锁定本月排班';
  // swap icon
  btn.querySelector('.icon-unlocked').style.display = locked ? 'none' : '';
  btn.querySelector('.icon-locked').style.display   = locked ? ''     : 'none';
}

function load() {
  // shift config — fall back to defaults
  const savedShifts = localStorage.getItem('ss_shifts');
  SHIFTS = savedShifts ? JSON.parse(savedShifts) : DEFAULT_SHIFTS.map(s => ({ ...s }));
  rebuildMaps();

  // Migrate: remove weekend shift if it still exists in saved config
  SHIFTS = SHIFTS.filter(s => s.id !== 'weekend');
  // Migrate: add consec field if missing (old saves won't have it)
  const _defaultConsec = { night: 3, day: 5, evening: 4, off: 2 };
  SHIFTS.forEach(s => { if (s.consec === undefined) s.consec = _defaultConsec[s.id] ?? 3; });
  rebuildMaps();

  const e   = localStorage.getItem('ss_emp');
  const sc  = localStorage.getItem('ss_sch');
  const mo  = localStorage.getItem('ss_mon');
  const dd  = localStorage.getItem('ss_default_dept');
  const lk  = localStorage.getItem('ss_locked');

  if (e)  employees    = JSON.parse(e);
  if (sc) schedule     = JSON.parse(sc);
  if (dd) defaultDept  = dd;
  if (lk) lockedMonths = JSON.parse(lk);

  // Back-compat: migrate empUid → eid; default blank → '0'
  employees.forEach(emp => {
    if (emp.empUid) { if (!emp.eid) emp.eid = emp.empUid; delete emp.empUid; }
    if (!emp.eid) emp.eid = '0';
  });

  if (mo) { const p = JSON.parse(mo); curYear = p.y; curMonth = p.m; }
  else    { const n = new Date(); curYear = n.getFullYear(); curMonth = n.getMonth() + 1; }

  // Persist any migrations applied above
  if (e) localStorage.setItem('ss_emp', JSON.stringify(employees));
}

// ─────────────────────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, duration = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ─────────────────────────────────────────────────────────────────────────────
//  GENERIC CONFIRM DIALOG
//  showConfirm({ title, msg, note, okLabel, variant, icon }) → Promise<bool>
//  variant: 'danger' | 'warning' | 'info'  (default: 'warning')
//  icon: inner HTML string for the icon element
// ─────────────────────────────────────────────────────────────────────────────
let _appConfirmResolve = null;

const _CONFIRM_ICONS = {
  danger: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>`,
  warning: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,
  info: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>`,
};

function showConfirm({ title = '确认操作', msg = '', note = '', okLabel = '确认', variant = 'warning', icon = null } = {}) {
  return new Promise(resolve => {
    _appConfirmResolve = resolve;
    const overlay = document.getElementById('app-confirm-overlay');
    const modal   = document.getElementById('app-confirm-modal');
    document.getElementById('app-confirm-title').textContent  = title;
    document.getElementById('app-confirm-msg').textContent    = msg;
    document.getElementById('app-confirm-note').textContent   = note;
    document.getElementById('app-confirm-ok').textContent     = okLabel;
    document.getElementById('app-confirm-icon').innerHTML     = icon ?? _CONFIRM_ICONS[variant] ?? _CONFIRM_ICONS.warning;
    modal.className = 'app-confirm-modal variant-' + variant;
    overlay.classList.add('open');
  });
}

function _appConfirmClose(result) {
  document.getElementById('app-confirm-overlay').classList.remove('open');
  if (_appConfirmResolve) { _appConfirmResolve(result); _appConfirmResolve = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  BADGE
// ─────────────────────────────────────────────────────────────────────────────
function badge(sid) {
  if (!sid || !SMAP[sid]) return '<span class="empty-dot">·</span>';
  const s = SMAP[sid];
  return `<span class="badge" style="background:${s.color};color:${s.txt}">
    <span class="badge-lbl">${esc(s.lbl)}</span>
    <span class="badge-sub">${esc(s.sub)}</span>
  </span>`;
}
