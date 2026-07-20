/* ══════════════════════════════════════════════════════════════════════════════
   ShiftScheduler — app.js
   Rendering, UI, modals, and initialization.
   (Global state and helpers live in data.js; validation in validation.js;
    generator in generator.js.)
   ══════════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────────
//  APP-LOCAL STATE
// ─────────────────────────────────────────────────────────────────────────────
let _draftShifts = [];

const _svCharts = {};

// ─────────────────────────────────────────────────────────────────────────────
//  GRID RENDER  (no 部门 column; UID shown as subtitle under name)
// ─────────────────────────────────────────────────────────────────────────────
function renderGrid() {
  const days = dim(curYear, curMonth);

  // Precompute day violations (Rule 5)
  const _dayViol = {};
  for (let d = 1; d <= days; d++) _dayViol[d] = _getDayViolations(curYear, curMonth, d);
  _lastDayViol = _dayViol;

  // ── thead
  let th = `<tr>
    <th class="c-name" style="padding:6px 10px;left:0;font-size:13px;font-weight:800;color:#1e293b;text-align:left">姓名</th>`;
  for (let d = 1; d <= days; d++) {
    const we = isWE(curYear, curMonth, d);
    const dv = _dayViol[d];
    const dvTip = dv?.hasViol ? esc(dv.violations.map(v =>
      v.count < 1 ? `${v.lbl}：0人（需至少1人）` : `${v.lbl}：${v.count}人（上限${v.maxPS}人）`
    ).join('\n')) : '';
    th += `<th class="dh${we?' wknd':''}${dv?.hasViol?' viol-day':''}" data-day="${d}"${dvTip?` title="${dvTip}"`:''}>
      <div class="dh-num">${d}</div>
      <div class="dh-wd">${WDAYS[wday(curYear, curMonth, d)]}</div>
    </th>`;
  }
  th += '</tr>';
  document.getElementById('tbl-head').innerHTML = th;

  // ── tbody — stats row first, then employees
  let tb = '';

  // stats row (second row, right after header)
  tb += '<tr class="stats-row"><td class="c-name">当日出勤人数</td>';
  for (let d = 1; d <= days; d++) {
    const date = ds(curYear, curMonth, d);
    const n = employees.filter(e => { const s = getShift(e.id, date); return s && s !== 'off'; }).length;
    tb += `<td>${n || ''}</td>`;
  }
  tb += '</tr>';

  // Precompute violations for all employees
  const _viol = {};
  employees.forEach(emp => { _viol[emp.id] = _getViolations(emp.id, curYear, curMonth); });
  _lastViol = _viol;
  _updateViolationBtn();

  _updateHiddenBtn();
  visibleEmployees().forEach(emp => {
    const rv = _viol[emp.id];
    const rowViolated = rv && rv.rowViol;
    tb += `<tr class="emp-row${emp.hidden?' hidden-row':''}${rowViolated?' viol-row':''}" data-eid="${emp.id}"
      ondragover="rowDragOver(event,'${emp.id}')"
      ondrop="rowDrop(event,'${emp.id}')"
      ondragend="rowDragEnd()">
      <td class="c-name" data-eid="${emp.id}" oncontextmenu="ctxEmp(event,'${emp.id}')">
        <div style="display:flex;align-items:center;gap:5px">
          <div class="row-drag-handle" draggable="true" ondragstart="rowDragStart(event,'${emp.id}')">
            <svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.2"/><circle cx="6.5" cy="2"  r="1.2"/>
              <circle cx="2.5" cy="6.5" r="1.2"/><circle cx="6.5" cy="6.5" r="1.2"/>
              <circle cx="2.5" cy="11" r="1.2"/><circle cx="6.5" cy="11" r="1.2"/>
            </svg>
          </div>
          <div>
            <div class="name-clickable" style="font-weight:700;font-size:15px" onclick="openWorkerDetail('${emp.id}')">${esc(emp.name)}</div>
            ${emp.eid && emp.eid !== '0' ? `<div class="sub-info uid-sub">${esc(emp.eid)}</div>` : ''}
          </div>
        </div>
      </td>`;
    for (let d = 1; d <= days; d++) {
      const date = ds(curYear, curMonth, d);
      const sid  = getShift(emp.id, date);
      const we   = isWE(curYear, curMonth, d);
      const violCls = rv
        ? (rv.consecViol.has(date) || rv.gapViol?.has(date) ? ' viol-consec'
          : rv.weekViol.has(d) ? ' viol-week' : '')
        : '';
      tb += `<td class="sc${we?' wknd-bg':''}${violCls}"
        data-eid="${emp.id}" data-date="${date}" data-day="${d}"
        onmousedown="dragStart(event,this,'${emp.id}','${date}')"
        onmouseover="dragOver(this,'${emp.id}','${date}')"
        onmouseup="dragEnd()"
        onmouseenter="_gridOver('${emp.id}',${d})"
        onmouseleave="_gridOut()"
        oncontextmenu="ctxShift(event,'${emp.id}','${date}')"
      >${badge(sid)}</td>`;
    }
    tb += '</tr>';
  });

  document.getElementById('tbl-body').innerHTML = tb;
  document.getElementById('tbl-wrap')?.classList.toggle('month-locked', isMonthLocked());
}

// ─────────────────────────────────────────────────────────────────────────────
//  GRID HOVER HIGHLIGHTS
// ─────────────────────────────────────────────────────────────────────────────
function _gridOver(eid, day) {
  document.querySelectorAll('.c-name.grid-hl, .dh.grid-hl').forEach(el => el.classList.remove('grid-hl'));
  const nameTd = document.querySelector(`#tbl-body .c-name[data-eid="${eid}"]`);
  if (nameTd) nameTd.classList.add('grid-hl');
  const dayTh = document.querySelector(`#tbl-head th.dh[data-day="${day}"]`);
  if (dayTh) dayTh.classList.add('grid-hl');
}
function _gridOut() {
  document.querySelectorAll('.c-name.grid-hl, .dh.grid-hl').forEach(el => el.classList.remove('grid-hl'));
}

// ─────────────────────────────────────────────────────────────────────────────
//  FAST CELL UPDATE
// ─────────────────────────────────────────────────────────────────────────────
function updateCells() {
  // Recompute employee violations (Rules 1-3)
  const _viol = {};
  employees.forEach(emp => { _viol[emp.id] = _getViolations(emp.id, curYear, curMonth); });
  _lastViol = _viol;
  // Recompute day violations (Rule 5)
  const _dayViol = {};
  for (let d = 1; d <= dim(curYear, curMonth); d++) _dayViol[d] = _getDayViolations(curYear, curMonth, d);
  _lastDayViol = _dayViol;
  _updateViolationBtn();

  document.querySelectorAll('.sc').forEach(td => {
    const eid  = td.dataset.eid;
    const date = td.dataset.date;
    if (!eid || !date) return;
    td.classList.remove('drag-hi', 'viol-consec', 'viol-week');
    const sid = getShift(eid, date);
    td.innerHTML = badge(sid);
    td.removeAttribute('data-tip');
    const vr = _viol[eid];
    if (vr) {
      const d = parseInt(date.slice(8), 10);
      if (vr.consecViol.has(date) || vr.gapViol?.has(date)) td.classList.add('viol-consec');
      else if (vr.weekViol.has(d)) td.classList.add('viol-week');
    }
  });
  // Update row-level violation (Rule 3)
  document.querySelectorAll('#tbl-body .emp-row').forEach(tr => {
    const eid = tr.dataset.eid;
    const vr  = _viol[eid];
    tr.classList.toggle('viol-row', !!(vr && vr.rowViol));
  });
  // Update day column headers (Rule 5)
  document.querySelectorAll('#tbl-head th[data-day]').forEach(th => {
    const d  = parseInt(th.dataset.day, 10);
    const dv = _dayViol[d];
    th.classList.toggle('viol-day', !!(dv && dv.hasViol));
    if (dv?.hasViol) {
      th.title = dv.violations.map(v =>
        v.count < 1 ? `${v.lbl}：0人（需至少1人）` : `${v.lbl}：${v.count}人（上限${v.maxPS}人）`
      ).join('\n');
    } else {
      th.removeAttribute('title');
    }
  });
  document.querySelectorAll('#tbl-body .stats-row td:not(.c-name)').forEach((td, i) => {
    const date = ds(curYear, curMonth, i + 1);
    const n = employees.filter(e => { const s = getShift(e.id, date); return s && s !== 'off'; }).length;
    td.textContent = n || '';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  DRAG TO FILL
// ─────────────────────────────────────────────────────────────────────────────
function dragStart(e, el, eid, date) {
  if (e.button !== 0) return;
  if (isMonthLocked()) { showToast('当前月份已锁定，无法修改排班'); return; }
  e.preventDefault();
  dragging  = true;
  dragShift = cycleShift(getShift(eid, date));
  dragSet   = new Set();
  _dragAdd(el, eid, date);
}

function dragOver(el, eid, date) {
  if (!dragging) return;
  _dragAdd(el, eid, date);
}

function _dragAdd(el, eid, date) {
  const key = eid + '|' + date;
  if (dragSet.has(key)) return;
  dragSet.add(key);
  el.classList.add('drag-hi');
}

function dragEnd() {
  if (!dragging) return;
  dragging = false;
  if (dragSet.size) undoPush();
  dragSet.forEach(k => {
    const [eid, date] = k.split('|');
    setShift(eid, date, dragShift);
  });
  dragSet.clear();
  dragShift = null;
  if (curView === 'grid') updateCells(); else if (curView === 'timeline') renderTimeline(); else renderStats();
}

document.addEventListener('mouseup',    dragEnd);
document.addEventListener('mouseleave', dragEnd);

// ─────────────────────────────────────────────────────────────────────────────
//  CONTEXT MENU – SHIFT CELL
// ─────────────────────────────────────────────────────────────────────────────
function ctxShift(e, eid, date) {
  e.preventDefault();
  e.stopPropagation();
  if (isMonthLocked()) { showToast('当前月份已锁定，无法修改排班'); return; }
  if (_ctxCell && _ctxCell.eid === eid && _ctxCell.date === date) { _closeCtx(); return; }
  _ctxCell  = { eid, date };
  _ctxEmpId = null;
  const cur = getShift(eid, date);

  let h = SHIFTS.map(s => `
    <div class="ctx-item" onclick="_applyShift('${s.id}')">
      <div class="ctx-dot" style="background:${s.color};${cur===s.id?'outline:2px solid #3b82f6;outline-offset:1px':''}"></div>
      ${esc(s.lbl)}
      <span class="ctx-sub">${esc(s.sub)}</span>
      ${cur === s.id ? '<span class="ctx-check">✓</span>' : ''}
    </div>`).join('');

  h += `<div class="ctx-sep"></div>
    <div class="ctx-item ctx-danger" onclick="_applyShift(null)">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      </svg>
      清除
    </div>`;

  _showCtx(h, e.clientX, e.clientY);
}

function _applyShift(sid) {
  if (_ctxCell) {
    undoPush();
    setShift(_ctxCell.eid, _ctxCell.date, sid);
    if (curView === 'grid') updateCells(); else if (curView === 'timeline') renderTimeline(); else renderStats();
    // Sync worker detail modal if it's open for this employee
    if (_wdEmpId === _ctxCell.eid) {
      _renderWdCalendar();
      _renderWdStats();
    }
  }
  _closeCtx();
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONTEXT MENU – EMPLOYEE
// ─────────────────────────────────────────────────────────────────────────────
function ctxEmp(e, eid) {
  e.preventDefault();
  e.stopPropagation();
  if (_ctxEmpId === eid) { _closeCtx(); return; }
  _ctxEmpId = eid;
  _ctxCell  = null;

  const emp = employees.find(e => e.id === eid);
  const isHidden = emp && emp.hidden;
  const h = `
    <div class="ctx-item" onclick="_editEmp('${eid}')">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
      编辑信息
    </div>
    <div class="ctx-item" onclick="_toggleHideEmp('${eid}')">
      ${isHidden
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 显示员工`
        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> 隐藏员工`}
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-item ctx-danger" onclick="_deleteEmp('${eid}')">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
      </svg>
      删除员工
    </div>`;

  _showCtx(h, e.clientX, e.clientY);
}

function _editEmp(eid) {
  _closeCtx();
  const emp = employees.find(e => e.id === eid);
  if (!emp) return;
  _editingEmpId = eid;
  document.getElementById('emp-modal-title').textContent = '编辑员工信息';
  document.getElementById('inp-name').value = emp.name;
  document.getElementById('inp-eid').value  = emp.eid  || '0';
  document.getElementById('inp-dept').value = emp.dept || defaultDept;
  document.getElementById('emp-modal').classList.add('open');
  setTimeout(() => document.getElementById('inp-name').focus(), 60);
}

function _toggleHideEmp(eid) {
  _closeCtx();
  const emp = employees.find(e => e.id === eid);
  if (!emp) return;
  emp.hidden = !emp.hidden;
  save();
  _updateHiddenBtn();
  render();
  showToast(emp.hidden ? `已隐藏 ${emp.name}` : `已显示 ${emp.name}`);
}

async function _deleteEmp(eid) {
  _closeCtx();
  const ok = await showConfirm({
    title: '删除员工', variant: 'danger', okLabel: '确认删除',
    msg: '确定删除该员工及所有排班数据？',
    note: '此操作不可撤销。',
  });
  if (!ok) return;
  employees = employees.filter(e => e.id !== eid);
  delete schedule[eid];
  save();
  render();
}

// ctx helpers
function _showCtx(html, x, y) {
  const m = document.getElementById('ctx-menu');
  m.innerHTML = html;
  // Render off-screen to measure actual dimensions before positioning
  m.style.left = '-9999px';
  m.style.top  = '-9999px';
  m.classList.add('open');
  const { width: mw, height: mh } = m.getBoundingClientRect();
  const pad = 6;
  m.style.left = (x + mw + pad > window.innerWidth  ? x - mw : x) + 'px';
  m.style.top  = (y + mh + pad > window.innerHeight ? Math.max(pad, y - mh) : y) + 'px';
}
function _closeCtx() {
  document.getElementById('ctx-menu').classList.remove('open');
  _ctxCell  = null;
  _ctxEmpId = null;
}

document.addEventListener('click', e => {
  if (!document.getElementById('ctx-menu').contains(e.target)) _closeCtx();
});

document.addEventListener('contextmenu', e => {
  if (!document.getElementById('ctx-menu').contains(e.target)) _closeCtx();
});

// ─────────────────────────────────────────────────────────────────────────────
//  EMPLOYEE MODAL  (add + edit)
// ─────────────────────────────────────────────────────────────────────────────
function openEmpModal() {
  _editingEmpId = null;
  document.getElementById('emp-modal-title').textContent = '添加员工';
  document.getElementById('inp-name').value = '';
  document.getElementById('inp-eid').value  = '';
  document.getElementById('inp-dept').value = defaultDept;
  document.getElementById('emp-modal').classList.add('open');
  setTimeout(() => document.getElementById('inp-name').focus(), 60);
}

function closeEmpModal() {
  document.getElementById('emp-modal').classList.remove('open');
  _editingEmpId = null;
}

function confirmEmp() {
  const name = document.getElementById('inp-name').value.trim();
  if (!name) { document.getElementById('inp-name').focus(); return; }
  const eid  = document.getElementById('inp-eid').value.trim()  || '0';
  const dept = document.getElementById('inp-dept').value.trim() || defaultDept;

  const deptManual = dept !== defaultDept;
  if (_editingEmpId) {
    const emp = employees.find(e => e.id === _editingEmpId);
    if (emp) { emp.name = name; emp.eid = eid; emp.dept = dept; emp.deptManual = deptManual; }
  } else {
    const emp = { id: uid(), name, eid, dept, deptManual };
    employees.push(emp);
    schedule[emp.id] = {};
  }

  save();
  closeEmpModal();
  render();
}

// keyboard shortcuts on modal inputs
['inp-name','inp-eid','inp-dept'].forEach((id, i, arr) => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (i < arr.length - 1) document.getElementById(arr[i + 1]).focus();
      else confirmEmp();
    }
  });
});

document.getElementById('emp-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('emp-modal')) closeEmpModal();
});

// ─────────────────────────────────────────────────────────────────────────────
//  TIMELINE RENDER
// ─────────────────────────────────────────────────────────────────────────────
function renderTimeline() {
  const days = dim(curYear, curMonth);

  let h = '';

  // header — data-day on each cell for highlight targeting
  h += '<div class="tl-head"><div class="tl-name-hd">姓名</div><div class="tl-days-hd">';
  for (let d = 1; d <= days; d++) {
    const we = isWE(curYear, curMonth, d);
    h += `<div class="tl-dh${we?' wknd':''}" data-day="${d}">
      <span>${d}</span>${WDAYS[wday(curYear, curMonth, d)]}
    </div>`;
  }
  h += '</div></div>';

  // employee rows
  _updateHiddenBtn();
  visibleEmployees().forEach(emp => {
    h += `<div class="tl-row${emp.hidden ? ' hidden-row' : ''}">
      <div class="tl-name-cell" data-emp="${emp.id}" onclick="openWorkerDetail('${emp.id}')" style="cursor:pointer">
        <div class="tl-name name-clickable">${esc(emp.name)}</div>
        ${emp.eid && emp.eid !== '0' ? `<div class="tl-dept uid-sub-tl">${esc(emp.eid)}</div>` : ''}
      </div>
      <div class="tl-shifts">`;

    // Build segments with start day tracked
    const segs = [];
    let cur = null;
    for (let d = 1; d <= days; d++) {
      const sid = getShift(emp.id, ds(curYear, curMonth, d)) || 'off';
      if (!cur || cur.sid !== sid) { cur = { sid, n: 1, start: d }; segs.push(cur); }
      else cur.n++;
    }

    segs.forEach(seg => {
      const s     = SMAP[seg.sid] || SHIFTS[SHIFTS.length - 1];
      const pct   = (seg.n / days * 100).toFixed(4) + '%';
      const isOff = seg.sid === 'off' || !SMAP[seg.sid];
      const end   = seg.start + seg.n - 1;
      h += `<div class="tl-block${isOff?' off-block':''}"
        style="width:${pct};background:${s.color};color:${s.txt}"
        data-emp="${emp.id}" data-start="${seg.start}" data-end="${end}" data-n="${seg.n}"
        data-lbl="${esc(s.lbl)}" data-time="${esc(s.time)}" data-isoff="${isOff}"
        onmouseenter="_tlOver(event,this)" onmouseleave="_tlOut()" onmousemove="_tlMove(event)">
        <span>${seg.n >= 3 ? esc(s.lbl) : seg.n >= 2 ? esc(s.sub) : ''}</span>
      </div>`;
    });

    h += '</div></div>';
  });

  document.getElementById('tl-view').innerHTML = h;
}

function _tlOver(e, el) {
  const empId = el.dataset.emp;
  const start = +el.dataset.start;
  const end   = +el.dataset.end;
  const n     = +el.dataset.n;
  const lbl   = el.dataset.lbl;
  const time  = el.dataset.time;
  const isOff = el.dataset.isoff === 'true';

  // Highlight name cell
  document.querySelectorAll('.tl-name-cell').forEach(nc =>
    nc.classList.toggle('tl-hl', nc.dataset.emp === empId));
  // Highlight day headers in range
  document.querySelectorAll('.tl-dh[data-day]').forEach(dh => {
    const d = +dh.dataset.day;
    dh.classList.toggle('tl-hl', d >= start && d <= end);
  });

  // Populate and show tooltip
  const tip = document.getElementById('tl-tooltip');
  const m   = curMonth;
  tip.innerHTML = isOff
    ? `<div class="tl-tip-row"><span class="tl-tip-lbl">休息</span></div>
       <div class="tl-tip-row">${m}月${start}日${n > 1 ? ' – ' + m + '月' + end + '日' : ''}</div>
       <div class="tl-tip-row" style="opacity:.7">${n} 天</div>`
    : `<div class="tl-tip-row"><span class="tl-tip-lbl">${lbl}</span><span class="tl-tip-time">${time}</span></div>
       <div class="tl-tip-row">${m}月${start}日 – ${m}月${end}日</div>
       <div class="tl-tip-row" style="opacity:.7">连续 ${n} 天</div>`;
  tip.style.display = 'block';
  _tlMove(e);
}

function _tlMove(e) {
  const tip = document.getElementById('tl-tooltip');
  if (tip.style.display === 'none') return;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = e.clientX + 14, y = e.clientY - 10;
  if (x + tw > window.innerWidth - 8)  x = e.clientX - tw - 14;
  if (y + th > window.innerHeight - 8) y = e.clientY - th - 10;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function _tlOut() {
  document.getElementById('tl-tooltip').style.display = 'none';
  document.querySelectorAll('.tl-name-cell.tl-hl').forEach(el => el.classList.remove('tl-hl'));
  document.querySelectorAll('.tl-dh.tl-hl').forEach(el => el.classList.remove('tl-hl'));
}

// ─────────────────────────────────────────────────────────────────────────────
//  COPY TSV
//  Format matches the original:
//    UID  部门  工号  姓名  2026/7/1\n周三  2026/7/2\n周四  ...
// ─────────────────────────────────────────────────────────────────────────────
function _tsvCell(v) {
  const s = String(v == null ? '' : v);
  // Quote cells that contain tabs, newlines, or double-quotes
  if (s.includes('\t') || s.includes('\n') || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function copyTSV() {
  const days = dim(curYear, curMonth);

  // Build date header strings: "2026/7/1\n周三" (no leading zeros, matches original)
  const dateHeaders = [];
  for (let d = 1; d <= days; d++) {
    const wd = wday(curYear, curMonth, d);
    dateHeaders.push(`${curYear}/${curMonth}/${d}\n${WDAYS[wd]}`);
  }

  const rows = [];

  // Header row
  rows.push(['UID', '部门', '工号', '姓名', ...dateHeaders].map(_tsvCell).join('\t'));

  // Data rows — UID = eid (工号), 工号 column left empty to match source format
  employees.filter(emp => !emp.hidden).forEach(emp => {
    const shiftCols = [];
    for (let d = 1; d <= days; d++) {
      const date = ds(curYear, curMonth, d);
      const sid  = getShift(emp.id, date);
      shiftCols.push(sid && SMAP[sid] ? SMAP[sid].orig : '');
    }
    rows.push([
      emp.eid  || '0',          // UID column
      emp.dept || defaultDept,  // 部门 column
      '',                       // 工号 column (empty in source)
      emp.name,                 // 姓名 column
      ...shiftCols,
    ].map(_tsvCell).join('\t'));
  });

  const tsv = rows.join('\n');

  try {
    await navigator.clipboard.writeText(tsv);
  } catch {
    // Fallback for browsers that block clipboard API
    const ta = document.createElement('textarea');
    ta.value = tsv;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // Visual feedback
  const btn = document.getElementById('btn-copy-tsv');
  btn.classList.add('copied');
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> 已复制！`;
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> 复制 TSV`;
  }, 2000);

  showToast(`已复制 ${employees.length} 名员工 × ${days} 天的排班表`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  CSV IMPORT
// ─────────────────────────────────────────────────────────────────────────────
// ── CSV line reassembler ───────────────────────────────────────────────────
// Quoted fields can contain literal newlines (e.g. "2026/7/1\n周三").
// Splitting on \n breaks those fields across multiple raw lines.
// This function joins them back into one logical CSV line per record.
function _reassembleCSVLines(rawLines) {
  const out = [];
  let cur = '', inQ = false;
  for (const raw of rawLines) {
    if (cur) cur += '\n';
    cur += raw;
    for (const ch of raw) { if (ch === '"') inQ = !inQ; }
    if (!inQ) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

// ── csv/tsv importer ─────────────────────────────────────────────────
// Supported layouts (first column must be "UID"):
//   Min: UID, 姓名, dates...              → dateStart=2
//   New: UID, 工号, 姓名, dates...        → dateStart=3
//   Old: UID, 部门, 工号, 姓名, dates...  → dateStart=4
// Delimiter: auto-detected (tab or comma).
// Date header formats accepted: YYYY/M/D  or  M/D/YYYY
function importCSV(ev) {
  const file = ev.target.files[0];
  if (!file) return;

  const _doImport = async text => {
    try {
      const rawLines = text.trim().split(/\r?\n/);
      if (rawLines.length < 2) { showToast('CSV 格式不正确：行数不足', 4000); return; }

      // Auto-detect delimiter
      const tabCols   = rawLines[0].split('\t').length;
      const commaCols = rawLines[0].split(',').length;
      const isTSV     = tabCols > commaCols;

      // TSV fields never span multiple lines; CSV quoted fields may contain \n
      const lines   = isTSV ? rawLines.filter(l => l.trim()) : _reassembleCSVLines(rawLines);
      const parseFn = isTSV ? (l => l.split('\t').map(s => s.trim())) : _parseCSVLine;
      const headers = parseFn(lines[0]);

      // ── Format detection ─────────────────────────────────────────────
      // Dates accepted: YYYY/M/D (app export) or M/D/YYYY (external sources)
      const dateHeaderRe = /^(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/;
      if (headers[0] !== 'UID') {
        showToast('格式不匹配：请上传指定排班表（首列须为 UID）', 5000);
        ev.target.value = '';
        return;
      }
      // Find where dates start: take the leftmost column (≥2) that looks like a date.
      // Scanning left-to-right ensures we pick col 2 over col 3 when both are dates
      // (e.g. a 2-column-prefix file where col 2 = first date, col 3 = second date).
      let dateStart = -1;
      for (let i = 2; i < Math.min(headers.length, 6); i++) {
        if (dateHeaderRe.test(headers[i] || '')) { dateStart = i; break; }
      }
      if (dateStart < 0) {
        showToast('格式不匹配：未找到日期列（须为 YYYY/M/D 或 M/D/YYYY 格式）', 5000);
        ev.target.value = '';
        return;
      }
      const nameIdx = dateStart - 1;
      const eidIdx  = Math.max(0, dateStart - 2);

      // ── Parse date headers → "YYYY-MM-DD" keys ──────────────────────
      function _parseDateHeader(str) {
        const s = str.split(/[\n\r]/)[0].trim();
        let m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
        if (m) return ds(+m[1], +m[2], +m[3]);
        m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m) return ds(+m[3], +m[1], +m[2]);
        return null;
      }
      const dateKeys = [];
      for (let i = dateStart; i < headers.length; i++) {
        const k = _parseDateHeader(headers[i]);
        if (k) dateKeys.push(k);
      }
      if (!dateKeys.length) { showToast('CSV 日期列解析失败', 4000); return; }

      // ── Confirm replace vs merge ─────────────────────────────────────
      const replace = await showConfirm({
        title: '导入方式', variant: 'warning', okLabel: '清空后导入',
        msg: '是否清空现有数据后导入？',
        note: '点击取消 = 追加/合并到现有员工',
      });
      undoPush();
      if (replace) { employees = []; schedule = {}; }

      // ── Import each employee row ─────────────────────────────────────
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols   = parseFn(lines[i]);
        const empUid = (cols[0]       || '').trim();
        const eid    = (cols[eidIdx]  || '').trim();
        const name   = (cols[nameIdx] || '').trim();
        if (!name) continue;

        const dept = defaultDept;

        let emp = (empUid && employees.find(e => e.eid === empUid))
               || employees.find(e => e.name === name);
        if (!emp) {
          emp = { id: uid(), eid: empUid || eid || '0', name, dept, deptManual: false };
          employees.push(emp);
        } else {
          if (empUid && !emp.eid) emp.eid = empUid;
          if (!emp.deptManual) emp.dept = dept;
        }

        if (!schedule[emp.id]) schedule[emp.id] = {};
        dateKeys.forEach((dateKey, idx) => {
          const raw = (cols[dateStart + idx] || '').trim().replace(/\s+/g, '');
          if (!raw) return;
          const sid = OMAP[raw]
            ?? (raw.startsWith('Patrol') ? null : 'off');
          if (sid) schedule[emp.id][dateKey] = sid;
        });
        imported++;
      }

      // ── Navigate to imported month ───────────────────────────────────
      if (dateKeys[0]) {
        const p = dateKeys[0].split('-');
        curYear = +p[0]; curMonth = +p[1];
      }
      save(); render();
      showToast(`已导入 ${imported} 名员工 · ${dateKeys.length} 天排班 ✓`, 3000);
    } catch (err) {
      showToast('导入失败：' + err.message, 4000);
    }
    ev.target.value = '';
  };

  // Read as raw bytes so we can try multiple encodings.
  // UTF-8 BOM → UTF-8; replacement chars (U+FFFD) detected → retry as GBK.
  const reader = new FileReader();
  reader.onload = e => {
    const buf = e.target.result;
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (text.includes('\uFFFD')) {
      text = new TextDecoder('gbk', { fatal: false }).decode(buf);
    }
    _doImport(text);
  };
  reader.readAsArrayBuffer(file);
}

function _parseCSVLine(line) {
  const res = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { res.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  res.push(cur.trim());
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MONTH NAVIGATION & VIEW SWITCH
// ─────────────────────────────────────────────────────────────────────────────
function changeMonth(delta) {
  curMonth += delta;
  if (curMonth > 12) { curMonth = 1;  curYear++; }
  if (curMonth < 1)  { curMonth = 12; curYear--; }
  save();
  render();
}

async function resetCurrentMonth() {
  if (isMonthLocked()) { showToast('当前月份已锁定，请先解锁'); return; }
  const label = `${curYear}年${curMonth}月`;
  const ok = await showConfirm({
    title: '清除本月排班', variant: 'danger', okLabel: '确认清除',
    msg: `清除 ${label} 所有员工的排班数据？`,
    note: '可通过 Ctrl+Z 撤销。',
  });
  if (!ok) return;
  undoPush();
  const D = dim(curYear, curMonth);
  for (const emp of employees) {
    if (!schedule[emp.id]) continue;
    for (let d = 1; d <= D; d++) delete schedule[emp.id][ds(curYear, curMonth, d)];
  }
  save();
  render();
  showToast(`已清除 ${label} 排班`);
}

function goToday() {
  const n = new Date();
  curYear  = n.getFullYear();
  curMonth = n.getMonth() + 1;
  save();
  render();
}

function switchView(v) {
  curView = v;
  document.getElementById('grid-view').style.display  = v === 'grid'     ? 'block' : 'none';
  document.getElementById('tl-view').style.display    = v === 'timeline' ? 'block' : 'none';
  document.getElementById('stats-view').style.display = v === 'stats'    ? 'block' : 'none';
  document.getElementById('btn-grid').classList.toggle('active',  v === 'grid');
  document.getElementById('btn-tl').classList.toggle('active',    v === 'timeline');
  document.getElementById('btn-stats').classList.toggle('active', v === 'stats');
  // hide controls-right in stats view (violations/add/dice are grid-only)
  document.querySelector('.controls-right').style.visibility = v === 'stats' ? 'hidden' : '';
  // reset button is grid-only
  const resetBtn = document.getElementById('btn-reset-month');
  if (resetBtn) resetBtn.style.display = v === 'grid' ? '' : 'none';
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
//  RULES MODAL
// ─────────────────────────────────────────────────────────────────────────────
function openRulesModal() {
  // Populate consec limits table from live SHIFTS/CONSEC_LIMITS
  const tbody = document.getElementById('rules-consec-body');
  tbody.innerHTML = '';
  SHIFTS.forEach(s => {
    const lim = CONSEC_LIMITS[s.id];
    if (lim === undefined) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="shift-dot" style="background:${s.color}"></span>${s.lbl}${s.sub && s.sub !== '—' ? ' (' + s.sub + ')' : ''}</td>
      <td>${lim} 天</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('rules-max-run').textContent = MAX_WORK_RUN;
  document.getElementById('rules-min-gap').textContent = MIN_SHIFT_GAP;
  document.getElementById('rules-shift-count').textContent = SHIFTS.filter(s => s.id !== 'off').length;
  document.getElementById('rules-rest-days').textContent = REST_DAYS_MONTH;
  document.getElementById('rules-consec-len').textContent = REST_CONSEC_LEN;
  document.getElementById('rules-consec-cnt').textContent = REST_CONSEC_CNT;
  document.getElementById('rules-min-per-shift').textContent = MIN_PER_SHIFT;
  document.getElementById('rules-overlay').classList.add('open');
}
function closeRulesModal() {
  document.getElementById('rules-overlay').classList.remove('open');
}

// ─────────────────────────────────────────────────────────────────────────────
//  SETTINGS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function openSettings() {
  _draftShifts = SHIFTS.map(s => ({ ...s }));
  document.getElementById('cfg-default-dept').value = defaultDept;
  _renderShiftRows();
  document.getElementById('settings-overlay').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
  _draftShifts = [];
}

document.getElementById('settings-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('settings-overlay')) closeSettings();
});

function _renderShiftRows() {
  const container = document.getElementById('shift-config-rows');
  container.innerHTML = _draftShifts.map((s, i) => _shiftRowHTML(s, i)).join('');
  _draftShifts.forEach((s, i) => {
    const picker  = document.getElementById(`cfg-color-${i}`);
    const preview = document.getElementById(`cfg-prev-${i}`);
    if (!picker || !preview) return;
    picker.addEventListener('input', e => {
      _draftShifts[i].color = e.target.value;
      preview.style.background = e.target.value;
    });
  });
}

function _shiftRowHTML(s, i) {
  return `<div class="shift-config-row" id="scr-${i}">
    <div class="sc-col sc-col-color">
      <div class="color-swatch-wrap" title="点击选择颜色">
        <div class="color-preview" id="cfg-prev-${i}" style="background:${s.color}"></div>
        <input type="color" id="cfg-color-${i}" value="${s.color}">
      </div>
    </div>
    <div class="sc-col sc-col-label">
      <input class="cfg-input" id="cfg-lbl-${i}"  value="${esc(s.lbl)}"  placeholder="显示名称" maxlength="6"
        oninput="_draftUpdate(${i},'lbl',this.value)">
    </div>
    <div class="sc-col sc-col-sub">
      <input class="cfg-input" id="cfg-sub-${i}"  value="${esc(s.sub)}"  placeholder="缩写" maxlength="6"
        oninput="_draftUpdate(${i},'sub',this.value)">
    </div>
    <div class="sc-col sc-col-time">
      <input class="cfg-input" id="cfg-time-${i}" value="${esc(s.time)}" placeholder="例：08:00–16:00"
        oninput="_draftUpdate(${i},'time',this.value)">
    </div>
    <div class="sc-col sc-col-orig">
      <input class="cfg-input" id="cfg-orig-${i}" value="${esc(s.orig)}" placeholder="CSV/TSV 原始名"
        oninput="_draftUpdate(${i},'orig',this.value)">
    </div>
    <div class="sc-col sc-col-consec">
      <input class="cfg-input cfg-input-num" id="cfg-consec-${i}" type="number" min="1" max="31" value="${s.consec ?? 3}"
        oninput="_draftUpdate(${i},'consec',Math.max(1,+this.value||1))">
    </div>
    <div class="sc-col sc-col-del">
      <button class="btn-del-shift" title="删除此班次" onclick="_deleteShiftRow(${i})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </div>`;
}

function _draftUpdate(i, field, value) {
  if (_draftShifts[i]) {
    _draftShifts[i][field] = value;
    if (field === 'color') document.getElementById(`cfg-prev-${i}`).style.background = value;
  }
}

async function _deleteShiftRow(i) {
  const s = _draftShifts[i];
  const inUse = employees.some(emp => Object.values(schedule[emp.id] || {}).includes(s.id));
  if (inUse) {
    const ok = await showConfirm({
      title: '删除班次', variant: 'warning', okLabel: '确认删除',
      msg: `班次"${s.lbl}"已在排班中使用，删除后相关单元格将变为空白。`,
      note: '确认后操作不可撤销。',
    });
    if (!ok) return;
  }
  _draftShifts.splice(i, 1);
  _renderShiftRows();
}

function addShiftRow() {
  _draftShifts.push({ id: uid(), lbl: '新班次', sub: 'New', time: '00:00–00:00', color: '#64748b', txt: '#ffffff', orig: 'NewShift', consec: 3 });
  _renderShiftRows();
  const rows = document.querySelectorAll('.shift-config-row');
  if (rows.length) rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _autoTextColor(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.55 ? '#1a1a1a' : '#ffffff';
}

function saveSettings() {
  _draftShifts.forEach((s, i) => {
    const lbl  = document.getElementById(`cfg-lbl-${i}`)?.value.trim();
    const sub  = document.getElementById(`cfg-sub-${i}`)?.value.trim();
    const time = document.getElementById(`cfg-time-${i}`)?.value.trim();
    const orig   = document.getElementById(`cfg-orig-${i}`)?.value.trim();
    const col    = document.getElementById(`cfg-color-${i}`)?.value;
    const consec = parseInt(document.getElementById(`cfg-consec-${i}`)?.value, 10);
    if (lbl)              s.lbl    = lbl;
    if (sub)              s.sub    = sub;
    if (time)             s.time   = time;
    if (orig)             s.orig   = orig;
    if (col)            { s.color  = col; s.txt = _autoTextColor(col); }
    if (consec >= 1)      s.consec = consec;
  });
  if (_draftShifts.length === 0) { alert('至少需要保留一种班次类型'); return; }

  // Save default dept — auto-update employees who haven't been manually assigned a dept
  const newDept = document.getElementById('cfg-default-dept').value.trim();
  if (newDept && newDept !== defaultDept) {
    defaultDept = newDept;
    employees.forEach(emp => {
      if (!emp.deptManual) emp.dept = newDept;
    });
  } else if (newDept) {
    defaultDept = newDept;
  }

  SHIFTS = _draftShifts.map(s => ({ ...s }));
  rebuildMaps();
  save();
  render();
  closeSettings();
  showToast('设置已保存');
}

async function resetShiftsToDefault() {
  const ok = await showConfirm({
    title: '恢复默认设置', variant: 'warning', okLabel: '确认恢复',
    msg: '恢复为默认班次设置？当前自定义配置将丢失。',
    note: '此操作不可撤销。',
  });
  if (!ok) return;
  _draftShifts = DEFAULT_SHIFTS.map(s => ({ ...s }));
  document.getElementById('cfg-default-dept').value = DEFAULT_DEPT;
  _renderShiftRows();
}

// ─────────────────────────────────────────────────────────────────────────────
//  WORKER DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function openWorkerDetail(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  _wdEmpId  = empId;
  _wdYear   = curYear;
  _wdMonth  = curMonth;

  const deptVal = emp.dept || defaultDept;
  const eidVal  = emp.eid  || '0';

  const nameDisp = document.getElementById('wd-disp-name');
  const eidDisp  = document.getElementById('wd-disp-eid');
  const deptDisp = document.getElementById('wd-disp-dept');
  if (nameDisp) nameDisp.textContent = emp.name;
  if (eidDisp)  {
    eidDisp.textContent    = eidVal !== '0' ? eidVal : '';
    eidDisp.style.display  = eidVal !== '0' ? '' : 'none';
  }
  if (deptDisp) deptDisp.textContent = deptVal;

  _renderWdCalendar();
  _renderWdStats();
  document.getElementById('wd-overlay').classList.add('open');
}

function closeWorkerDetail() {
  document.getElementById('wd-overlay').classList.remove('open');
  _wdEmpId = null;
  if (_wdChart) { _wdChart.destroy(); _wdChart = null; }
}

document.getElementById('wd-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('wd-overlay')) closeWorkerDetail();
});

function _wdChangeMonth(delta) {
  _wdMonth += delta;
  if (_wdMonth > 12) { _wdMonth = 1;  _wdYear++; }
  if (_wdMonth < 1)  { _wdMonth = 12; _wdYear--; }
  _renderWdCalendar();
  _renderWdStats();
}

function _renderWdCalendar() {
  if (!_wdEmpId) return;
  document.getElementById('wd-cal-title').textContent = `${_wdYear}年${_wdMonth}月`;
  const days     = dim(_wdYear, _wdMonth);
  const firstDay = wday(_wdYear, _wdMonth, 1);   // 0 = Sun

  let h = '';

  // Weekday header row
  WDAYS.forEach((wd, i) => {
    h += `<div class="wd-cal-wh${(i===0||i===6)?' wknd':''}">${wd.slice(1)}</div>`;
  });

  // Empty cells before the 1st
  for (let i = 0; i < firstDay; i++) h += '<div class="wd-cal-day empty"></div>';

  // Day cells
  for (let d = 1; d <= days; d++) {
    const date = ds(_wdYear, _wdMonth, d);
    const sid  = getShift(_wdEmpId, date);
    const s    = sid ? SMAP[sid] : null;
    const we   = isWE(_wdYear, _wdMonth, d);
    h += `<div class="wd-cal-day${we?' wknd-bg':''}"
      onclick="wdCellClick(${d})"
      oncontextmenu="wdCellCtx(event,${d})">
      <div class="wd-day-num">${d}</div>
      ${s ? `<div class="wd-day-badge" style="background:${s.color};color:${s.txt}">${esc(s.sub)}</div>` : '<div class="wd-day-empty">·</div>'}
    </div>`;
  }

  document.getElementById('wd-cal').innerHTML = h;
}

function _renderWdStats() {
  if (!_wdEmpId) return;
  const days   = dim(_wdYear, _wdMonth);
  const counts = {};
  SHIFTS.forEach(s => { counts[s.id] = 0; });

  for (let d = 1; d <= days; d++) {
    const sid = getShift(_wdEmpId, ds(_wdYear, _wdMonth, d));
    if (sid && counts[sid] !== undefined) counts[sid]++;
  }

  // Doughnut chart
  if (_wdChart) { _wdChart.destroy(); _wdChart = null; }
  const ctx = document.getElementById('wd-chart').getContext('2d');
  const data = SHIFTS.map(s => counts[s.id] || 0);
  const hasData = data.some(v => v > 0);
  const totalWork = SHIFTS.filter(s => s.id !== 'off').reduce((sum, s) => sum + (counts[s.id] || 0), 0);

  const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart) {
      const { ctx: c, chartArea: { left, right, top, bottom } } = chart;
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#0f172a';
      c.font = 'bold 22px system-ui, sans-serif';
      c.fillText(totalWork, cx, cy - 7);
      c.fillStyle = '#94a3b8';
      c.font = '11px system-ui, sans-serif';
      c.fillText('出勤天数', cx, cy + 11);
      c.restore();
    }
  };

  _wdChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: SHIFTS.map(s => s.lbl),
      datasets: [{
        data: hasData ? data : [1],
        backgroundColor: hasData ? SHIFTS.map(s => s.color) : ['#e2e8f0'],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 5,
      }]
    },
    options: {
      cutout: '60%',
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: hasData,
          callbacks: { label: c => ` ${c.label}：${c.raw} 天` }
        }
      },
      animation: { duration: 280 }
    },
    plugins: [centerTextPlugin]
  });

  // Stats list
  let listH = '';
  SHIFTS.forEach(s => {
    const cnt = counts[s.id] || 0;
    const pct = days > 0 ? Math.round(cnt / days * 100) : 0;
    listH += `<div class="wd-stat-row">
      <div class="wd-stat-dot" style="background:${s.color}"></div>
      <div class="wd-stat-lbl">${esc(s.lbl)}</div>
      <div class="wd-stat-cnt">${cnt}</div>
      <div class="wd-stat-pct">${pct}%</div>
    </div>`;
  });
  document.getElementById('wd-stats-list').innerHTML = listH;
}

function wdCellClick(d) {
  if (!_wdEmpId) return;
  const date = ds(_wdYear, _wdMonth, d);
  if (isMonthLocked(_wdYear, _wdMonth)) { showToast('该月份已锁定，无法修改排班'); return; }
  undoPush();
  setShift(_wdEmpId, date, cycleShift(getShift(_wdEmpId, date)));
  _renderWdCalendar();
  _renderWdStats();
  if (curView === 'grid') updateCells(); else if (curView === 'timeline') renderTimeline(); else renderStats();
}

function wdCellCtx(e, d) {
  e.preventDefault();
  if (isMonthLocked(_wdYear, _wdMonth)) { showToast('该月份已锁定，无法修改排班'); return; }
  ctxShift(e, _wdEmpId, ds(_wdYear, _wdMonth, d));
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN RENDER DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────
function render() {
  document.getElementById('month-label').textContent = `${curYear}年${curMonth}月`;
  _updateLockBtn();
  if (curView === 'grid') renderGrid();
  else if (curView === 'timeline') renderTimeline();
  else if (curView === 'stats') renderStats();
}

// ─────────────────────────────────────────────────────────────────────────────
//  STATISTICS VIEW
// ─────────────────────────────────────────────────────────────────────────────
function _svDestroy(id) {
  if (_svCharts[id]) { _svCharts[id].destroy(); delete _svCharts[id]; }
}

function renderStats() {
  const D    = dim(curYear, curMonth);
  const emps = visibleEmployees();
  const WORK = SHIFTS.filter(s => s.id !== 'off');

  // ── Aggregate data ──────────────────────────────────────────────────────
  // totals[shiftId] = total days across all workers
  const totals = {};
  SHIFTS.forEach(s => { totals[s.id] = 0; });

  // perEmp[empId][shiftId] = count
  const perEmp = {};
  emps.forEach(emp => {
    perEmp[emp.id] = {};
    SHIFTS.forEach(s => { perEmp[emp.id][s.id] = 0; });
    for (let d = 1; d <= D; d++) {
      const sid = getShift(emp.id, ds(curYear, curMonth, d));
      if (sid && perEmp[emp.id][sid] !== undefined) {
        perEmp[emp.id][sid]++;
        totals[sid]++;
      }
    }
  });

  // daily[d][shiftId] = count  (d = 1..D)
  const daily = Array.from({ length: D }, (_, i) => {
    const obj = {};
    SHIFTS.forEach(s => { obj[s.id] = 0; });
    emps.forEach(emp => {
      const sid = getShift(emp.id, ds(curYear, curMonth, i + 1));
      if (sid && obj[sid] !== undefined) obj[sid]++;
    });
    return obj;
  });

  const grandTotal = WORK.reduce((s, sh) => s + totals[sh.id], 0);

  // ── Card 1: Overall Donut ───────────────────────────────────────────────
  _svDestroy('donut');
  const donutCtx = document.getElementById('sc-donut').getContext('2d');
  const donutData = SHIFTS.map(s => totals[s.id]);
  const hasDonut  = donutData.some(v => v > 0);
  const donutTotal = WORK.reduce((s, sh) => s + totals[sh.id], 0);

  // External tooltip handler for donut
  function _donutTipHandler({ chart, tooltip }) {
    const tip = document.getElementById('sv-donut-tip');
    if (!tip) return;
    if (!hasDonut || !tooltip.dataPoints?.length || tooltip.opacity === 0) {
      tip.classList.remove('sv-tip-visible');
      return;
    }
    const idx = tooltip.dataPoints[0].dataIndex;
    const sh  = SHIFTS[idx];
    if (!sh) { tip.classList.remove('sv-tip-visible'); return; }

    const count = donutData[idx];
    const tot   = donutData.reduce((a, b) => a + b, 0);
    const pct   = tot > 0 ? Math.round(count / tot * 100) : 0;

    // Populate fields — use sh.txt for text to ensure contrast on light shifts (e.g. 休息)
    const fgColor = sh.id === 'off' ? '#374151' : sh.color;
    tip.querySelector('.sv-tip-stripe').style.background = sh.color;
    const nameEl  = tip.querySelector('.sv-tip-name');
    nameEl.textContent = sh.lbl;
    nameEl.style.color = fgColor;
    tip.querySelector('.sv-tip-time').textContent = sh.time;
    const countEl = tip.querySelector('.sv-tip-count');
    countEl.innerHTML = `<span>${count}</span><span class="sv-tip-unit">次</span>`;
    countEl.style.color = fgColor;
    const pctEl = tip.querySelector('.sv-tip-pct');
    pctEl.textContent = pct + '%';
    pctEl.style.background = sh.id === 'off' ? '#f3f4f6' : sh.color + '22';
    pctEl.style.color = fgColor;

    // Position
    const rect   = chart.canvas.getBoundingClientRect();
    const cx     = (chart.chartArea.left + chart.chartArea.right) / 2;
    const onRight = tooltip.caretX >= cx;
    tip.classList.toggle('sv-tip-right', onRight);
    tip.classList.toggle('sv-tip-left',  !onRight);

    const TW = 172; // approx tooltip width
    const tx  = rect.left + tooltip.caretX;
    const ty  = rect.top  + tooltip.caretY;
    tip.style.left = onRight ? (tx + 16) + 'px' : (tx - 16 - TW) + 'px';
    tip.style.top  = (ty - 44) + 'px';
    tip.classList.add('sv-tip-visible');
  }

  _svCharts['donut'] = new Chart(donutCtx, {
    type: 'doughnut',
    data: {
      labels: SHIFTS.map(s => s.lbl),
      datasets: [{
        data: hasDonut ? donutData : [1],
        backgroundColor: hasDonut ? SHIFTS.map(s => s.color) : ['#e2e8f0'],
        borderWidth: 2, borderColor: '#fff', hoverOffset: 8,
      }]
    },
    options: {
      cutout: '58%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: _donutTipHandler }
      },
      animation: { duration: 350 }
    },
    plugins: [{
      id: 'svCenter',
      afterDraw(chart) {
        const { ctx: c, chartArea: { left, right, top, bottom } } = chart;
        const cx = (left + right) / 2, cy = (top + bottom) / 2;
        c.save();
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#0f172a';
        c.font = 'bold 26px system-ui,sans-serif';
        c.fillText(donutTotal, cx, cy - 9);
        c.fillStyle = '#94a3b8';
        c.font = '11px system-ui,sans-serif';
        c.fillText('总出勤天数', cx, cy + 12);
        c.restore();
      }
    }]
  });
  // Hide tooltip when mouse leaves the donut canvas
  donutCtx.canvas.addEventListener('mouseleave', () => {
    const tip = document.getElementById('sv-donut-tip');
    if (tip) tip.classList.remove('sv-tip-visible');
  });


  // ── Card 2: Per-worker stacked horizontal bar ───────────────────────────
  _svDestroy('workerBar');
  const wbCtx = document.getElementById('sc-worker-bar').getContext('2d');
  // Resize canvas height based on # of employees
  const wbHeight = Math.max(180, emps.length * 42 + 40);
  document.getElementById('sc-worker-bar').style.height = wbHeight + 'px';

  _svCharts['workerBar'] = new Chart(wbCtx, {
    type: 'bar',
    data: {
      labels: emps.map(e => e.name),
      datasets: WORK.map(s => ({
        label: s.lbl,
        data: emps.map(e => perEmp[e.id][s.id] || 0),
        backgroundColor: s.color + 'cc',
        borderColor: s.color,
        borderWidth: 1,
        borderRadius: 4,
      }))
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: { color: '#f1f5f9' },
          ticks: { stepSize: 1, font: { size: 11 } },
          title: { display: true, text: '天数', font: { size: 11 }, color: '#94a3b8' }
        },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 12, weight: '600' } } }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            footer: items => {
              const total = items.reduce((s, i) => s + i.raw, 0);
              return `合计出勤：${total} 天`;
            }
          }
        }
      },
      animation: { duration: 350 }
    }
  });

  // ── Card 3: Daily coverage stacked area ────────────────────────────────
  _svDestroy('daily');
  const dayLabels = Array.from({ length: D }, (_, i) => `${i + 1}日`);
  const dailyCtx  = document.getElementById('sc-daily').getContext('2d');

  _svCharts['daily'] = new Chart(dailyCtx, {
    type: 'line',
    data: {
      labels: dayLabels,
      datasets: WORK.map(s => ({
        label: s.lbl,
        data: daily.map(obj => obj[s.id]),
        borderColor: s.color,
        backgroundColor: s.color + '33',
        fill: true,
        tension: 0.35,
        pointRadius: D <= 14 ? 4 : 2,
        pointHoverRadius: 5,
        borderWidth: 2,
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { color: '#f8fafc' },
          ticks: { font: { size: 10 }, maxRotation: 0,
            callback: (_, i) => (i + 1) % 5 === 1 || i === D - 1 ? `${i+1}日` : ''
          }
        },
        y: {
          stacked: false,
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { stepSize: 1, font: { size: 11 } },
          title: { display: true, text: '人数', font: { size: 11 }, color: '#94a3b8' }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, borderRadius: 3, useBorderRadius: true, font: { size: 11 }, padding: 14 }
        }
      },
      animation: { duration: 350 }
    },
    plugins: [{
      id: 'dailyLegendGap',
      beforeInit(chart) {
        const origFit = chart.legend.fit.bind(chart.legend);
        chart.legend.fit = function () { origFit(); this.height += 20; };
      }
    }]
  });

  // ── Card 4: Summary table ───────────────────────────────────────────────
  const workCols = WORK;
  let th = `<tr>
    <th>姓名</th>
    ${workCols.map(s => `<th class="num"><span class="sv-tbl-badge" style="background:${s.color};color:${s.txt}">${s.sub}</span></th>`).join('')}
    <th class="num">出勤</th>
    <th class="num">休息</th>
    <th class="num">未填</th>
  </tr>`;

  // foot totals
  const colTotals = {};
  SHIFTS.forEach(s => { colTotals[s.id] = 0; });

  let rows = '';
  emps.forEach(emp => {
    const pc = perEmp[emp.id];
    const worked = WORK.reduce((s, sh) => s + (pc[sh.id] || 0), 0);
    const offCnt = pc['off'] || 0;
    const unfilled = D - worked - offCnt;
    SHIFTS.forEach(s => { colTotals[s.id] += pc[s.id] || 0; });
    rows += `<tr>
      <td class="sv-tbl-name">${esc(emp.name)}</td>
      ${workCols.map(s => `<td class="num">${pc[s.id] || 0}</td>`).join('')}
      <td class="num" style="color:#2563eb">${worked}</td>
      <td class="num" style="color:#6b7280">${offCnt}</td>
      <td class="num" style="color:${unfilled > 0 ? '#ef4444' : '#94a3b8'}">${unfilled}</td>
    </tr>`;
  });

  const footWorked = WORK.reduce((s, sh) => s + colTotals[sh.id], 0);
  const footOff    = colTotals['off'] || 0;
  const footTotal  = D * emps.length;
  const footUnfill = footTotal - footWorked - footOff;
  const tfoot = `<tr>
    <td>合计</td>
    ${workCols.map(s => `<td class="num">${colTotals[s.id]}</td>`).join('')}
    <td class="num" style="color:#2563eb">${footWorked}</td>
    <td class="num" style="color:#6b7280">${footOff}</td>
    <td class="num" style="color:${footUnfill > 0 ? '#ef4444' : '#94a3b8'}">${footUnfill}</td>
  </tr>`;

  document.getElementById('sc-table-wrap').innerHTML =
    `<table class="sv-summary-table"><thead>${th}</thead><tbody>${rows}</tbody><tfoot>${tfoot}</tfoot></table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeEmpModal(); closeSettings(); closeWorkerDetail(); closeViolationsModal(); _closeDiceConfirm(); _closeCtx(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────
load();
render();
