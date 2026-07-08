# Role-Based Sales Pipeline: Auto-Assign, Superadmin Activity View, Excel Export

Date: 2026-07-08
Status: Approved (pending plan)

## Context

SalesCore already has three roles (`Leader | Sales | Superadmin`), dashboard routes for each (`customer-manager`, `my-customers`, `report`, `user-manager`), and an OCR-based lead capture flow used by the leader account (`adi@piranusa.com`). Eight sales reps exist (Lukman, Lody, Nurhayati, Rustini, Tika, Ita, Brist, Rizqi — codes LN/LS/NU/RU/TK/TA/BR/RQ) and a superadmin account (`beni@piranusa.com`) is being set up via untracked seed scripts.

Investigation found the pieces are mostly in place but disconnected:

- The OCR form lets the leader pick a sales rep by code, but that pick is only written into a free-text `notes` string — it never touches the real assignment fields (`assignedSalesId` / `assignedSalesName` on `Customer`). Sales dashboards and reports that filter by `assignedSalesId` never see these leads as assigned.
- `report.ts` (`getReportData`) already computes `salesDistribution` (count per sales rep) and is rendered on the existing "Laporan" page, but it has no pipeline-status breakdown or per-sales revenue.
- A read-only global customer list component (`GlobalCustomerManager`) already exists but is dead code — not wired into any route. The route Superadmin currently lands on (`customer-manager`) is actually the Leader's editable view.
- Excel export (`exportCustomersToExcel`) exists and works but has no sales-code column.
- Existing leads created before this fix have `assignedSalesId: null` with the sales code buried in the notes text.

## Goals

1. OCR-based lead capture auto-assigns the real sales rep (`assignedSalesId`/`assignedSalesName`) based on the sales code picked, instead of only recording it in notes text.
2. Superadmin (Beni) gets a read-only activity dashboard: per-sales lead count, pipeline-status breakdown, and total potential revenue.
3. Superadmin gets a read-only full lead list (no edit capability), replacing the currently-wired editable Leader view.
4. Leader (Adi) can export leads to Excel with a sales-code column added to the existing raw per-customer export.
5. Existing leads with a sales code trapped in `notes` get backfilled into `assignedSalesId`/`assignedSalesName`, without deleting or overwriting any existing data.

## Non-goals

- No reassignment/edit UI for Superadmin (read-only per requirement).
- No new dashboard page/route for activity — extend the existing "Laporan" page rather than add a new one.
- No changes to the Sales rep's own view (`my-customers-view.tsx`) — it already correctly filters by `assignedSalesId === current user`.
- No removal of Superadmin's OCR/Scan nav item — out of scope unless requested later.

## Design

### 1. `UserProfile` type: add `salesCode`

`src/types/index.ts` — add `salesCode?: string | null` to `UserProfile`. The field is already written to Firestore `users/{uid}` docs by `scripts/create-piranusa-sales.mjs`; the type just needs to catch up so the rest of the code can read it safely.

### 2. Real auto-assign in OCR flow

Files: `src/app/dashboard/leader/components/ocr-capture-view.tsx`, `ocr-import-dialog.tsx`.

Both currently hardcode an identical `{code, name}` array. Replace both with a lookup against the `salesTeam` list already available via `useDashboard()` (backed by `getSalesUsers()`, which now exposes `salesCode`). When the leader picks a code:

- Resolve the matching sales user by `salesCode`.
- Set `assignedSalesId` = that user's `uid`, `assignedSalesName` = that user's `name` on the customer object being created/updated (in addition to keeping the existing `notes` text for human-readable history — that part doesn't need to change).
- If no user matches the picked code (future data-entry mismatch), fall back to current behavior (notes-only, `assignedSalesId` stays null) rather than throwing — this is a capture flow and must not block the leader from saving a lead.

### 3. Superadmin activity view (extend existing report)

File: `src/app/actions/report.ts`.

Extend `SalesDistribution` (or add a parallel field) to include:
```ts
{
  salesId: string | null;
  salesName: string;
  customerCount: number;
  pipelineBreakdown: Record<PipelineStatus, number>;
  totalRevenue: number;
}
```
Computed in the same `relevantCustomers.forEach(...)` loop that already builds `distribution` — no extra Firestore reads.

File: `src/app/dashboard/report/page.tsx` — extend the existing "Distribusi Pelanggan" card to show, per sales rep, a small breakdown (e.g. status chips or a compact stacked bar) and formatted revenue next to the existing count/progress bar. This page is already visible to both Leader and Superadmin via the sidebar, and `report.ts` already scopes data correctly (Leader → own team, Superadmin → global) — no routing change needed here.

### 4. Read-only full lead list for Superadmin

- Add a new view key `global-customers` to `VALID_VIEWS` and the `views` map in `src/app/dashboard/page.tsx`, rendering the existing (currently unused) `GlobalCustomerManager`.
- `src/components/dashboard/app-sidebar.tsx`: for role `Superadmin`, point the "Customers" nav item at `global-customers` instead of `customer-manager` (Leader keeps `customer-manager` as-is).
- Update the default-view logic in `page.tsx` (`{ Leader: 'customer-manager', Sales: 'my-customers', Superadmin: 'report' }`) — Superadmin's default stays `report`; only the Customers nav target changes.
- No changes to `GlobalCustomerManager` itself — it's already search + email-blast + export, no edit affordances.

### 5. Excel export: add sales-code column

File: `src/app/actions/export-actions.ts` (`exportCustomersToExcel`).

Add a "Kode Sales" column, resolved by looking up `assignedSalesId` against the sales user list (`getSalesUsers()`) to find `salesCode`. If unassigned or no match, leave blank. This is additive to the existing column set — no reordering of existing columns.

### 6. Backfill migration script (non-destructive)

New one-off script (e.g. `scripts/backfill-sales-assignment.mjs`), run manually and locally:

- Query all `customers` where `assignedSalesId` is null/missing.
- For each, regex-parse `notes.manual` for the `Sales: XX` pattern used by the OCR flow.
- Match `XX` against the sales user list's `salesCode`.
- On match, update only `assignedSalesId` and `assignedSalesName` via a targeted Firestore update (not a full document overwrite).
- Skip (log, don't touch) any customer where `assignedSalesId` is already set, or no code match is found.
- Dry-run mode by default (prints what would change); a `--apply` flag performs the writes. No deletes anywhere in this script.

## Data flow summary

```
Leader picks sales code in OCR form
  -> lookup salesTeam by salesCode
  -> customer.assignedSalesId/Name set to real user
  -> Sales rep sees it in my-customers-view (existing filter, now actually populated)
  -> report.ts aggregates it into salesDistribution (+ pipeline + revenue) for Leader/Superadmin
  -> Superadmin browses raw list via GlobalCustomerManager (read-only)
  -> Leader exports via exportCustomersToExcel (+ Kode Sales column)
```

## Testing

- Manual verification (no test framework currently exercises these Firestore-backed actions): create a lead via OCR picking a known sales code, confirm `assignedSalesId` is set (Firestore console or via the sales rep's `my-customers-view`).
- Verify `report.ts` output shape via the Laporan page for both a Leader and Superadmin login.
- Verify `global-customers` view renders for Superadmin only, with no edit controls, via manual browser check.
- Verify Excel export contains the new column with correct values for assigned and unassigned rows.
- Run backfill script in dry-run against current data, inspect output before considering `--apply`.

## Rollout

All changes stay local (no commit/push) until explicitly requested. Backfill script requires explicit `--apply` and is run manually, not part of any build/deploy step.
