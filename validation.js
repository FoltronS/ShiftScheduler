/* ══════════════════════════════════════════════════════════════════════════════
   ShiftScheduler — validation.js
   Violation detection and violation panel UI.
   ══════════════════════════════════════════════════════════════════════════════ */

function _getViolations(empId, year, month) {
  const days       = dim(year, month);
  const consecViol = new Set();   // date strings → Rule 1 / 2 red cell
  const weekViol   = new Set();   // day numbers  → Rule 3 amber cell
  const gapViol    = new Set();   // date strings → Rule 6 red cell
  let   rowViol    = false;       //               → Rule 4 row border
  const reasons    = [];          // { rule, text }

  const prevYear  = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevDays  = dim(prevYear, prevMonth);
  const nextYear  = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  // Date label helpers
  const _fmtDs = dateStr => {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (y === year && m === month) return `${d}日`;
    return (y < year || (y === year && m < month)) ? `上月${d}日` : `次月${d}日`;
  };

  // ── Rule 1 + Rule 2 ──────────────────────────────────────────────────────────
  const maxLim = Math.max(...Object.values(CONSEC_LIMITS));
  const seq = [];
  for (let d = Math.max(1, prevDays - maxLim); d <= prevDays; d++)
    seq.push({ date: ds(prevYear, prevMonth, d), inCur: false });
  for (let d = 1; d <= days; d++)
    seq.push({ date: ds(year, month, d), inCur: true });
  // Include first day of next month so Rule 2 can check cross-month boundary
  seq.push({ date: ds(nextYear, nextMonth, 1), inCur: false });

  let i = 0;
  while (i < seq.length) {
    const sid = getShift(empId, seq[i].date);
    const lim = sid ? CONSEC_LIMITS[sid] : null;
    if (!lim) { i++; continue; }
    let j = i;
    while (j < seq.length && getShift(empId, seq[j].date) === sid) j++;
    const runLen = j - i;

    // Rule 1: run exceeds limit
    if (runLen > lim) {
      const hasCur = seq.slice(i, j).some(s => s.inCur);
      if (hasCur) {
        const lbl = SMAP[sid]?.lbl || sid;
        reasons.push({ rule: 1, text:
          `${sid === 'off' ? '连续休息' : lbl + '连续'} ${runLen} 天` +
          `（${_fmtDs(seq[i].date)}–${_fmtDs(seq[j-1].date)}，上限 ${lim} 天）` });
      }
      for (let k = i + lim; k < j; k++)
        if (seq[k].inCur) consecViol.add(seq[k].date);
    }

    // Rule 2: after hitting the consecutive limit, next day must be rest
    if (runLen >= lim && sid !== 'off' && j < seq.length) {
      const nextSid = getShift(empId, seq[j].date);
      if (nextSid && nextSid !== 'off' && seq[j].inCur) {
        consecViol.add(seq[j].date);
        const lbl = SMAP[sid]?.lbl || sid;
        reasons.push({ rule: 2, text:
          `${lbl}连续 ${runLen} 天后 ${_fmtDs(seq[j].date)} 须为休息日` });
      }
    }

    i = j;
  }

  // ── Rule 3: no more than MAX_WORK_RUN consecutive work days (any shift) ────
  // Reuse seq (already includes prev-month tail + current month + next month day 1)
  { let k = 0;
    while (k < seq.length) {
      const sid = getShift(empId, seq[k].date);
      if (!sid || sid === 'off') { k++; continue; }
      // Start of a work run
      let m = k;
      while (m < seq.length) {
        const s = getShift(empId, seq[m].date);
        if (!s || s === 'off') break;
        m++;
      }
      const runLen = m - k;
      if (runLen > MAX_WORK_RUN) {
        const hasCur = seq.slice(k, m).some(s => s.inCur);
        if (hasCur) {
          reasons.push({ rule: 3, text:
            `连续上班 ${runLen} 天（${_fmtDs(seq[k].date)}–${_fmtDs(seq[m-1].date)}，上限 ${MAX_WORK_RUN} 天）` });
          for (let p = k + MAX_WORK_RUN; p < m; p++)
            if (seq[p].inCur) weekViol.add(parseInt(seq[p].date.slice(8), 10));
        }
      }
      k = m;
    }
  }

  // ── Rule 4 ──────────────────────────────────────────────────────────────────
  let offTotal = 0, exactTwoRuns = 0;
  { let d = 1;
    while (d <= days) {
      const sid = getShift(empId, ds(year, month, d));
      if (sid === 'off') {
        let e = d;
        while (e <= days && getShift(empId, ds(year, month, e)) === 'off') e++;
        const len = e - d;
        offTotal += len;
        if (len === 2) exactTwoRuns++;
        d = e;
      } else d++;
    }
  }
  rowViol = (offTotal !== REST_DAYS_MONTH) || (exactTwoRuns !== REST_CONSEC_CNT);
  if (offTotal !== REST_DAYS_MONTH)
    reasons.push({ rule: 4, text: `休息天数：${offTotal} 天（需 ${REST_DAYS_MONTH} 天）` });
  if (exactTwoRuns !== REST_CONSEC_CNT)
    reasons.push({ rule: 4, text: exactTwoRuns === 0
      ? `缺少连续 ${REST_CONSEC_LEN} 天的休息段`
      : `连续 ${REST_CONSEC_LEN} 天休息：${exactTwoRuns} 次（需恰好 ${REST_CONSEC_CNT} 次）` });

  // ── Rule 6: rest between consecutive shifts must be > MIN_SHIFT_GAP hours ───
  for (let d = 1; d <= days; d++) {
    const prevDate = d === 1 ? ds(prevYear, prevMonth, prevDays) : ds(year, month, d - 1);
    const curDate  = ds(year, month, d);
    const sid1 = getShift(empId, prevDate);
    const sid2 = getShift(empId, curDate);
    if (!sid1 || sid1 === 'off' || !sid2 || sid2 === 'off') continue;
    const gap = _restHours(sid1, sid2);
    if (gap <= MIN_SHIFT_GAP) {
      gapViol.add(curDate);
      const lbl1 = SMAP[sid1]?.lbl || sid1;
      const lbl2 = SMAP[sid2]?.lbl || sid2;
      const prevLbl = d === 1 ? `上月${prevDays}日` : `${d-1}日`;
      reasons.push({ rule: 6, text:
        `${prevLbl} ${lbl1} → ${d}日 ${lbl2}：间隔仅 ${gap} 小时（需 >${MIN_SHIFT_GAP} 小时）` });
    }
  }

  return { consecViol, weekViol, gapViol, rowViol, reasons };
}

