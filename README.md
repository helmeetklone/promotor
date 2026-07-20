# Promotor Anomaly Dashboard

Dashboard analisis anomali promotor lapangan — deteksi indikasi manipulasi GPS,
telat/durasi kerja, dan data tidak lengkap dari 2 jenis dataset:

- **SGS & SDS** (journey/visit data)
- **SPG & DS** (attendance data)

Setiap baris otomatis diklasifikasi sebagai **In Store Promotor** (SGS/SPG) atau
**Out Store Promotor** (SDS/DS) berdasarkan role/posisi.

Tool terpisah untuk menggabungkan file mentah (DOP, File_HR, Absensi, Timestamp) dari
sistem kantor jadi format yang siap dianalisis ada di `public/mergertool.html` —
diakses langsung di `/mergertool.html` setelah deploy, terpisah dari dashboard React ini.

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

## Cara pakai dashboard

1. Di halaman upload, isi kotak **SGS & SDS** dan/atau **SPG & DS** (bisa salah satu dulu,
   bisa upload beberapa file sekaligus per kotak — nanti digabung otomatis).
2. Klik **"Lihat Dashboard"**.
3. Atur threshold di masing-masing panel kalau perlu (jarak GPS, durasi kunjungan singkat,
   jarak perpindahan, jam kerja pendek/panjang).
4. Lihat overview total anomali, breakdown per In Store/Out Store Promotor, grafik,
   leaderboard, dan tabel detail.

## Struktur

```
├── public/
│   └── mergertool.html   ← tool merger 4 file mentah (standalone, no build)
├── src/
│   ├── App.tsx            ← entry, render Dashboard
│   ├── Dashboard.tsx       ← dashboard analisis anomali
│   ├── main.tsx
│   └── index.css           ← Tailwind directives
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── tsconfig.json
```

## Catatan teknis

- Dashboard ini pakai **Tailwind CSS** untuk styling (`className="..."` di seluruh
  `Dashboard.tsx`) — makanya `tailwind.config.js`, `postcss.config.js`, dan
  `src/index.css` wajib ada, dan `src/main.tsx` wajib nge-import `./index.css`.
  Tanpa itu, halamannya bakal tampil polos tanpa styling sama sekali.
- Parsing file: mendukung `.csv` (via PapaParse) dan `.xlsx` (via SheetJS).
- Klasifikasi role: fungsi `classifyPromotorType` di `src/Dashboard.tsx` — cocokin
  keyword `in store` / `sgs` / `spg` → In Store Promotor, `out store` / `sds` / `ds` →
  Out Store Promotor.
- Perhitungan jarak GPS pakai formula Haversine (`haversineMeters`).
- File `Dashboard.tsx` masih pakai ekstensi `.tsx` tapi belum ada anotasi tipe eksplisit,
  jadi `tsconfig.json` di-set longgar (`strict: false`).
