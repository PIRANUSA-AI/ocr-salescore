# OCR Report Dashboard — Design

**Date:** 2026-07-08
**Status:** Validated (pending implementation)
**Placement:** Enhance existing **Laporan** (report) view — bukan view baru.

## Konteks & Tujuan

- **Audiens:** adi (Leader) & beni (Superadmin) — diakses lewat view "Laporan" yang sudah ada (sudah role-gated untuk Leader & Superadmin di `app-sidebar.tsx`).
- Operator input data scan kartu nama via kamera (mobile, satu-per-satu). adi & beni butuh laporan overview aktivitas OCR: distribusi leads per sales rep, funnel konversi, dan kualitas data.
- **Bukan** untuk operator (tidak ada UI scan di laporan ini).

## Definisi & Data (terkonfirmasi dari kode)

- **Pelanggan OCR** = `acquisitionContext.source === 'OCR'`. Dipakai konsisten di `history-view.tsx:13`, `ocr-capture-view.tsx:298`, `ocr-import-dialog.tsx:420`, dll.
- Atribusi per-sales pakai `assignedSalesId` / `assignedSalesName`.
- Field terpakai: `createdAt` (inflow/hari-ini), `pipelineStatus` (funnel/Won/Lost), `potentialRevenue`, `email`/`phone` (kualitas), `team` (filter AEC/MFG untuk Superadmin).

## Keputusan (validated)

| Keputusan | Pilihan |
|-----------|---------|
| Scope leads | **Cuma leads OCR** (`source === 'OCR'`) |
| Dimensi produktivitas | **Per-sales-rep** (via `assignedSalesName`). Bukan per-scanner (tidak ada field scanner) & bukan per-event. |
| Block tambahan | Funnel + Kualitas **dipertahankan** |
| Penempatan | **Enhance view Laporan** |

## Layout

```
Filter bar → KPI cards (4) → Block 1 Distribusi per Sales → Block 2 Funnel → Block 3 Kualitas
```

### Filter bar
- **Rentang waktu:** Hari ini / 7 hari / 30 hari / Semua (default: 30 hari)
- **Tim:** AEC / MFG / Semua — hanya untuk Superadmin (beni). Leader (adi) auto-scope ke team-nya sendiri.

### KPI cards
- **Total Leads OCR** (periode terpilih)
- **Baru Hari Ini** (`createdAt` hari ini)
- **Belum Di-assign** (`assignedSalesId` null) — leads nyangkut
- **Won / Conversion Rate** (`pipelineStatus === 'Won'`)

### Block 1 — Distribusi per Sales (inti)
Ranking tabel urut desc by total leads. Kolom:
- Sales rep (avatar + nama) | Total Leads | Baru Hari Ini | Won | % Konversi | Potensi Revenue
- Bar horizontal tiap baris (panjang = total leads) → terbanyak/terdikit langsung kelihatan
- Badge: 👑 Terbanyak (atas) & ⚠️ Paling sedikit (bukan nol terbawah)
- Baris "Unassigned" di paling bawah (leads tanpa sales rep)

### Block 2 — Funnel Konversi OCR
- Distribusi bar per `PIPELINE_STAGES` (Leads → ... → Won) + Lost
- Conversion rate overall (OCR leads → Won)

### Block 3 — Kualitas Data OCR
- % leads **tanpa email**
- % leads **tanpa telp**
- % leads **email format invalid** (regex)
- Tujuan: quality gate hasil scan (kalau banyak kosong/invalid, proses OCR/scanner bermasalah)

## Catatan Implementasi

- **Server:** tambah function baru `getOcrReportData(userProfile, { range, team })` di `src/app/actions/report.ts` (terpisah dari `getReportData` agar tidak mengganggu laporan umum yang sudah ada).
  - Filter: `c.acquisitionContext?.source === 'OCR'`, lalu apply time range (`createdAt`) & team filter.
  - Agregasi per-sales: total, newToday, won, potentialRevenue, conversionRate.
  - Funnel: count per `pipelineStatus`.
  - Kualitas: missing email/phone, invalid email regex.
- **Client:** enhance `src/app/dashboard/report/page.tsx` — tambah section OCR di bawah konten yang ada (jaga metric umum yang sudah ada). Tambah filter bar (time/team). Komponen baru:
  - `OcrSalesRanking` (Block 1)
  - `OcrFunnel` (Block 2)
  - `OcrDataQuality` (Block 3)
- **Role gating:** view Laporan sudah terbatas Leader/Superadmin. Leader → own team only; Superadmin → semua + team filter.

## Out of scope (YAGNI)

- Atribusi per-scanner (butuh field `createdByName` baru — task terpisah).
- Drill-down ke individual lead dari laporan (bisa pakai filter list customer yang sudah ada).
- Update real-time (refresh on filter change cukup).
