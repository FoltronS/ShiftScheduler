/* ══════════════════════════════════════════════════════════════════════════════
   ShiftScheduler — generator.js
   Random schedule generator.
   ══════════════════════════════════════════════════════════════════════════════ */

function _randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

// Effective per-shift cap for a specific day.
// Night shift (0-8): hard cap of 1 on Tue–Sat (dow 2-6); standard cap otherwise.
// All other shifts: standard cap.
function _shiftDayCap(shiftId, year, month, d, empCount) {
  const dow = new Date(year, month - 1, d).getDay(); // 0=Sun, 6=Sat
  if (shiftId === 'night' && dow >= 2 && dow <= 6) return 1;
  return _maxPerShift(empCount);
}

function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = _randInt(0, i); [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Returns a Set<dayNumber> of off days for one employee, satisfying Rules 1-3.
// `budget` is an optional {dayNum: remainingCapacity} object; days with budget=0 are skipped.
// `trailWork` is the number of consecutive work days already at the end of the previous month;
// used to detect cross-month Rule 3 violations at the start of the generated pattern.
// The caller decrements budget after receiving the returned Set (budget is read-only here).
function _genOffDays(year, month, D, budget, trailWork = 0) {
  for (let att = 0; att < 400; att++) {
    const offs = new Set();

    // One pair of exactly-2 consecutive off days (budget-aware)
    const pairPool = [];
    for (let d = 1; d < D; d++) {
      if (!budget || ((budget[d] || 0) > 0 && (budget[d + 1] || 0) > 0)) pairPool.push(d);
    }
    if (pairPool.length === 0) return null;
    const p = pairPool[_randInt(0, pairPool.length - 1)];
    offs.add(p); offs.add(p + 1);

    // Pool: days not adjacent to the pair AND within budget
    const pool = [];
    for (let d = 1; d <= D; d++) {
      if ((d < p - 1 || d > p + 2) && (!budget || (budget[d] || 0) > 0)) pool.push(d);
    }
    _shuffle(pool);

    // Pick remaining singles (REST_DAYS_MONTH minus the pair), none adjacent to each other
    const singlesNeeded = REST_DAYS_MONTH - REST_CONSEC_LEN;
    const singles = [];
    for (const d of pool) {
      if (!singles.some(s => Math.abs(s - d) <= 1)) {
        singles.push(d);
        if (singles.length === singlesNeeded) break;
      }
    }
    if (singles.length < singlesNeeded) continue;
    singles.forEach(d => offs.add(d));

    // Structural check: every calendar week must include at least one off day
    // Days outside the month have no assignment, treated as rest → partial weeks at
    // the start/end of the month are automatically satisfied.
    const weekMap = {};
    for (let d = 1; d <= D; d++) {
      const dt  = new Date(year, month - 1, d);
      const dow = (dt.getDay() + 6) % 7;     // Mon = 0
      const mon = new Date(dt); mon.setDate(d - dow);
      const wk  = mon.toISOString().slice(0, 10);
      if (!weekMap[wk]) weekMap[wk] = mon;
    }

    let weekOk = true;
    for (const monDate of Object.values(weekMap)) {
      let hasRest = false;
      for (let i = 0; i < 7; i++) {
        const wd = new Date(monDate); wd.setDate(wd.getDate() + i);
        if (wd.getFullYear() !== year || wd.getMonth() + 1 !== month) { hasRest = true; break; }
        if (offs.has(wd.getDate())) { hasRest = true; break; }
      }
      if (!hasRest) { weekOk = false; break; }
    }
    if (!weekOk) continue;

    // Verify no consecutive work run exceeds Rule 3 limit (MAX_WORK_RUN).
    // Seed workRun with trailWork so cross-month runs at the start of the month
    // are counted correctly (e.g. 5 trailing work days in previous month means
    // day 1 of this month must be off if MAX_WORK_RUN = 5).
    let maxWorkRun = 0, workRun = trailWork;
    for (let d = 1; d <= D; d++) {
      if (offs.has(d)) { maxWorkRun = Math.max(maxWorkRun, workRun); workRun = 0; }
      else workRun++;
    }
    maxWorkRun = Math.max(maxWorkRun, workRun);
    if (maxWorkRun > MAX_WORK_RUN) continue;

    return offs;
  }
  return null;
}

// Check that the tail of a generated month doesn't make the next month impossible.
// For each work shift type, at least one employee must still be able to start
// month M+1 with that shift (considering Rule 1 consecutive limits and Rule 6 gaps
// from their trailing assignments at the end of month M).
// If any shift has zero eligible starters the draft is rejected and retried.
function _tailFeasible(draft, emps, year, month, D) {
  const WS = SHIFTS.filter(s => s.id !== 'off').map(s => s.id);

  for (const S of WS) {
    const canHave = emps.some(emp => {
      // Find the last non-off shift in the draft (needed for Rule 6 gap check).
      // Only need to look back a few days since off days act as gap resets.
      let lastWork = null;
      for (let d = D; d >= Math.max(1, D - 2); d--) {
        const sid = draft[emp.id]?.[ds(year, month, d)];
        if (sid && sid !== 'off') { lastWork = sid; break; }
      }
      // Rule 6: rest gap between last work shift and S on day 1 of next month
      if (lastWork && _restHours(lastWork, S) <= MIN_SHIFT_GAP) return false;

      // Rule 1: count trailing consecutive run of S (crossing into prior months if needed)
      let streak = 0;
      for (let d = D; d >= 1; d--) {
        if (draft[emp.id]?.[ds(year, month, d)] === S) streak++;
        else break;
      }
      // Also look into the previous month if the streak started on day 1
      if (streak > 0) {
        for (let off = 1; off <= (CONSEC_LIMITS[S] || 3); off++) {
          const {y, m, d: pd} = _offsetDay(year, month, 1, -off);
          if (getShift(emp.id, ds(y, m, pd)) === S) streak++;
          else break;
        }
      }
      if (streak >= (CONSEC_LIMITS[S] || 99)) return false;

      return true;
    });

    if (!canHave) return false;
  }
  return true;
}

// Resolve a day±offset across month boundaries → {y, m, d}
function _offsetDay(year, month, d, offset) {
  let cy = year, cm = month, cd = d + offset;
  while (cd < 1)           { cm--; if (cm < 1)  { cm = 12; cy--; } cd += dim(cy, cm); }
  while (cd > dim(cy, cm)) { cd -= dim(cy, cm); cm++; if (cm > 12) { cm =  1; cy++; } }
  return { y: cy, m: cm, d: cd };
}

// Lookup shift for any date: uses draft for the current month, schedule for others.
function _anyShift(draft, empId, year, month, y, m, d) {
  if (y === year && m === month) return draft[empId]?.[ds(y, m, d)] || null;
  return getShift(empId, ds(y, m, d));
}

// Try to change employee's shift on day d to newShift without breaking Rule 1 or Rule 5.
// Checks consecutive runs across month boundaries. Off days are never moved.
// Mutates draft on success, returns true/false.
function _trySetShift(draft, empId, year, month, D, d, newShift) {
  const date = ds(year, month, d);
  const old  = draft[empId][date];
  if (old === 'off' || old === newShift) return old === newShift;

  const lim = CONSEC_LIMITS[newShift] || 99;

  // Count the consecutive run of newShift around day d, crossing month boundaries
  let run = 1;
  for (let off = 1; off <= lim; off++) {
    const {y, m, d: cd} = _offsetDay(year, month, d, -off);
    if (_anyShift(draft, empId, year, month, y, m, cd) !== newShift) break;
    run++;
  }
  for (let off = 1; off <= lim; off++) {
    const {y, m, d: cd} = _offsetDay(year, month, d, +off);
    if (_anyShift(draft, empId, year, month, y, m, cd) !== newShift) break;
    run++;
  }
  if (run > lim) return false;

  // Rule 5: check gap with previous non-off day
  for (let off = 1; off <= 2; off++) {
    const {y, m, d: cd} = _offsetDay(year, month, d, -off);
    const ps = _anyShift(draft, empId, year, month, y, m, cd);
    if (!ps) break;
    if (ps === 'off') break;
    if (_restHours(ps, newShift) <= MIN_SHIFT_GAP) return false;
    break;
  }
  // Rule 5: check gap with next non-off day
  for (let off = 1; off <= 2; off++) {
    const {y, m, d: cd} = _offsetDay(year, month, d, +off);
    const ns = _anyShift(draft, empId, year, month, y, m, cd);
    if (!ns) break;
    if (ns === 'off') break;
    if (_restHours(newShift, ns) <= MIN_SHIFT_GAP) return false;
    break;
  }

  draft[empId][date] = newShift;
  return true;
}

// Non-mutating Rule 1 + Rule 6 validity check for setting empId[d] = newShift.
// Reads the draft as-is (caller may have already tentatively set draft[empId][date]).
function _shiftChangeValid(draft, empId, year, month, d, newShift) {
  const lim = CONSEC_LIMITS[newShift] ?? 99;
  let run = 1;
  for (let off = 1; off <= lim; off++) {
    const {y, m, d: cd} = _offsetDay(year, month, d, -off);
    if (_anyShift(draft, empId, year, month, y, m, cd) !== newShift) break;
    run++;
  }
  for (let off = 1; off <= lim; off++) {
    const {y, m, d: cd} = _offsetDay(year, month, d, +off);
    if (_anyShift(draft, empId, year, month, y, m, cd) !== newShift) break;
    run++;
  }
  if (run > lim) return false;
  for (let off = 1; off <= 2; off++) {
    const {y, m, d: cd} = _offsetDay(year, month, d, -off);
    const ps = _anyShift(draft, empId, year, month, y, m, cd);
    if (!ps || ps === 'off') break;
    if (_restHours(ps, newShift) <= MIN_SHIFT_GAP) return false;
    break;
  }
  for (let off = 1; off <= 2; off++) {
    const {y, m, d: cd} = _offsetDay(year, month, d, +off);
    const ns = _anyShift(draft, empId, year, month, y, m, cd);
    if (!ns || ns === 'off') break;
    if (_restHours(newShift, ns) <= MIN_SHIFT_GAP) return false;
    break;
  }
  return true;
}

// Cross-employee bilateral swap: for each shift type S, find (overEmp, underEmp)
// pairs and swap their assignments on the same day.  Since both employees exchange
// shifts simultaneously, daily coverage stays unchanged — eliminating the
// "othersOver < 1" block that defeats _rebalanceIndividual for evening.
// Target tolerance: each employee's count of S within [floor(mean), ceil(mean)].
function _rebalanceCrossEmployee(draft, emps, year, month, D) {
  const WS = SHIFTS.filter(s => s.id !== 'off').map(s => s.id);

  for (let iter = 0; iter < emps.length * 16; iter++) {
    let swapped = false;

    for (const S of WS) {
      const cnt = {};
      for (const emp of emps) {
        cnt[emp.id] = 0;
        for (let d = 1; d <= D; d++) {
          if (draft[emp.id]?.[ds(year, month, d)] === S) cnt[emp.id]++;
        }
      }
      const total = emps.reduce((sum, e) => sum + cnt[e.id], 0);
      const mean  = total / emps.length;
      const lo    = Math.floor(mean);
      const hi    = Math.ceil(mean);

      const overs  = emps.filter(e => cnt[e.id] > hi).sort((a, b) => cnt[b.id] - cnt[a.id]);
      const unders = emps.filter(e => cnt[e.id] < lo).sort((a, b) => cnt[a.id] - cnt[b.id]);
      if (!overs.length || !unders.length) continue;

      const days = Array.from({ length: D }, (_, i) => i + 1);
      _shuffle(days);

      outer:
      for (const overEmp of overs) {
        for (const underEmp of unders) {
          if (overEmp.id === underEmp.id) continue;
          for (const d of days) {
            const date = ds(year, month, d);
            if (draft[overEmp.id][date] !== S) continue;
            const T = draft[underEmp.id][date];
            if (!T || T === 'off' || T === S) continue;

            // Tentatively apply swap, then validate both sides
            draft[overEmp.id][date]  = T;
            draft[underEmp.id][date] = S;
            const ok = _shiftChangeValid(draft, overEmp.id,  year, month, d, T)
                    && _shiftChangeValid(draft, underEmp.id, year, month, d, S);
            if (ok) {
              cnt[overEmp.id]--;
              cnt[underEmp.id]++;
              swapped = true;
              break outer;
            }
            // Revert if invalid
            draft[overEmp.id][date]  = S;
            draft[underEmp.id][date] = T;
          }
        }
      }
    }

    if (!swapped) break;
  }
}

// Per-employee shift-count balancer: swaps days between shifts for each employee
// until each shift count sits within [floor(W/N), ceil(W/N)] (N = # of work shifts),
// while preserving Rules 1, 5, and 6.
//
// Key improvement over the old version: tries ALL (over, under) pairs each iteration
// rather than stopping at the first blocked pair.  This enables two-step paths like
// evening→day (intermediate) then day→night on a later pass — which is needed because
// evening is a "sink" shift: direct evening→night / evening→day swaps are often blocked
// by Rule 6 (gap ≤ 8h), but an intermediate evening→day swap can unblock a day→night.
function _rebalanceIndividual(draft, emps, year, month, D) {
  const WS = SHIFTS.filter(s => s.id !== 'off').map(s => s.id);

  for (const emp of emps) {
    const used = Object.fromEntries(WS.map(id => [id, 0]));
    for (let d = 1; d <= D; d++) {
      const s = draft[emp.id]?.[ds(year, month, d)];
      if (s && used[s] !== undefined) used[s]++;
    }

    const W  = WS.reduce((sum, s) => sum + used[s], 0);
    const lo = Math.floor(W / WS.length);
    const hi = Math.ceil(W / WS.length);

    // Try to push every shift count into [lo, hi].
    // Each iteration attempts all (over, under) pairs before giving up.
    // Using a fixed iteration cap (not while-true) prevents oscillation: the algorithm
    // could otherwise alternate evening→day then day→evening indefinitely.
    for (let iter = 0; iter < W * 4; iter++) {
      const overs  = WS.filter(s => used[s] > hi).sort((a, b) => used[b] - used[a]);
      const unders = WS.filter(s => used[s] < lo).sort((a, b) => used[a] - used[b]);
      if (!overs.length || !unders.length) break;

      const days = Array.from({ length: D }, (_, i) => i + 1);
      _shuffle(days);
      let swapped = false;

      outer:
      for (const over of overs) {
        for (const under of unders) {
          for (const d of days) {
            const date = ds(year, month, d);
            if (draft[emp.id][date] !== over) continue;

            // Rule 1: consecutive run of `under` around day d must stay within limit
            const ulim = CONSEC_LIMITS[under] || 99;
            let run = 1;
            for (let off = 1; off <= ulim; off++) {
              const {y, m, d: cd} = _offsetDay(year, month, d, -off);
              if (_anyShift(draft, emp.id, year, month, y, m, cd) !== under) break;
              run++;
            }
            for (let off = 1; off <= ulim; off++) {
              const {y, m, d: cd} = _offsetDay(year, month, d, +off);
              if (_anyShift(draft, emp.id, year, month, y, m, cd) !== under) break;
              run++;
            }
            if (run > ulim) continue;

            // Coverage: `over` must keep ≥1 worker on this day (from other employees)
            const othersOver = emps.filter(e => e.id !== emp.id && draft[e.id]?.[date] === over).length;
            if (othersOver < 1) continue;

            // Coverage: `under` must not exceed its effective daily cap on this day
            const othersUnder = emps.filter(e => e.id !== emp.id && draft[e.id]?.[date] === under).length;
            if (othersUnder >= _shiftDayCap(under, year, month, d, emps.length)) continue;

            // Rule 6: gap with adjacent non-off work days
            let gapOk = true;
            for (let off = 1; off <= 2 && gapOk; off++) {
              const {y, m, d: cd} = _offsetDay(year, month, d, -off);
              const ps = _anyShift(draft, emp.id, year, month, y, m, cd);
              if (!ps || ps === 'off') break;
              if (_restHours(ps, under) <= MIN_SHIFT_GAP) gapOk = false;
              break;
            }
            for (let off = 1; off <= 2 && gapOk; off++) {
              const {y, m, d: cd} = _offsetDay(year, month, d, +off);
              const ns = _anyShift(draft, emp.id, year, month, y, m, cd);
              if (!ns || ns === 'off') break;
              if (_restHours(under, ns) <= MIN_SHIFT_GAP) gapOk = false;
              break;
            }
            if (!gapOk) continue;

            draft[emp.id][date] = under;
            used[over]--;
            used[under]++;
            swapped = true;
            break outer;
          }
        }
      }

      if (!swapped) break;
    }
  }
}

// Iterative local-search repair to satisfy Rule 5 across all days.
// Priority: (1) all shifts ≥ 1, (2) no shift exceeds maxPerShift, (3) nudge evening higher.
function _balanceRule4(draft, emps, year, month, D) {
  const WS    = SHIFTS.filter(s => s.id !== 'off').map(s => s.id);
  const maxPS = _maxPerShift(emps.length);   // scales with team size

  // Per-employee shift counts — updated as swaps are made so candidate sorting
  // always reflects the current draft, preventing one employee from accumulating
  // far more of one shift type than others.
  const empCnt = {};
  for (const emp of emps) {
    empCnt[emp.id] = Object.fromEntries(WS.map(s => [s, 0]));
    for (let dd = 1; dd <= D; dd++) {
      const sid = draft[emp.id]?.[ds(year, month, dd)];
      if (sid && empCnt[emp.id][sid] !== undefined) empCnt[emp.id][sid]++;
    }
  }

  // Sort candidates: prefer the employee with fewest assignments of `targetShift`
  // (most under-quota first), so coverage fixes don't pile one shift onto one person.
  const byFewest = (ids, targetShift) =>
    [...ids].sort((a, b) => empCnt[a][targetShift] - empCnt[b][targetShift]);
  // Sort donors: prefer the employee with most assignments of `fromShift` (most over-quota first)
  const byMost = (ids, fromShift) =>
    [...ids].sort((a, b) => empCnt[b][fromShift] - empCnt[a][fromShift]);

  for (let iter = 0; iter < 300; iter++) {
    let anyViol = false;
    const days = Array.from({ length: D }, (_, i) => i + 1);
    _shuffle(days);

    for (const d of days) {
      const date = ds(year, month, d);
      const cnt  = Object.fromEntries(WS.map(s => [s, 0]));
      const by   = Object.fromEntries(WS.map(s => [s, []]));

      for (const emp of emps) {
        const s = draft[emp.id]?.[date];
        if (s && cnt[s] !== undefined) { cnt[s]++; by[s].push(emp.id); }
      }
      const total = WS.reduce((n, s) => n + cnt[s], 0);
      if (total < WS.length) continue;  // skip days with fewer workers than shifts

      // ── Fix 1: every shift must have ≥ 1 worker ──────────────────────────
      for (const need of WS) {
        if (cnt[need] >= 1) continue;
        anyViol = true;
        const donors = WS.filter(s => s !== need && cnt[s] > 1)
                         .sort((a, b) => cnt[b] - cnt[a]);
        outer1: for (const from of donors) {
          for (const eid of byMost(by[from], from)) {
            if (_trySetShift(draft, eid, year, month, D, d, need)) {
              cnt[need]++; cnt[from]--;
              by[need].push(eid); by[from] = by[from].filter(e => e !== eid);
              empCnt[eid][need]++; empCnt[eid][from]--;
              break outer1;
            }
          }
        }
      }

      // ── Fix 2: no shift may exceed its effective daily cap ───────────────
      // Night shift is capped at 1 on Tue–Sat (hard rule); others use maxPS.
      for (const over of WS) {
        const cap = _shiftDayCap(over, year, month, d, emps.length);
        while (cnt[over] > cap) {
          anyViol = true;
          const under = WS.filter(s => s !== over && cnt[s] < _shiftDayCap(s, year, month, d, emps.length))
                          .sort((a, b) => (a === 'evening' ? -1 : b === 'evening' ? 1 : 0));
          let fixed = false;
          for (const to of under) {
            for (const eid of byMost(by[over], over)) {
              if (_trySetShift(draft, eid, year, month, D, d, to)) {
                cnt[to]++; cnt[over]--;
                by[to].push(eid); by[over] = by[over].filter(e => e !== eid);
                empCnt[eid][to]++; empCnt[eid][over]--;
                fixed = true; break;
              }
            }
            if (fixed) break;
          }
          if (!fixed) break;
        }
      }

      // ── Fix 3 (soft): day shift prefers ≤1 worker on Mon–Sat ────────────
      // Best-effort only; does not set anyViol so failure doesn't retry the whole draft.
      const dow3 = new Date(year, month - 1, d).getDay();
      if (dow3 >= 1 && dow3 <= 6 && cnt['day'] > 1) {
        for (const to of ['evening', 'night']) {
          if (cnt[to] === undefined) continue;
          if (cnt[to] >= _shiftDayCap(to, year, month, d, emps.length)) continue;
          for (const eid of byFewest(by['day'], to)) {
            if (_trySetShift(draft, eid, year, month, D, d, to)) {
              cnt[to]++; cnt['day']--;
              by[to].push(eid); by['day'] = by['day'].filter(e => e !== eid);
              empCnt[eid][to]++; empCnt[eid]['day']--;
              break;
            }
          }
          if (cnt['day'] <= 1) break;
        }
      }

      // ── Bonus: nudge evening toward maxPS workers when capacity allows ────
      if (cnt.evening < maxPS && total >= WS.length) {
        for (const from of WS.filter(s => s !== 'evening')) {
          if (cnt[from] <= 1) continue;
          for (const eid of byFewest(by[from], 'evening')) {
            if (_trySetShift(draft, eid, year, month, D, d, 'evening')) {
              cnt.evening++; cnt[from]--;
              by.evening.push(eid); by[from] = by[from].filter(e => e !== eid);
              empCnt[eid]['evening']++; empCnt[eid][from]--;
              break;
            }
          }
          if (cnt.evening >= maxPS) break;
        }
      }
    }

    if (!anyViol) return true;
  }
  return false;
}

let _diceConfirmCb = null;
// ── LOADING STATE ─────────────────────────────────────────────────────────────
function _setGenLoading(on) {
  const modal = document.querySelector('.dice-confirm-modal');
  if (on) {
    modal?.classList.add('gen-loading');
  } else {
    modal?.classList.remove('gen-loading');
    _closeDiceConfirm();
  }
}

function _showDiceConfirm(msg, onOk) {
  _diceConfirmCb = onOk;
  document.getElementById('dice-confirm-msg').textContent = msg;
  document.getElementById('dice-confirm-overlay').classList.add('open');
}
function _closeDiceConfirm() {
  if (document.querySelector('.dice-confirm-modal.gen-loading')) return; // block while generating
  document.getElementById('dice-confirm-overlay').classList.remove('open');
  _diceConfirmCb = null;
}
function _acceptDiceConfirm() {
  const cb = _diceConfirmCb;
  _diceConfirmCb = null;
  if (cb) cb(); // overlay stays open; _setGenLoading(true) switches it to loading state
}

function generateRandomSchedule() {
  if (isMonthLocked()) { showToast('当前月份已锁定，无法生成排班'); return; }
  const year = curYear, month = curMonth;
  const D    = dim(year, month);
  const emps = visibleEmployees();

  if (emps.length < 3) {
    showToast('至少需要 3 名员工才能自动生成排班', 3000);
    return;
  }

  _showDiceConfirm(
    `将为 ${year}年${month}月 所有可见员工随机生成排班，覆盖本月已有数据。`,
    () => _runGenerator(year, month, D, emps)
  );
}

async function _runGenerator(year, month, D, emps) {
  _setGenLoading(true);
  // Yield one animation frame before starting so the browser paints the loading
  // state before any computation blocks the main thread.
  await new Promise(r => requestAnimationFrame(r));

  const CYCLE = SHIFTS.filter(s => s.id !== 'off').map(s => s.id);  // derived from config

  // Per-day off budget: ensures every day keeps ≥3 workers available.
  // maxOffPerDay = emps - 3; if budget is insufficient (too few employees), skip constraint.
  // Weekends (Sat/Sun) use a tighter cap of 1 to keep more staff available those days.
  const maxOffPerDay   = emps.length - 3;
  const weekendOffCap  = 0;  // no one off on Sat/Sun → always 5 workers on weekends
  const budgetFeasible = maxOffPerDay >= 1 && (maxOffPerDay * D) >= (emps.length * REST_DAYS_MONTH);

  const MAX_ATTEMPTS = 800;

  let bestDraft = null;
  for (let outerAtt = 0; outerAtt < MAX_ATTEMPTS; outerAtt++) {
    // Yield every attempt so the browser paints a fresh animation frame between each.
    // One attempt can take 10-50ms (nested loops), so batching causes visible jank.
    await new Promise(r => setTimeout(r, 0));
    const draft = {};
    let ok = true;

    // Shared off budget, reset each attempt (mutated as employees are assigned).
    // Weekend days are capped at 1 off worker so Sat/Sun always have ≥4 staff.
    const offBudget = budgetFeasible
      ? Object.fromEntries(Array.from({ length: D }, (_, i) => {
          const d   = i + 1;
          const dow = new Date(year, month - 1, d).getDay();
          return [d, (dow === 0 || dow === 6) ? weekendOffCap : maxOffPerDay];
        }))
      : null;

    // ── Step 1: generate off-day pattern per employee ─────────────────────
    for (const emp of emps) {
      // Count how many consecutive work days this employee had at the end of
      // the previous month so _genOffDays can respect Rule 3 across the boundary.
      let trailWork = 0;
      for (let off = 1; off <= MAX_WORK_RUN; off++) {
        const {y, m, d: pd} = _offsetDay(year, month, 1, -off);
        const ps = getShift(emp.id, ds(y, m, pd));
        if (ps && ps !== 'off') trailWork++;
        else break;
      }

      const offs = _genOffDays(year, month, D, offBudget, trailWork);
      if (!offs) { ok = false; break; }
      draft[emp.id] = {};
      offs.forEach(d => {
        draft[emp.id][ds(year, month, d)] = 'off';
        if (offBudget) offBudget[d]--;   // consume budget so later employees avoid this day
      });
    }
    if (!ok) continue;

    // ── Step 2: assign work shifts with quota-guided rotation ────────────
    // Each employee targets an equal number of days per shift type.
    // A score tracks how far each shift is behind its proportional quota;
    // the algorithm continues the current shift (block structure) while its
    // score stays healthy, then switches to the most-needed eligible shift.
    //
    // globalUsed tracks total assignments per shift across all employees assigned
    // so far, letting the score penalise globally over-represented shifts and
    // prevent one shift type from being concentrated on a subset of employees.
    const WS         = CYCLE;
    const globalUsed = Object.fromEntries(WS.map(s => [s, 0]));

    for (let ei = 0; ei < emps.length; ei++) {
      const emp = emps[ei];

      // Count this employee's total work days
      let W = 0;
      for (let d = 1; d <= D; d++) {
        if (draft[emp.id][ds(year, month, d)] !== 'off') W++;
      }

      const target      = W / CYCLE.length;   // ideal days per shift
      const used        = Object.fromEntries(CYCLE.map(id => [id, 0]));
      let   cur         = CYCLE[ei % CYCLE.length];  // staggered start
      let   workDone    = 0;

      // Seed streak from previous month's trailing assignments so we don't
      // accidentally extend a cross-month consecutive run past the limit.
      let streak = 0;
      for (let off = 1; off <= (CONSEC_LIMITS[cur] || 3); off++) {
        const {y, m, d: pd} = _offsetDay(year, month, 1, -off);
        if (getShift(emp.id, ds(y, m, pd)) !== cur) break;
        streak++;
      }

      // Seed prevWorkShift from previous month for Rule 6 gap checks
      let prevWorkShift = null;
      for (let off = 1; off <= 2; off++) {
        const {y, m, d: pd} = _offsetDay(year, month, 1, -off);
        const ps = getShift(emp.id, ds(y, m, pd));
        if (ps && ps !== 'off') { prevWorkShift = ps; break; }
      }

      // Shifts that have NO valid transition to another work shift (e.g. evening →
      // night = 0h gap, evening → day = 8h gap, both ≤ MIN_SHIFT_GAP).
      // Such shifts must be assigned only when the remaining work run fits within
      // their consecutive limit — otherwise the run becomes unsolvable.
      const noExitShifts = new Set(
        CYCLE.filter(s => !CYCLE.some(ns => ns !== s && _restHours(s, ns) > MIN_SHIFT_GAP))
      );

      // Precompute work-days remaining in each day's run (how many consecutive
      // non-off days from d onward, inclusive). Used for the forward-lock check.
      const runRem = new Array(D + 2).fill(0);
      for (let d = D; d >= 1; d--) {
        runRem[d] = draft[emp.id][ds(year, month, d)] === 'off' ? 0 : runRem[d + 1] + 1;
      }

      // score: how much a shift still needs relative to remaining fair share.
      // >1 = behind quota (needs days), <1 = ahead (should yield).
      // Also penalises shifts that are globally over-represented across all
      // employees assigned so far, improving cross-employee balance.
      const score = (s, rem) => {
        const personal = (target - used[s]) / (rem / CYCLE.length);
        // Expected global total for shift s after ei employees: ei × target
        const globalSurplus = (globalUsed[s] - ei * target) / (target + 0.1);
        return personal - 0.4 * Math.max(0, globalSurplus);
      };

      for (let d = 1; d <= D; d++) {
        const date = ds(year, month, d);
        if (draft[emp.id][date] === 'off') { streak = 0; prevWorkShift = null; continue; }

        const remaining = W - workDone;
        workDone++;

        const eligible = CYCLE.filter(s => {
          // Rule 1: can't extend same shift beyond its consecutive limit
          if (s === cur && streak >= CONSEC_LIMITS[s]) return false;
          // Rule 2: if this assignment reaches the limit, next calendar day must be off
          const newStreak = (s === cur) ? streak + 1 : 1;
          if (newStreak >= (CONSEC_LIMITS[s] || 99) && d < D &&
              draft[emp.id][ds(year, month, d + 1)] !== 'off') return false;
          // Rule 6: gap between consecutive work shifts must be > MIN_SHIFT_GAP hours
          if (prevWorkShift && _restHours(prevWorkShift, s) <= MIN_SHIFT_GAP) return false;
          // Forward-lock: shifts with no valid exit (e.g. evening) must fit entirely
          // in the remaining work run; otherwise we'll get trapped with no valid shift later.
          if (noExitShifts.has(s)) {
            const curStreakOfS = (s === cur) ? streak : 0;
            const daysAfterToday = runRem[d] - 1;
            const slotsLeft = (CONSEC_LIMITS[s] || 99) - curStreakOfS - 1;
            if (daysAfterToday > slotsLeft) return false;
          }
          return true;
        });

        if (eligible.length === 0) { ok = false; break; }

        // Continue current shift if it's still within quota (score ≥ 0.7)
        const stayOk = eligible.includes(cur) && score(cur, remaining) >= 0.7;

        let assign;
        if (stayOk) {
          assign = cur;
        } else {
          // Switch to the most-needed eligible shift; break ties randomly
          assign = eligible.slice().sort((a, b) => {
            const diff = score(b, remaining) - score(a, remaining);
            return diff !== 0 ? diff : Math.random() - 0.5;
          })[0];
        }

        if (assign !== cur) { cur = assign; streak = 0; }
        draft[emp.id][date] = assign;
        used[assign]++;
        globalUsed[assign]++;
        streak++;
        prevWorkShift = assign;
      }
      if (!ok) break;  // abort remaining employees if one failed
    }
    if (!ok) continue;

    // ── Step 3: balance daily shift coverage (Rule 5) ─────────────────────
    if (!_balanceRule4(draft, emps, year, month, D)) continue;

    // ── Step 3b: re-balance per-employee shift counts ─────────────────────
    // Rule 5 balancing can skew individual quotas; repair here.
    _rebalanceIndividual(draft, emps, year, month, D);

    // ── Step 3c: cross-employee bilateral swap for per-shift-type balance ──
    // _rebalanceIndividual is blocked when an employee is the sole worker on a
    // shift for a given day (coverage constraint).  Swapping two employees on
    // the SAME day keeps coverage unchanged, bypassing that constraint.
    _rebalanceCrossEmployee(draft, emps, year, month, D);

    // ── Step 4: validate Rules 1–3 via existing per-employee validator ─────
    // Temporarily load draft into schedule so _getViolations can read it
    const bak = {};
    for (const emp of emps) {
      bak[emp.id] = schedule[emp.id] ? { ...schedule[emp.id] } : {};
      if (!schedule[emp.id]) schedule[emp.id] = {};
      for (let d = 1; d <= D; d++) {
        const date = ds(year, month, d);
        const sid  = draft[emp.id][date];
        if (sid) schedule[emp.id][date] = sid;
        else     delete schedule[emp.id][date];
      }
    }

    let valid = true;
    for (const emp of emps) {
      const vr = _getViolations(emp.id, year, month);
      if (vr.consecViol.size || vr.weekViol.size || (vr.gapViol?.size || 0) > 0 || vr.rowViol) { valid = false; break; }
    }
    // Also check daily hard coverage rules (Rule 5 and Rule 7) while draft is loaded
    if (valid) {
      for (let d = 1; d <= D && valid; d++) {
        const dv = _getDayViolations(year, month, d);
        // Rule 8 is soft — only hard violations (rule !== 8) cause a retry
        if (dv.violations.some(v => !v.soft)) valid = false;
      }
    }
    for (const emp of emps) schedule[emp.id] = bak[emp.id]; // always restore

    if (!valid) continue;

    // ── Step 4c: tail feasibility — ensure next month is still schedulable ─
    // Reject any draft where the month-end state locks every employee out of
    // at least one shift type on day 1 of the following month.
    if (!_tailFeasible(draft, emps, year, month, D)) continue;

    // ── Step 4b: enforce ±2 balance across employees per shift type ──────
    const WS2 = SHIFTS.filter(s => s.id !== 'off').map(s => s.id);
    let maxDev = 0;
    for (const S of WS2) {
      const counts = emps.map(emp => {
        let c = 0;
        for (let d = 1; d <= D; d++) {
          if (draft[emp.id]?.[ds(year, month, d)] === S) c++;
        }
        return c;
      });
      const mean = counts.reduce((a, b) => a + b, 0) / emps.length;
      const dev  = Math.max(...counts.map(c => Math.abs(c - mean)));
      if (dev > maxDev) maxDev = dev;
    }

    // Only accept drafts within ±2 tolerance
    if (maxDev > 2 + 1e-9) continue;

    // ±2 achieved — save and stop
    bestDraft = {};
    for (const emp of emps) bestDraft[emp.id] = { ...draft[emp.id] };
    break;
  }

  // ── Apply best draft found ─────────────────────────────────────────────
  if (bestDraft) {
    for (const emp of emps) {
      if (!schedule[emp.id]) schedule[emp.id] = {};
      for (let d = 1; d <= D; d++) {
        const date = ds(year, month, d);
        const sid  = bestDraft[emp.id]?.[date];
        if (sid) schedule[emp.id][date] = sid;
        else     delete schedule[emp.id][date];
      }
    }
    save();
    render();
    _setGenLoading(false);
    showToast('排班已生成 ✓');
    return;
  }

  _setGenLoading(false);
  showToast('生成失败：规则冲突或人数不足，请检查设置', 4000);
}
