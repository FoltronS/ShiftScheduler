# ShiftScheduler

A single-file, browser-based shift scheduling tool. No installation, no server — open `index.html` and start scheduling.

---

## Getting Started

```
ShiftScheduler/
├── index.html
├── style.css
├── data.js
├── validation.js
├── generator.js
└── app.js
```

Open `index.html` in any modern browser. All data is saved automatically to `localStorage`.

---

## Views

### Grid View (default)
A compact table showing every employee × every day of the month. Each cell displays a colour-coded shift badge. Click or drag to edit.

### Timeline View
Each employee occupies one row; consecutive days with the same shift are merged into a single colour block. Hover a block to see the date range and shift name.

### Statistics View
Three charts and a summary table for the current month:
- **Donut** — overall shift distribution across all employees
- **Stacked bar** — per-employee workload breakdown
- **Line chart** — daily headcount per shift type
- **Summary table** — per-employee counts, attendance, rest days, and unfilled cells

---

## Shifts

Default configuration (all fields are editable in Settings):

| Shift | Label | Hours | Colour |
|---|---|---|---|
| Patrol/0-8 | 夜班 | 00:00–08:00 | Dark blue |
| Patrol/8-16 | 白班 | 08:00–16:00 | Amber |
| Patrol/16-24 | 晚班 | 16:00–00:00 | Teal |
| 休息 | 休息 | — | Light grey |

Shift types can be added, removed, renamed, recoloured, and given custom CSV names in **Settings → 班次类型配置**.

---

## Editing Shifts

| Action | Result |
|---|---|
| Left-click a cell | Cycles to the next shift |
| Click and drag across cells | Fills all covered cells with the same shift |
| Right-click a cell | Opens a quick-pick menu for any shift or clear |
| Click a day in the Worker Detail calendar | Cycles that cell's shift |
| Right-click a day in the Worker Detail calendar | Opens quick-pick menu |

Cells highlighted in **red** violate a consecutive or gap rule. Cells highlighted in **yellow** violate the max-run rule. Column headers highlighted in **red** mean too few or too many workers are assigned to a shift that day.

---

## Employees

### Adding
Click **+** in the controls bar, or right-click any employee row → **编辑信息**. Fields:
- **姓名** (required) — display name
- **工号 (UID)** — numeric employee ID; used for CSV matching and display
- **部门** — department; defaults to the value set in Settings

### Reordering
Drag the ⋮⋮ handle on the left of any employee row to reorder.

### Hiding / Showing
Right-click an employee → **隐藏员工**. Hidden employees are excluded from validation, statistics, and the random generator. An eye icon appears in the controls bar when any employees are hidden; click it to toggle visibility.

### Deleting
Right-click an employee → **删除员工**. All schedule data for that employee is removed.

### Worker Detail Modal
Click an employee's name (in Grid or Timeline view) to open their detail modal, which shows:
- Name, UID badge, department
- A mini monthly calendar (navigate months with ‹ ›)
- A doughnut chart and table of shift counts for the displayed month

---

## Import / Export

### Import CSV or TSV
Click **导入 CSV** and select a file. Accepted formats (auto-detected):

| Layout | Columns |
|---|---|
| Minimal | `UID, 姓名, date1, date2, …` |
| Standard | `UID, 工号, 姓名, date1, date2, …` |
| Extended | `UID, 部门, 工号, 姓名, date1, date2, …` |

- **Delimiter**: comma (`.csv`) or tab (`.tsv` / tab-separated `.csv`) — detected automatically
- **Date header format**: `YYYY/M/D` or `M/D/YYYY`
- **Shift values**: must match the **CSV 原始名称** field configured in Settings (defaults: `Patrol/0-8`, `Patrol/8-16`, `Patrol/16-24`, `休息`)
- **Encoding**: UTF-8 (with or without BOM) and GBK are both supported
- On import you choose to **清空后导入** (replace all data) or merge into existing employees

Employees are matched first by UID, then by name. Unmatched employees are created automatically. Department is always taken from the app's current default — it is never read from the CSV.

### Copy TSV
Click **复制 TSV** to copy the current month's schedule to the clipboard in tab-separated format, ready to paste into Excel or a spreadsheet. The column order matches the Extended layout above.

---

## Random Schedule Generator

Click **随机排班** to auto-generate a full month's schedule for all visible employees. A confirmation dialog shows before any data is overwritten.

### What the generator guarantees
- All scheduling rules (1–6, see below) are satisfied
- Every shift type has at least one worker per day
- No shift type exceeds the per-day capacity limit
- Each employee has exactly the required number of rest days with the required consecutive-rest block
- Per-shift-type counts are balanced across employees within **±2 days** of the cross-employee mean
- The month-end state does not make the following month impossible to schedule (tail feasibility check)

If the generator cannot find a valid schedule within 800 attempts it reports failure — usually caused by too few employees (minimum 3 required) or very restrictive rule constants.

---

## Scheduling Rules

| # | Rule |
|---|---|
| 1 | Maximum consecutive days per shift type: **夜班 ≤ 3, 白班 ≤ 5, 晚班 ≤ 4, 休息 ≤ 2** |
| 2 | After reaching the consecutive limit the next calendar day **must** be 休息 |
| 3 | No more than **5 consecutive working days** (any mix of shift types) |
| 4 | Exactly **8 rest days** per month, including exactly **one block of 2 consecutive rest days** |
| 5 | Every shift type must have **≥ 1 worker** per day; no shift may exceed `max(2, ⌈employees ÷ shift_types⌉)` workers |
| 6 | The gap between consecutive work shifts must be **> 8 hours** (e.g. 晚班 → 夜班 on the next day is only 0 h — forbidden) |

Rules 1–3 and 6 are checked across month boundaries (the tail of the previous month is read from saved data).

Violations are highlighted on the grid and counted in the **⚠ violations button** in the controls bar. Click it to open a detailed breakdown.

---

## Month Lock

Click the **padlock icon** in the controls bar to lock the current month. While locked:
- All shift cells become read-only (cursor changes, clicks are blocked)
- The random generator refuses to run
- The month-clear button is disabled

Click the padlock again to unlock. Lock state persists across page reloads.

---

## Settings

Open **设置** from the header.

### 默认部门
The department assigned to new employees and used in TSV exports. Changing this value automatically updates all employees whose department was not manually set.

### 班次类型配置
Each shift type has:
- **颜色** — click the swatch to open a colour picker
- **显示名称** — label shown in badges and charts
- **缩写** — short label shown in compact/timeline blocks
- **时间范围** — used for Rule 6 gap calculations and tooltips (format: `HH:MM–HH:MM`)
- **CSV 原始名称** — the raw string expected in imported CSV/TSV files

Click **添加班次类型** to add a new shift. Click **恢复默认** to reset to the four default shifts. Changes take effect after clicking **保存设置**.

> **Note:** the `off` shift (`休息`) is the special rest-day marker. At least one shift must always be present.

---

## Data Persistence

All data is stored in `localStorage` under the keys `ss_emp`, `ss_sch`, `ss_shifts`, `ss_default_dept`, `ss_mon`, and `ss_locked`. Clearing browser storage resets the app. There is no server-side storage or account system.

---

## Browser Support

Any modern browser with ES2020+ support (Chrome 88+, Firefox 85+, Edge 88+, Safari 14+). Requires `localStorage` and `Clipboard API` (fallback provided for copy).