//  RULE 5 — per-day: each work shift needs ≥1 worker; max scales with team size
//  (evening / 16-24 can have up to maxPerShift workers, not a fixed cap)
//  maxPerShift = max(2, ceil(visibleWorkers / 3))
//  ≤6 workers → max 2 | 7–9 → max 3 | 10–12 → max 4 …
function _maxPerShift(empCount) {
  const workShifts = SHIFTS.filter(s => s.id !== 'off').length || 1;
  return Math.max(2, Math.ceil(empCount / workShifts));
}

function _getDayViolations(year, month, d) {
  const date       = ds(year, month, d);
  const workShifts = SHIFTS.filter(s => s.id !== 'off');
  const vis        = visibleEmployees();   // only count what's shown on screen
  const maxPS      = _maxPerShift(vis.length);
  const violations = [];
  const totalWorking = vis.filter(emp => {
    const s = getShift(emp.id, date); return s && s !== 'off';
  }).length;
  workShifts.forEach(s => {
    const count       = vis.filter(emp => getShift(emp.id, date) === s.id).length;
    const isPreferred = s.id === 'evening';  // 16-24 prefers more workers
    // All shifts need ≥1 worker (only flagged when enough staff exist to cover all shifts)
    const minViol = totalWorking >= workShifts.length && count < 1;
    if (count > maxPS || minViol)
      violations.push({ sid: s.id, lbl: s.lbl, count, maxPS, isPreferred });
  });
  return { violations, hasViol: violations.length > 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
//  VIOLATIONS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function _updateViolationBtn() {
  const btn = document.getElementById('btn-violations');
  if (!btn) return;
  const empCount = visibleEmployees().filter(emp => {
    const vr = _lastViol[emp.id];
    return vr && (vr.consecViol.size > 0 || vr.weekViol.size > 0 || (vr.gapViol?.size || 0) > 0 || vr.rowViol);
  }).length;
  const dayCount = Object.values(_lastDayViol).filter(dv => dv.hasViol).length;
  const total    = empCount + dayCount;
  btn.style.display = total > 0 ? '' : 'none';
  const badge = btn.querySelector('.viol-btn-count');
  if (badge) badge.textContent = total;
}

function openViolationsModal() {
  const ol = document.getElementById('viol-overlay');
  if (!ol) return;
  document.getElementById('viol-modal-month').textContent = `${curYear}年${curMonth}月`;

  const RS = {
    1:   { bg: '#fef2f2', bd: '#fca5a5', cl: '#dc2626', lb: '规则 1'  },
    2:   { bg: '#fef2f2', bd: '#fca5a5', cl: '#dc2626', lb: '规则 2'  },
    3:   { bg: '#fefce8', bd: '#fde047', cl: '#a16207', lb: '规则 3'  },
    4:   { bg: '#fdf4ff', bd: '#e9d5ff', cl: '#7e22ce', lb: '规则 4'  },
    5:   { bg: '#fff7ed', bd: '#fed7aa', cl: '#c2410c', lb: '规则 5'  },
    6:   { bg: '#fef2f2', bd: '#fca5a5', cl: '#dc2626', lb: '规则 6'  },
  };

  function rBadge(rule) {
    const s = RS[rule] || RS[1];
    return '<span class="viol-rule-badge" style="background:' + s.bg +
           ';border-color:' + s.bd + ';color:' + s.cl + '">' + s.lb + '</span>';
  }
  function rRow(rule, text) {
    return '<div class="viol-reason-row">' + rBadge(rule) +
           '<span class="viol-reason-text">' + esc(text) + '</span></div>';
  }
  function empBlock(title, rows) {
    return '<div class="viol-emp-block"><div class="viol-emp-name">' + esc(title) +
           '</div><div class="viol-emp-reasons">' + rows + '</div></div>';
  }

  // Rule 4: recompute day violations fresh
  const days = dim(curYear, curMonth);
  const dayBlocks = [];
  for (let d = 1; d <= days; d++) {
    const dv = _getDayViolations(curYear, curMonth, d);
    if (!dv.hasViol) continue;
    const rows = dv.violations.map(v => {
      const text = v.count < 1
        ? v.lbl + '：0人（需至少 1 人）'
        : v.lbl + '：' + v.count + ' 人（上限 ' + v.maxPS + ' 人）';
      return rRow(4, text);
    }).join('');
    dayBlocks.push(empBlock(curMonth + '月' + d + '日', rows));
  }

  // Rules 1-3: recompute employee violations fresh
  const empBlocks = [];
  visibleEmployees().forEach(emp => {
    const vr = _getViolations(emp.id, curYear, curMonth);
    if (!vr.consecViol.size && !vr.weekViol.size && !vr.gapViol?.size && !vr.rowViol && !vr.reasons.length) return;
    const rows = vr.reasons.map(r => rRow(r.rule, r.text)).join('');
    empBlocks.push(empBlock(emp.name, rows));
  });

  let h = '';
  if (dayBlocks.length === 0 && empBlocks.length === 0) {
    h = '<div class="viol-empty">本月暂无违规</div>';
  } else {
    if (dayBlocks.length > 0) {
      if (empBlocks.length > 0) h += '<div class="viol-section-title">每日班次配置（规则 5）</div>';
      h += dayBlocks.join('');
    }
    if (empBlocks.length > 0) {
      if (dayBlocks.length > 0) h += '<div class="viol-section-title">员工排班（规则 1–4）</div>';
      h += empBlocks.join('');
    }
    h += '<div class="viol-footer-note">共 ' + (dayBlocks.length + empBlocks.length) + ' 项违规</div>';
  }

  document.getElementById('viol-body').innerHTML = h;
  ol.classList.add('open');
}

function closeViolationsModal() {
  document.getElementById('viol-overlay')?.classList.remove('open');
}
