# Promotor Anomaly Suite

Satu aplikasi, 2 tab:

- **Data Merger** — gabungin 4 file mentah dari sistem kantor (DOP, File_HR, Absensi,
  Timestamp) jadi 1 tabel yang cuma berisi kolom-kolom relevan untuk deteksi anomali
  (GPS, jam kerja, remark, status employment, posisi, tanggal input). Proses jalan
  sepenuhnya di browser — file yang di-upload tidak dikirim ke server manapun.
- **Dashboard Analisis** — upload data SGS & SDS (journey/visit) dan/atau SPG & DS
  (attendance), lihat overview anomali, breakdown In Store vs Out Store Promotor,
  grafik, leaderboard, dan tabel detail.

## Cara jalanin lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`.

## Build untuk production

```bash
npm run build
```

Hasilnya ada di folder `dist/`, tinggal deploy ke Vercel/Netlify/GitHub Pages, dll.

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Import project di [vercel.com](https://vercel.com) → pilih repo ini.
3. Framework preset: **Vite**. Build command & output directory otomatis kedetect.
4. Deploy.

## Struktur

```
src/
├── App.tsx        ← tab switcher (Data Merger / Dashboard Analisis)
├── MergerTool.tsx ← tool merger 4 file mentah
├── Dashboard.tsx  ← dashboard analisis anomali
└── main.tsx
```

## Catatan

- Kedua tool ini **belum otomatis nyambung** (hasil Data Merger belum langsung ke-load
  ke Dashboard) — masih 2 langkah manual: gabung & download di tab Merger, lalu upload
  hasilnya ke tab Dashboard. Kalau mau dijadiin satu alur otomatis (upload 4 file mentah
  → langsung tampil di dashboard tanpa unduh-upload manual), itu pengembangan berikutnya.
- Key join di Data Merger: `Employee ID` (distandarkan dari `Employee No` /
  `Employee Number` / `Employee ID`).
- Klasifikasi role di Dashboard: fungsi `classifyPromotorType` di `src/Dashboard.tsx`.
- File-file ini pakai ekstensi `.tsx` tapi belum ada anotasi tipe eksplisit, jadi
  `tsconfig.json` di-set longgar (`strict: false`).
