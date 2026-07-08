# Role-Based Sales Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the OCR sales-code picker into real lead assignment, give Superadmin a read-only global lead view + per-sales activity metrics, add a sales-code column to Excel export, and backfill existing leads — all local-only, no commit/push.

**Architecture:** Extend existing types/actions/components in place (no new subsystems). `UserProfile.salesCode` becomes the join key between the `salesTeam` list already loaded by `DashboardProvider` and the OCR forms' sales-code picker. `report.ts` gains richer per-sales aggregates consumed by the existing Laporan page. A dead-code component (`GlobalCustomerManager`) gets wired into routing instead of being rebuilt.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Firebase Admin SDK (Firestore), Zod, `xlsx` (SheetJS), React Context (`DashboardProvider`).

## Global Constraints

- No commit, no push, no branch changes — all work stays as uncommitted local changes on `staging` until the user explicitly asks to commit.
- No test framework exists in this repo (confirmed: no jest/vitest/testing-library in `package.json`) and all data-layer code (`src/app/actions/*.ts`) is Firebase Admin SDK code that reads/writes live Firestore — there is no local DB to run automated tests against. Per-task verification therefore uses `npm run typecheck` (already a defined script) plus manual code inspection, not automated test runs. Do not attempt to add a test framework as part of this plan — out of scope.
- Do not delete or overwrite any existing `Customer` or `UserProfile` Firestore field. All additive changes.
- Keep Indonesian UI copy consistent with existing strings (e.g. "Kode Sales", "Belum Ditugaskan").
- The backfill script (Task 9) must default to dry-run and require an explicit `--apply` flag; it must never delete a document or clear an already-set `assignedSalesId`.

---

### Task 1: Add `salesCode` to `UserProfile` type

**Files:**
- Modify: `src/types/index.ts:135-142`

**Interfaces:**
- Produces: `UserProfile.salesCode?: string | null` — consumed by Tasks 2, 3, 5, 8, 9.

- [ ] **Step 1: Add the field**

In `src/types/index.ts`, change:

```ts
export type UserProfile = {
    uid: string;
    name: string;
    email: string;
    role: 'Leader' | 'Sales' | 'Superadmin';
    team: 'AEC' | 'MFG';
    photoURL?: string;
};
```

to:

```ts
export type UserProfile = {
    uid: string;
    name: string;
    email: string;
    role: 'Leader' | 'Sales' | 'Superadmin';
    team: 'AEC' | 'MFG';
    photoURL?: string;
    salesCode?: string | null;
};
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: no new errors (this is a purely additive optional field).

- [ ] **Step 3: Commit**

Do NOT commit. Leave as uncommitted change (per Global Constraints).

---

### Task 2: Real auto-assign in `ocr-capture-view.tsx`

**Files:**
- Modify: `src/app/dashboard/leader/components/ocr-capture-view.tsx`

**Interfaces:**
- Consumes: `UserProfile.salesCode` (Task 1), `useDashboard().salesTeam: (UserProfile & { id: string })[]` (already produced by `src/app/dashboard/dashboard-context.tsx:20,57`).
- Produces: `createManualCustomer` now receives real `assignedSalesId`/`assignedSalesName` instead of always `null`.

This file currently imports `useAuth` (line 14) for `userProfile` only — it has no access to `salesTeam`. It's rendered under `DashboardProvider` (via `src/app/dashboard/layout.tsx`), so `useDashboard()` is safe to call here.

- [ ] **Step 1: Import `useDashboard` and pull `salesTeam`**

At the top of the file, add the import (keep the existing `useAuth` import — `userProfile` from `useAuth` is still used elsewhere in the file):

```ts
import { useDashboard } from '@/app/dashboard/dashboard-context';
```

Inside `export function OcrCaptureView({ recentCustomers }: Props) {`, add:

```ts
const { salesTeam } = useDashboard();
```

- [ ] **Step 2: Replace the hardcoded `SALES_PEOPLE` constant with a derived list**

Remove:

```ts
const SALES_PEOPLE = [
  { code: 'LN', name: 'Lukman' },
  { code: 'LS', name: 'Lody' },
  { code: 'NU', name: 'Nurhayati' },
  { code: 'RU', name: 'Rustini' },
  { code: 'TK', name: 'Tika' },
  { code: 'TA', name: 'Ita' },
  { code: 'BR', name: 'Brist' },
  { code: 'RQ', name: 'Rizqi' },
];
const SALES_CODE_SET = new Set(SALES_PEOPLE.map(p => p.code));
```

Replace with a `useMemo` derived from `salesTeam` (place it directly under the `salesTeam` destructure from Step 1):

```ts
const salesPeople = useMemo(
  () => salesTeam.filter(s => !!s.salesCode).map(s => ({ code: s.salesCode as string, name: s.name, uid: s.uid })),
  [salesTeam]
);
const salesCodeSet = useMemo(() => new Set(salesPeople.map(p => p.code)), [salesPeople]);
```

`useMemo` is already imported in this file (`import { useState, useRef, useCallback, useMemo, useEffect } from 'react';`).

- [ ] **Step 3: Update the two usages of `SALES_CODE_SET` (auto-detect) to `salesCodeSet`**

There are two identical auto-detect blocks (one in the `useEffect` that maps a finished OCR job onto form fields, one is not duplicated — confirm by search). Change:

```ts
if (SALES_CODE_SET.has(clean) && word.length <= 3) {
```

to:

```ts
if (salesCodeSet.has(clean) && word.length <= 3) {
```

- [ ] **Step 4: Update the render usage of `SALES_PEOPLE` to `salesPeople`**

Change:

```tsx
{SALES_PEOPLE.map((p) => (
  <Button key={p.code} type="button" variant={salesCode === p.code ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setSalesCode(p.code)}>
    {p.code}
  </Button>
))}
```

to:

```tsx
{salesPeople.map((p) => (
  <Button key={p.code} type="button" variant={salesCode === p.code ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setSalesCode(p.code)}>
    {p.code}
  </Button>
))}
```

- [ ] **Step 5: Resolve the real sales user at save time**

In `onSave`, immediately before the `createManualCustomer` call, add:

```ts
const matchedSales = salesPeople.find(p => p.code === salesCode);
```

Then change:

```ts
assignedSalesId: null,
assignedSalesName: null,
```

to:

```ts
assignedSalesId: matchedSales?.uid ?? null,
assignedSalesName: matchedSales?.name ?? null,
```

(This keeps the existing `notes: \`Sales: ${salesCode}...\`` line unchanged — the human-readable note stays for history, the real fields are now also populated. If no match is found — e.g. stale code — it falls back to `null`/`null`, matching current behavior, so saving is never blocked.)

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: no errors. Manually re-read the diff to confirm `SALES_PEOPLE`/`SALES_CODE_SET` have no remaining references (`grep -n "SALES_PEOPLE\|SALES_CODE_SET" src/app/dashboard/leader/components/ocr-capture-view.tsx` should return nothing).

- [ ] **Step 7: Commit**

Do NOT commit (Global Constraints).

---

### Task 3: Real auto-assign in `ocr-import-dialog.tsx`

**Files:**
- Modify: `src/app/dashboard/leader/components/ocr-import-dialog.tsx`

**Interfaces:**
- Consumes: same as Task 2 (`UserProfile.salesCode`, `useDashboard().salesTeam`).
- Produces: same effect as Task 2, for the second OCR entry point.

This file already calls `useDashboard()` (line 74: `const { userProfile } = useDashboard();`) — just needs to also pull `salesTeam`.

- [ ] **Step 1: Pull `salesTeam` from the existing `useDashboard()` call**

Change:

```ts
const { userProfile } = useDashboard();
```

to:

```ts
const { userProfile, salesTeam } = useDashboard();
```

- [ ] **Step 2: Replace the hardcoded `SALES_PEOPLE` constant**

Remove (near top of file, right after imports):

```ts
const SALES_PEOPLE = [
  { code: 'LN', name: 'Lukman' },
  { code: 'LS', name: 'Lody' },
  { code: 'NU', name: 'Nurhayati' },
  { code: 'RU', name: 'Rustini' },
  { code: 'TK', name: 'Tika' },
  { code: 'TA', name: 'Ita' },
  { code: 'BR', name: 'Brist' },
  { code: 'RQ', name: 'Rizqi' },
];
const SALES_CODE_SET = new Set(SALES_PEOPLE.map(p => p.code));
```

Add inside the component body, after the `useDashboard()` destructure from Step 1:

```ts
const salesPeople = useMemo(
  () => salesTeam.filter(s => !!s.salesCode).map(s => ({ code: s.salesCode as string, name: s.name, uid: s.uid })),
  [salesTeam]
);
const salesCodeSet = useMemo(() => new Set(salesPeople.map(p => p.code)), [salesPeople]);
```

This file does not currently import `useMemo` — add it to the existing React import:

```ts
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
```

- [ ] **Step 3: Update the auto-detect usage of `SALES_CODE_SET`**

Change:

```ts
if (SALES_CODE_SET.has(clean) && word.length <= 3) {
```

to:

```ts
if (salesCodeSet.has(clean) && word.length <= 3) {
```

- [ ] **Step 4: Update the render usage of `SALES_PEOPLE`**

Change:

```tsx
{SALES_PEOPLE.map((p) => (
  <Button key={p.code} type="button" variant={salesCode === p.code ? 'default' : 'outline'} size="sm" className="active:translate-y-px text-xs" disabled={status === 'saving'} onClick={() => setSalesCode(p.code)}>
    {p.code}
  </Button>
))}
```

to:

```tsx
{salesPeople.map((p) => (
  <Button key={p.code} type="button" variant={salesCode === p.code ? 'default' : 'outline'} size="sm" className="active:translate-y-px text-xs" disabled={status === 'saving'} onClick={() => setSalesCode(p.code)}>
    {p.code}
  </Button>
))}
```

- [ ] **Step 5: Resolve the real sales user at save time**

In `onSave`, immediately before the `createManualCustomer` call, add:

```ts
const matchedSales = salesPeople.find(p => p.code === salesCode);
```

Change:

```ts
assignedSalesId: null,
assignedSalesName: null,
```

to:

```ts
assignedSalesId: matchedSales?.uid ?? null,
assignedSalesName: matchedSales?.name ?? null,
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: no errors. `grep -n "SALES_PEOPLE\|SALES_CODE_SET" src/app/dashboard/leader/components/ocr-import-dialog.tsx` returns nothing.

- [ ] **Step 7: Commit**

Do NOT commit (Global Constraints).

---

### Task 4: Extend `report.ts` with pipeline breakdown + revenue per sales

**Files:**
- Modify: `src/app/actions/report.ts:20-24` (interface), `:181-202` (aggregation loop)

**Interfaces:**
- Consumes: `Customer.pipelineStatus: PipelineStatus`, `Customer.potentialRevenue?: number`, `Customer.assignedSalesId`/`assignedSalesName` (all existing fields, `PipelineStatus` from `src/types/index.ts:17`).
- Produces: `SalesDistribution` now includes `pipelineBreakdown: Record<string, number>` and `totalRevenue: number` — consumed by Task 5 (`report/page.tsx`).

- [ ] **Step 1: Extend the `SalesDistribution` interface**

Change:

```ts
export interface SalesDistribution {
  salesId: string | null;
  salesName: string;
  customerCount: number;
}
```

to:

```ts
export interface SalesDistribution {
  salesId: string | null;
  salesName: string;
  customerCount: number;
  pipelineBreakdown: Record<string, number>;
  totalRevenue: number;
}
```

- [ ] **Step 2: Update the aggregation loop to track breakdown + revenue**

Change:

```ts
    // 4. Sales Distribution
    const distribution: Record<string, { name: string; count: number }> = {};

    relevantCustomers.forEach((customer) => {
      const salesId = customer.assignedSalesId || 'unassigned';
      const salesName = customer.assignedSalesName || 'Belum Ditugaskan';

      if (!distribution[salesId]) {
        distribution[salesId] = { name: salesName, count: 0 };
      }
      distribution[salesId].count++;
    });

    const salesDistribution: SalesDistribution[] = Object.entries(
      distribution
    )
      .map(([salesId, data]) => ({
        salesId: salesId === 'unassigned' ? null : salesId,
        salesName: data.name,
        customerCount: data.count,
      }))
      .sort((a, b) => b.customerCount - a.customerCount);
```

to:

```ts
    // 4. Sales Distribution
    const distribution: Record<string, { name: string; count: number; pipelineBreakdown: Record<string, number>; revenue: number }> = {};

    relevantCustomers.forEach((customer) => {
      const salesId = customer.assignedSalesId || 'unassigned';
      const salesName = customer.assignedSalesName || 'Belum Ditugaskan';

      if (!distribution[salesId]) {
        distribution[salesId] = { name: salesName, count: 0, pipelineBreakdown: {}, revenue: 0 };
      }
      distribution[salesId].count++;
      distribution[salesId].pipelineBreakdown[customer.pipelineStatus] =
        (distribution[salesId].pipelineBreakdown[customer.pipelineStatus] || 0) + 1;
      distribution[salesId].revenue += customer.potentialRevenue || 0;
    });

    const salesDistribution: SalesDistribution[] = Object.entries(
      distribution
    )
      .map(([salesId, data]) => ({
        salesId: salesId === 'unassigned' ? null : salesId,
        salesName: data.name,
        customerCount: data.count,
        pipelineBreakdown: data.pipelineBreakdown,
        totalRevenue: data.revenue,
      }))
      .sort((a, b) => b.customerCount - a.customerCount);
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

Do NOT commit (Global Constraints).

---

### Task 5: Render pipeline breakdown + revenue on the Laporan page

**Files:**
- Modify: `src/app/dashboard/report/page.tsx:122-152`

**Interfaces:**
- Consumes: `SalesDistribution.pipelineBreakdown`/`totalRevenue` (Task 4).

The existing "Distribusi Pelanggan" card (lines 122-152) shows name + count + progress bar per sales rep. Add a compact revenue line and a status-chip row per rep, without restructuring the card.

- [ ] **Step 1: Add a revenue + top-status line under each rep's progress bar**

Change the per-rep block:

```tsx
                <motion.div
                  key={sales.salesId || 'unassigned'}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">{getInitials(sales.salesName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{sales.salesName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{sales.customerCount}</span>
                  </div>
                  <Progress value={percentage} className="h-1.5" />
                </motion.div>
```

to:

```tsx
                <motion.div
                  key={sales.salesId || 'unassigned'}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">{getInitials(sales.salesName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{sales.salesName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{sales.customerCount}</span>
                  </div>
                  <Progress value={percentage} className="h-1.5" />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(sales.pipelineBreakdown).map(([status, count]) => (
                        <span key={status} className="rounded bg-muted px-1.5 py-0.5">{status}: {count}</span>
                      ))}
                    </div>
                    <span className="font-medium text-foreground/80">{formatCurrency(sales.totalRevenue)}</span>
                  </div>
                </motion.div>
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: no errors. `formatCurrency` is already defined in this file (line 70) and reused here.

- [ ] **Step 3: Commit**

Do NOT commit (Global Constraints).

---

### Task 6: Wire `GlobalCustomerManager` into routing for Superadmin

**Files:**
- Modify: `src/app/dashboard/page.tsx:14-62`

**Interfaces:**
- Consumes: `GlobalCustomerManager` (existing, unmodified) from `src/app/dashboard/superadmin/global-customer-manager.tsx`.
- Produces: new view key `'global-customers'` — consumed by Task 7 (sidebar nav).

- [ ] **Step 1: Import the component**

Add near the other view imports:

```ts
import { GlobalCustomerManager } from './superadmin/global-customer-manager';
```

- [ ] **Step 2: Add the view key to `VALID_VIEWS`**

Change:

```ts
const VALID_VIEWS = new Set(['ocr-capture', 'customer-manager', 'my-customers', 'report', 'user-manager']);
```

to:

```ts
const VALID_VIEWS = new Set(['ocr-capture', 'customer-manager', 'my-customers', 'report', 'user-manager', 'global-customers']);
```

- [ ] **Step 3: Add it to the `views` map**

Change:

```ts
    const views: Record<string, React.ReactNode> = {
      'ocr-capture': <OcrCaptureViewWrapper />,
      'customer-manager': <CustomerManagementView />,
      'my-customers': <MyCustomersView />,
      'report': <ReportPage />,
      'user-manager': <UserManager />,
    };
```

to:

```ts
    const views: Record<string, React.ReactNode> = {
      'ocr-capture': <OcrCaptureViewWrapper />,
      'customer-manager': <CustomerManagementView />,
      'my-customers': <MyCustomersView />,
      'report': <ReportPage />,
      'user-manager': <UserManager />,
      'global-customers': <GlobalCustomerManager />,
    };
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

Do NOT commit (Global Constraints).

---

### Task 7: Point Superadmin's "Customers" nav at the read-only view

**Files:**
- Modify: `src/components/dashboard/app-sidebar.tsx:30-43`

**Interfaces:**
- Consumes: `'global-customers'` view key (Task 6).

- [ ] **Step 1: Split the "Customers" nav item by role**

Change:

```ts
    const menuItems = useMemo(() => {
        if (!userProfile) return [];
        const base = [
            { id: 'ocr-capture', label: 'Scan', icon: ScanLine },
            { id: 'customer-manager', label: 'Customers', icon: Users },
        ];
        if (userProfile.role === 'Leader' || userProfile.role === 'Superadmin') {
            base.push({ id: 'report', label: 'Laporan', icon: BarChart3 });
        }
        if (userProfile.role === 'Superadmin') {
            base.push({ id: 'user-manager', label: 'Kelola User', icon: ShieldCheck });
        }
        return base;
    }, [userProfile]);
```

to:

```ts
    const menuItems = useMemo(() => {
        if (!userProfile) return [];
        const isSuperadmin = userProfile.role === 'Superadmin';
        const base = [
            { id: 'ocr-capture', label: 'Scan', icon: ScanLine },
            { id: isSuperadmin ? 'global-customers' : 'customer-manager', label: 'Customers', icon: Users },
        ];
        if (userProfile.role === 'Leader' || isSuperadmin) {
            base.push({ id: 'report', label: 'Laporan', icon: BarChart3 });
        }
        if (isSuperadmin) {
            base.push({ id: 'user-manager', label: 'Kelola User', icon: ShieldCheck });
        }
        return base;
    }, [userProfile]);
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: no errors. Manually confirm `src/components/dashboard/bottom-navbar.tsx` is out of scope for this task — it has its own independent `navItems` array (line 17-24) that only has `customer-manager` for all roles including Superadmin; leaving it as-is is a known follow-up, not required by the current spec (mobile bottom nav parity was not part of the approved design). Note this as a follow-up, do not silently fix it in this task.

- [ ] **Step 3: Commit**

Do NOT commit (Global Constraints).

---

### Task 8: Add "Kode Sales" column to Excel export

**Files:**
- Modify: `src/app/actions/export-actions.ts:1-56`

**Interfaces:**
- Consumes: `getSalesUsers()` from `src/app/actions/user.ts:12` (already imported elsewhere in the actions layer), `UserProfile.salesCode` (Task 1).

- [ ] **Step 1: Import `getSalesUsers`**

Add to the top of the file:

```ts
import { getSalesUsers } from './user';
```

- [ ] **Step 2: Build a salesId → salesCode lookup and add the column**

Change:

```ts
export async function exportCustomersToExcel(filters?: {
    team?: 'AEC' | 'MFG';
    salesId?: string;
    pipelineStatus?: PipelineStatus;
}) {
    console.log('[Action: exportCustomersToExcel] Generating export data...');

    try {
        let query = adminDb.collection('customers').orderBy('createdAt', 'desc');

        const snapshot = await query.get();

        const customers: Customer[] = [];
        snapshot.forEach(doc => {
            const data = doc.data() as Customer;

            // Apply filters
            if (filters?.team && data.team !== filters.team) return;
            if (filters?.salesId && data.assignedSalesId !== filters.salesId) return;
            if (filters?.pipelineStatus && data.pipelineStatus !== filters.pipelineStatus) return;

            customers.push({ ...data, id: doc.id });
        });

        // Transform to export format
        const exportData = customers.map(c => ({
            'Nama': c.name,
            'Email': c.email,
            'Telepon': c.phone,
            'Perusahaan': c.company,
            'Jabatan': c.jobTitle,
            'Tim': c.team,
            'Pipeline Status': c.pipelineStatus,
            'Sales': c.assignedSalesName || 'Belum Ditugaskan',
            'Potensi Revenue': c.potentialRevenue || 0,
            'Produk': c.products?.map(p => p.name).join(', ') || '',
            'Sumber': c.acquisitionContext.source,
            'Dibuat': c.createdAt,
            'Diupdate': c.updatedAt,
        }));

        console.log(`[Action: exportCustomersToExcel] Exported ${exportData.length} records`);
        return { success: true, data: exportData };
    } catch (error) {
        console.error('[Action: exportCustomersToExcel] Error:', error);
        throw new Error('Gagal mengekspor data pelanggan.');
    }
}
```

to:

```ts
export async function exportCustomersToExcel(filters?: {
    team?: 'AEC' | 'MFG';
    salesId?: string;
    pipelineStatus?: PipelineStatus;
}) {
    console.log('[Action: exportCustomersToExcel] Generating export data...');

    try {
        let query = adminDb.collection('customers').orderBy('createdAt', 'desc');

        const snapshot = await query.get();

        const customers: Customer[] = [];
        snapshot.forEach(doc => {
            const data = doc.data() as Customer;

            // Apply filters
            if (filters?.team && data.team !== filters.team) return;
            if (filters?.salesId && data.assignedSalesId !== filters.salesId) return;
            if (filters?.pipelineStatus && data.pipelineStatus !== filters.pipelineStatus) return;

            customers.push({ ...data, id: doc.id });
        });

        const salesUsers = await getSalesUsers();
        const salesCodeByUid = new Map(salesUsers.map(s => [s.uid, s.salesCode || '']));

        // Transform to export format
        const exportData = customers.map(c => ({
            'Nama': c.name,
            'Email': c.email,
            'Telepon': c.phone,
            'Perusahaan': c.company,
            'Jabatan': c.jobTitle,
            'Tim': c.team,
            'Pipeline Status': c.pipelineStatus,
            'Sales': c.assignedSalesName || 'Belum Ditugaskan',
            'Kode Sales': (c.assignedSalesId && salesCodeByUid.get(c.assignedSalesId)) || '',
            'Potensi Revenue': c.potentialRevenue || 0,
            'Produk': c.products?.map(p => p.name).join(', ') || '',
            'Sumber': c.acquisitionContext.source,
            'Dibuat': c.createdAt,
            'Diupdate': c.updatedAt,
        }));

        console.log(`[Action: exportCustomersToExcel] Exported ${exportData.length} records`);
        return { success: true, data: exportData };
    } catch (error) {
        console.error('[Action: exportCustomersToExcel] Error:', error);
        throw new Error('Gagal mengekspor data pelanggan.');
    }
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

Do NOT commit (Global Constraints).

---

### Task 9: Non-destructive backfill script for existing leads

**Files:**
- Create: `scripts/backfill-sales-assignment.mjs`

**Interfaces:**
- Consumes: Firestore `customers` collection (`assignedSalesId`, `notes.manual`), Firestore `users` collection (`role == 'Sales'`, `salesCode`). Same `FIREBASE_SERVICE_ACCOUNT_BASE64` env convention as `scripts/create-piranusa-sales.mjs`.
- Produces: targeted `assignedSalesId`/`assignedSalesName` field updates only — no document overwrites, no deletes.

- [ ] **Step 1: Write the script**

```js
// scripts/backfill-sales-assignment.mjs
// Backfill assignedSalesId/assignedSalesName on `customers` docs whose
// sales code is only present as text in notes.manual (from the old OCR flow),
// by matching that code against users/{uid}.salesCode.
//
// Non-destructive: only writes assignedSalesId + assignedSalesName, only on
// docs where assignedSalesId is currently null/missing. Never deletes.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-sales-assignment.mjs           # dry-run (default)
//   node --env-file=.env.local scripts/backfill-sales-assignment.mjs --apply   # writes changes

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_BASE64 missing in env.');
  process.exit(1);
}
const serviceAccount = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf-8'));

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

const APPLY = process.argv.includes('--apply');
console.log(`Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}\n`);

const salesSnapshot = await db.collection('users').where('role', '==', 'Sales').get();
const salesByCode = new Map();
salesSnapshot.forEach(doc => {
  const data = doc.data();
  if (data.salesCode) salesByCode.set(data.salesCode, { uid: data.uid || doc.id, name: data.name });
});
console.log(`Loaded ${salesByCode.size} sales users with a salesCode.\n`);

const customersSnapshot = await db.collection('customers').get();
console.log(`Scanning ${customersSnapshot.size} customers...\n`);

let matched = 0;
let skippedAlreadyAssigned = 0;
let skippedNoMatch = 0;

for (const doc of customersSnapshot.docs) {
  const data = doc.data();
  if (data.assignedSalesId) {
    skippedAlreadyAssigned++;
    continue;
  }
  const notesText = data.notes?.manual || '';
  const match = notesText.match(/Sales:\s*([A-Za-z]{2,3})/);
  if (!match) {
    skippedNoMatch++;
    continue;
  }
  const code = match[1].toUpperCase();
  const salesUser = salesByCode.get(code);
  if (!salesUser) {
    skippedNoMatch++;
    console.log(`⚠️  ${doc.id}: code "${code}" found in notes but no matching sales user.`);
    continue;
  }

  matched++;
  console.log(`${APPLY ? '✅ updating' : '🔎 would update'} ${doc.id} (${data.name || 'unnamed'}) -> assignedSalesId=${salesUser.uid}, assignedSalesName=${salesUser.name} (code=${code})`);

  if (APPLY) {
    await db.collection('customers').doc(doc.id).update({
      assignedSalesId: salesUser.uid,
      assignedSalesName: salesUser.name,
    });
  }
}

console.log(`\nDone. Matched: ${matched}, already assigned (skipped): ${skippedAlreadyAssigned}, no code match (skipped): ${skippedNoMatch}.`);
if (!APPLY) {
  console.log('This was a dry run — no data was changed. Re-run with --apply to write these updates.');
}
process.exit(0);
```

- [ ] **Step 2: Verify the script is syntactically valid**

Run: `node --check scripts/backfill-sales-assignment.mjs`
Expected: no output (syntax OK). This does not connect to Firebase, so it's safe to run without credentials.

- [ ] **Step 3: Manual dry-run against real data (user-run, not automated)**

This step requires live Firestore credentials (`FIREBASE_SERVICE_ACCOUNT_BASE64` in `.env.local`) and must be run manually by the user or with their explicit go-ahead, since it reads production data:

```bash
node --env-file=.env.local scripts/backfill-sales-assignment.mjs
```

Expected: a list of "would update" lines with a final summary count, and no Firestore writes (dry run is the default — `--apply` was not passed).

- [ ] **Step 4: Commit**

Do NOT commit (Global Constraints). Do NOT run with `--apply` without the user explicitly confirming the dry-run output looks correct first.

---

## Post-plan verification (all tasks)

- [ ] Run `npm run typecheck` once at the end to confirm the full set of changes compiles together.
- [ ] `grep -rn "SALES_PEOPLE\|SALES_CODE_SET" src/app/dashboard/leader/components/` returns nothing (confirms Tasks 2-3 fully removed the hardcoded lists).
- [ ] `git status` / `git diff --stat` reviewed with the user before any further action — no commit unless explicitly requested.
