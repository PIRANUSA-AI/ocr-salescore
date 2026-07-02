# UPDATE.md — SalesCore Pipeline Baru

Dokumen ini menjelaskan **apa yang diubah**, **kenapa**, dan **apa yang masih harus dilakukan** agar pipeline berjalan penuh di produksi. Fokus perubahan: **GLM OCR**, **Task to Do (MySQL)**, dan **auth fallback tanpa Firebase**.

> Prinsip: Firebase **tidak dihapus**. App dibuat tetap jalan tanpa Firebase (mode `local`) supaya pipeline baru bisa diuji sekarang. Begitu Firebase tersedia lagi, cukup ganti 1 env flag dan jalur lama aktif kembali.

---

## 1. Ringkasan Perubahan

| Area | Sebelum | Sesudah |
|------|---------|---------|
| OCR | Google Gemini (`googleai/gemini-2.5-flash`) via Genkit | **GLM OCR** (`glm-ocr`, z.ai) via HTTP langsung (axios) |
| Data Task | — (belum ada task pribadi) | **MySQL** `user_tasks` + Redis cache |
| Auth | Firebase Auth + Firestore (wajib service account) | **Fallback MySQL** (bcrypt + session cookie), gated env flag |
| Cache | — | **Redis** cache-aside, namespaced `salescore:` |

AI flow lain (WhatsApp reply, opportunity, email blast, webinar, company) **tidak disentuh** — tetap Gemini.

---

## 2. File yang Ditambah (baru)

| File | Fungsi |
|------|--------|
| `db/salescore_tasks.sql` | Skema MySQL: `team_members`, `user_tasks`, `app_users` + seed |
| `src/lib/mysql.ts` | Connection pool `mysql2` (parameterized, anti SQL-injection) |
| `src/lib/redis.ts` | Cache-aside Redis helper (`ioredis`), namespace `salescore:` |
| `src/app/actions/task-todo.ts` | Server action CRUD task (create/list/toggle/delete) |
| `src/app/actions/auth-local.ts` | Auth MySQL: login/signup/session/logout (bcrypt) |
| `src/app/dashboard/leader/components/todo-manager.tsx` | UI Task to Do |
| `src/app/dashboard/leader/views/todo-view.tsx` | Wrapper view |

## 3. File yang Diedit (minimal)

| File | Perubahan |
|------|-----------|
| `src/ai/flows/extract-customer-from-form.ts` | Blok `ai.generate` Gemini → HTTP call GLM. Prompt & schema **tetap sama**. |
| `src/types/index.ts` | + type `UserTask`, `TeamMember` |
| `src/lib/constants.ts` | + menu `to-do` (leader & sales) |
| `src/app/dashboard/leader/leader-dashboard.tsx` | + `case 'to-do'` |
| `src/app/dashboard/sales-dashboard.tsx` | + `case 'to-do'` |
| `src/components/providers/auth-provider.tsx` | Gate mode `local`/`firebase` (Firebase utuh) |
| `src/components/auth/login-form.tsx` | Login/signup dua mode |
| `src/components/dashboard/header.tsx` | Logout dua mode |
| `.env.local` | Env GLM, MySQL, Redis, `NEXT_PUBLIC_AUTH_MODE` |

---

## 4. Infrastruktur (yang dibangun lokal)

- **MySQL** — container Docker `salescore-mysql` di port **3307** (port 3306 host dipakai app lain).
  ```
  docker run -d --name salescore-mysql -p 3307:3306 \
    -e MYSQL_ROOT_PASSWORD=salescore_root -e MYSQL_DATABASE=salescore \
    -e MYSQL_USER=salescore -e MYSQL_PASSWORD=salescore_pass mysql:8.0
  ```
- **Redis** — pakai instance yang sudah jalan di host (port 6379). Semua key diprefix `salescore:` agar tak tabrakan dengan 46 key app lain.

Load skema:
```
mysql -h 127.0.0.1 -P 3307 -u salescore -psalescore_pass salescore < db/salescore_tasks.sql
```

---

## 5. Akun Seed (mode local)

Semua password = `password123`.

| Email | Role | Tim |
|-------|------|-----|
| windy@piranusa.com | Leader | AEC |
| andi@piranusa.com | Sales | AEC (kode A) |
| bella@piranusa.com | Sales | AEC (kode B) |
| citra@piranusa.com | Sales | MFG (kode C) |

Leader **Windy** sudah meng-assign task pertama ke tiap sales (`source='leader'`) — ini referensi awal untuk AI.

---

## 6. Alur Fitur

**Task to Do:** login → menu "Task to Do" → tambah/centang/hapus task. Leader bisa pilih "Tugaskan ke" sales tertentu (task muncul di daftar sales itu, ditandai "Dari Leader"). Data tersimpan di MySQL, dibaca via cache Redis (TTL 30s), invalidasi otomatis tiap write.

**GLM OCR:** buka dialog Pindai Cepat / OCR Import → foto/upload form A5 → `extractCustomerFromForm()` kirim gambar ke GLM `glm-ocr` → JSON field (name/email/formAnswers) → user verifikasi → simpan.

---

## 7. ⚠️ YANG MASIH HARUS DILAKUKAN

### A. GLM OCR — ✅ SUDAH JALAN
OCR sudah terverifikasi jalan end-to-end dengan gambar form A5 nyata. Hasil parsing benar (name, company, jobTitle, phone, email, formAnswers; nama sales diabaikan sesuai prompt).

**Konfigurasi final:**
- Langganan = **GLM Coding Plan** (z.ai), aktif di endpoint `/api/coding/paas/v4/`.
- Model OCR = **`glm-4.5v`** (vision via chat/completions) — bukan `glm-ocr`. `glm-ocr` (`/layout_parsing`) TIDAK tercover Coding Plan (error 1113), sedangkan `glm-4.5v` tercover dan bisa terima prompt parsing form sekaligus → lebih cocok.
- Endpoint: `https://api.z.ai/api/coding/paas/v4/chat/completions`
- Catatan: endpoint umum `/api/paas/v4/` balik 1113 untuk langganan Coding Plan. Wajib pakai path `/api/coding/paas/v4/`.

### B. Firebase (saat siap dipakai lagi)
1. Set `FIREBASE_SERVICE_ACCOUNT_BASE64` (service account JSON base64) di `.env.local`.
2. Ganti `NEXT_PUBLIC_AUTH_MODE=local` → `NEXT_PUBLIC_AUTH_MODE=firebase`.
3. Login/register otomatis balik ke jalur Firebase. Kode local MySQL tetap ada sebagai cadangan.

### C. Produksi / Deploy
- Container MySQL lokal ini untuk dev. Di produksi pakai MySQL managed (RDS/Cloud SQL) — cukup ganti env `MYSQL_*`.
- Redis produksi: ganti env `REDIS_*`. Cache tetap fail-safe (kalau Redis mati, langsung baca MySQL).
- Session cookie saat ini base64 (belum ditandatangani). Untuk produksi, tambahkan signing/JWT secret bila auth local dipakai permanen.

---

## 8. Env Reference (`.env.local`)

```
# GLM (OCR) — GLM Coding Plan, model vision glm-4.5v
GLM_API_KEY=<key z.ai coding plan>
GLM_MODEL=glm-4.5v
GLM_ENDPOINT=https://api.z.ai/api/coding/paas/v4/chat/completions

# MySQL
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3307
MYSQL_USER=salescore
MYSQL_PASSWORD=salescore_pass
MYSQL_DATABASE=salescore

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_TTL_SECONDS=30

# Auth: 'local' (MySQL) atau 'firebase'
NEXT_PUBLIC_AUTH_MODE=local
```

---

## 9. Status Verifikasi

| Cek | Hasil |
|-----|-------|
| `npm run typecheck` | ✅ clean |
| `npm run build` | ✅ sukses |
| MySQL CRUD task (insert→list→toggle→delete) | ✅ jalan (data nyata, no mock) |
| Redis roundtrip + namespace | ✅ aman |
| Login `password123` benar/salah | ✅ SUCCESS / REJECTED |
| GLM OCR live (gambar A5 → JSON) | ✅ jalan (glm-4.5v, coding endpoint) |
