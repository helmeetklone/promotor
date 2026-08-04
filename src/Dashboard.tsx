// Dashboard.tsx — v86
// Changelog:
//   v1: upload SGS/SDS + SPG/DS (raw dashboard, 2 upload boxes)
//   v2: single upload (hasil Data Merger), split otomatis by Record_Type
//   v3: klik detail (angka/chart/leaderboard), Key Insights, layout row-aligned
//   v4: modal detail dipaginasi (10/halaman) + filter, biar buka detail lebih cepat
//   v5: disederhanakan jadi 3 signal (GPS, Status employment, Durasi kerja) sesuai keterbatasan data lapangan;
//       Timestamp (check-in 3x/hari, no checkout) tidak lagi cek durasi/kelengkapan kunjungan
//   v6: tambah dukungan upload .ndjson (konsisten dengan opsi NDJSON di xlsx-to-json.html)
//   v7: scope anomali cuma utk In Store Promotor & Out Store Promotor (role lain di-exclude)
//   v8: aturan HARPA buat Timestamp — grouping per Employee+Tanggal:
//       (1) min 3 absen di 3 zona waktu berbeda (Pagi/Siang/Sore/Malam1/Malam2)
//       (2) 3+ absen tapi nyangkut di zona yang sama = tetap gak comply
//       (3) GPS identik antar check-in di hari yang sama = flag
//       (classifyPromotorType juga dibenerin di v8 — hyphen "In-Store Promotor" gak kedetek sebelumnya)
//   v9: GPS identik sekarang exact match, gak dibulatin 6 desimal lagi
//   v10: tambah info "jumlah karyawan unik" + "rentang tanggal" per dataset di Overview,
//        buat cross-check kenapa total Timestamp vs Absensi bisa beda
//   v11: tema TERANG (dari dark mode) — semua warna Tailwind & chart diganti kontras di background putih;
//        tambah stat "Absen Comply (>=3x)" / "Absen Not Comply (<3x)" di Overview;
//        info cakupan karyawan/tanggal dirapiin jadi kotak, bukan teks kecil doang
//   v12: (1) subtitle "X orang" di stat card GPS Identik; (2) kartu Gap Timestamp vs Absensi
//        (karyawan yang cuma ada di salah satu dataset); (3) grid cakupan jadi 3 kolom
//   v13: tombol export ke .xlsx di semua card (stat card, chart, leaderboard, tabel detail,
//        dan modal detail) — berlaku di Timestamp maupun Absensi karena komponennya di-share
//   v14: kolom koordinat mentah (lat, lon) ditambahin ke tabel/export Timestamp biar bisa dicek
//        manual; (0,0) sekarang dianggap GPS kosong/gagal-capture, bukan lokasi identik valid
//   v15: BUG FIX PENTING — toNum() salah parse format desimal-koma Indonesia ("112,64118"),
//        parseFloat berhenti di koma dan kepotong jadi "112" doang. Ini penyebab banyak GPS
//        di Timestamp keliatan "identik" padahal aslinya beda-beda. Fix yang sama juga
//        diterapkan ke toNum() di mergertool.html (buat parsing lat/lon Outlet Master).
//   v16: kolom Koordinat Check-in/Check-out + Jarak In-Out (m) ditambahin ke tabel/export
//        Absensi (biar kelihatan angkanya, bukan cuma label "GPS Jauh"); (0,0) juga sekarang
//        dianggap GPS kosong di Absensi (konsisten sama fix di Timestamp)
//   v17: BUG FIX PENTING #2 — GPS sekarang beneran dibandingin ke lokasi TOKO (Outlet
//        Latitude/Longitude dari mergertool v2 OM+Outlet Master), bukan cuma check-in vs
//        check-out satu sama lain lagi. Fallback ke in-vs-out kalau data outlet nggak ada.
//        Berlaku utk Absensi (GPS Jauh dari Toko) dan Timestamp (kartu baru).
//   v18: (1) jarak dalam meter ditampilin langsung di teks flag "GPS Jauh dari Toko (Xm)";
//        (2) kalau data Outlet nggak ada sama sekali, dilabelin jelas "No Outlet Data" —
//        bukan diklaim "GPS Jauh" berdasar in-vs-out fallback yang nggak valid dibandingin toko
//   v19: label dipendekin jadi "GPS Toko N/A" (dari "No Outlet Data") — biar nggak disalahartikan
//        seolah outlet/ID-nya nggak ada, padahal cuma koordinat toko-nya yang belum ketemu
//   v20: BUG FIX — kartu "GPS Bermasalah" Absensi kemarin gabungin 3 hal beda jadi 1 angka
//        (GPS jauh + GPS kosong + GPS Toko N/A), bikin kelihatan bengkak. Sekarang dipecah
//        jadi 3 kartu terpisah. Timestamp juga ditambahin kartu "GPS Toko N/A" biar konsisten.
//   v21: rename istilah + ganti metrik jadi lebih actionable:
//        - "#Absensi <3x/hari" (dulu "Zona Kurang dari 3") — tetap hit-count
//        - GPS Identik sekarang pakai satuan "Hits", subtitle "X Promotor"
//        - "GPS Tidak Ada" dihapus dari tampilan (bikin bingung, nol terus)
//        - "#Promotor Non-Active", "#Promotor GPS Jauh dari Toko" — sekarang hitung ORANG unik,
//          bukan jumlah baris/hit
//        - "#Toko GPS N/A" — sekarang hitung TOKO unik (dari Outlet Code), bukan jumlah baris
//        - BUG FIX: farFromStore kelupaan gak ke-simpen di object shift Absensi, jadi hitungan
//          unique-nya sebelumnya selalu 0 — udah dibenerin & ditest
//   v22: (1) FIX FAIRNESS — status Non-Active sekarang cuma di-flag kalau tanggal absen
//        TERBUKTI setelah End Date (resign) di HR/DOP; status non-Active tanpa End Date buat
//        dibandingin TIDAK lagi di-flag (dulu keliru diframe sebagai "sistem jebol" — itu
//        cuma snapshot HR hari ini, bukan bukti pelanggaran). Kolom "End Date (Resign)"
//        ditambahin ke tabel/export biar bisa diverifikasi manual.
//        (2) Setiap file export sekarang selalu bawa sheet "Metodologi" — dokumentasi
//        lengkap cara hitung semua kategori anomali, biar logic-nya portable & auditable
//        tanpa perlu buka dashboard lagi.
//   v23: kejelasan unit — beberapa kartu udah jadi "jumlah orang/toko unik" (v21) sementara
//        Overview Total & Key Insights masih "jumlah aktivitas/hari-kerja", bikin campur aduk.
//        Fix: label "Total Anomali Promotor" -> "Total Aktivitas Anomali" (lebih akurat, itu
//        bukan hitungan orang); Key Insights dikasih catatan unit eksplisit + 1 insight baru
//        yang nge-bridge ke angka jumlah-orang/toko biar nggak keliatan dua angka yang beda dunia.
//   v24: (1) fix tanggal mentah (ISO timestamp) di Key Insights, sekarang diformat rapi lewat
//        formatDateShort(); (2) layout — header Overview Total jadi grid 3 kolom eksplisit;
//        grid stat card Absensi diganti dari 3 kolom ke 2 kolom biar label kayak
//        "#Promotor GPS Jauh dari Toko" nggak kepotong lagi
//   v25: hapus insight "Tanggal terparah" (Timestamp & Absensi) dari Key Insights
//   v26: "Role dengan anomali terbanyak" di Key Insights sekarang hitung PROMOTOR unik,
//        bukan jumlah aktivitas/hit — konsisten sama kartu-kartu di bawahnya yang udah
//        people-based
//   v27: header Overview Total dirombak sesuai sketsa — angka utama sekarang "Total Promotor"
//        (headcount SEMUA promotor di data, BUKAN hitungan anomali), disusun vertikal:
//        Total Promotor besar di atas, di bawahnya dipecah Promotor di Timestamp / Promotor
//        di Absensi (juga headcount, bukan anomali). Ini bagian (a) dari revisi layout — bagian
//        Type Promotor & Compliance per tipe menyusul.
//   v28: layout Overview Total jadi 2 kolom bersisian (dipisah garis vertikal) sesuai sketsa:
//        KIRI = Total Promotor + split Timestamp/Absensi; KANAN = Type Promotor (In/Out Store)
//        + Compliance absen Timestamp. Cakupan/Gap tetap di bawah, full-width, 3 kolom.
//   v29: tambah angka TOTAL berukuran sama kayak "Total Promotor" di atas breakdown Type
//        Promotor (In+Out Store) dan Compliance (Comply+Not Comply), biar formatnya konsisten
//        di kedua kolom.
//   v30: (1) 3 kartu Cakupan/Gap dipindah dari full-width bawah ke bawah "Total Promotor"
//        (kolom kiri), bahasanya diformalkan + tanggal diformat rapi (bukan ISO mentah);
//        (2) Type Promotor sekarang hitung PROMOTOR unik (dedup employee_id), bukan jumlah
//        aktivitas; (3) urutan angka-besar-dulu-baru-label disamain di kedua kolom biar
//        sejajar sama "Total Promotor".
//   v31: fix konsistensi angka — (1) In Store + Out Store sekarang hitung SEMUA promotor per
//        tipe (bukan cuma yang ke-flag), jadi totalnya PERSIS sama dengan "Total Promotor"
//        (di-test: 3.813 = In Store + Out Store); (2) label "Total Promotor Ter-flag" jadi
//        "Total Promotor" biasa; (3) angka besar "38.650 hari-kerja" di section Compliance
//        dihapus (beda satuan, bikin bingung), dipindah jadi catatan kecil di bawah
//        "Promotor di Timestamp" (kolom kiri) — nambah field `all` di processAbsensi juga.
//   v32: swap nilai "Promotor di Timestamp"/"Promotor di Absensi" atas permintaan eksplisit
//        user — labelnya tetap sama, tapi angka yang ditampilkan ditukar posisinya.
import React, { useState, useMemo, useCallback, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList
} from "recharts";
import {
  Upload, MapPin, Clock, FileWarning, AlertTriangle, ArrowLeft,
  ChevronDown, ChevronUp, Trophy, ArrowRight, CheckCircle2, X, Lightbulb, Download
} from "lucide-react";

// ───────────────────────── helpers ─────────────────────────

const normalizeJsonRows = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const arrayProp = Object.values(parsed).find((v) => Array.isArray(v));
    if (arrayProp) return arrayProp;
  }
  throw new Error("Format JSON tidak dikenali — harus berupa array of objects.");
};

const parseAnyFile = (file) =>
  new Promise((resolve, reject) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        delimitersToGuess: [",", ";", "\t", "|"],
        transformHeader: (h) => String(h || "").replace(/^\uFEFF/, "").trim(),
        complete: (res) => resolve(res.data),
        error: reject,
      });
    } else if (name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(String(e.target.result));
          resolve(normalizeJsonRows(parsed));
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    } else if (name.endsWith(".ndjson")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const lines = String(e.target.result).split("\n").map((l) => l.trim()).filter(Boolean);
          resolve(lines.map((l) => JSON.parse(l)));
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(ws, { defval: "" }));
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    }
  });

const toRad = (d) => (d * Math.PI) / 180;
const haversineMeters = (a, b) => {
  if (!a || !b) return null;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const toNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  let s = String(v).trim();
  // Handle Indonesian/European decimal-comma format (e.g. "112,64118",
  // "-7,2478937") — parseFloat alone stops at the comma and silently
  // truncates to the integer part, which is what caused GPS coordinates to
  // collapse to near-identical truncated values after merging.
  if (/^-?\d+,\d+$/.test(s)) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
};

const classifyPromotorType = (roleStr) => {
  // normalize hyphens/underscores to spaces first — real HR data uses
  // "In-Store Promotor" (with a hyphen), which "in store".includes() alone
  // would never match.
  const r = String(roleStr || "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (!r || r === "-") return "Lainnya";
  if (r.includes("in store") || r.includes("sgs") || r.includes("spg")) return "In Store Promotor";
  if (r.includes("out store") || r.includes("sds") || r === "ds") return "Out Store Promotor";
  return "Lainnya";
};

const topNWithRole = (rows, keyFn, roleFn, n, regionFn, clusterFn) => {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, { count: 0, role: roleFn(r), region: regionFn ? regionFn(r) : undefined, cluster: clusterFn ? clusterFn(r) : undefined });
    map.get(k).count++;
  });
  return [...map.entries()]
    .map(([name, v]) => ({ name, role: v.role, region: v.region, cluster: v.cluster, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
};

const splitByRecordType = (rows) => {
  const absensi = [];
  const timestamp = [];
  rows.forEach((r) => {
    const rt = String(r["Record_Type"] ?? r["record_type"] ?? "").trim().toLowerCase();
    if (rt === "absensi") absensi.push(r);
    else if (rt === "timestamp") timestamp.push(r);
  });
  return { absensi, timestamp };
};

// Exports rows to a downloaded .xlsx file. If `columns` is given (the same
// column-spec objects used by the on-screen tables), the exported sheet
// mirrors exactly what's shown on screen (using each column's render() where
// present); otherwise the raw row objects are exported as-is.
// Full calculation methodology, embedded as a second sheet in every export
// so the logic travels WITH the data — auditable without needing the
// dashboard open. Kept as one comprehensive document (rather than picking
// a subset per button) so nothing is ever missing from an export by
// accident.
const METHODOLOGY_LINES = [
  ["METODOLOGI PERHITUNGAN ANOMALI PROMOTOR"],
  [`Diexport: ${new Date().toLocaleString("id-ID")}`],
  [""],
  ["Catatan penting: dashboard ini titik AWAL investigasi, bukan bukti final. Kroscek manual"],
  ["dianjurkan sebelum dipakai untuk keputusan apapun ke karyawan."],
  [""],
  ["1. #ABSENSI <3x/HARI (Timestamp)"],
  ["   Dihitung per kombinasi Karyawan + Tanggal (bukan per baris check-in mentah)."],
  ["   Tiap check-in dikelompokkan ke 1 zona waktu berdasar jam Start Time:"],
  ["   Pagi (07-10), Siang (11-14), Sore (15-18), Malam 1 (19-22), Malam 2 (23-00)."],
  ["   Comply jika jumlah ZONA BERBEDA yang tercapai dalam 1 hari >= 3."],
  ["   Check-in berulang di zona yang sama TIDAK menambah hitungan zona."],
  ["   Comply/Not Comply butuh 3 zona BERTURUT-TURUT tanpa lompat (bukan sekadar 3 zona beda)."],
  ["   Jarak GPS tidak menjadi parameter perhitungan."],
  [""],
  ["2. GPS IDENTIK (Timestamp)"],
  ["   Dalam 1 hari yang sama, dicek apakah ada 2+ check-in dengan koordinat lat/lon yang"],
  ["   PERSIS SAMA (exact match, bukan dibulatkan). (0,0) dianggap GPS kosong, bukan lokasi valid."],
  [""],
  ["3. GPS JAUH DARI TOKO (Timestamp & Absensi)"],
  ["   Jarak dihitung pakai formula Haversine (jarak permukaan bumi dari lat/lon)."],
  ["   Absensi: dibandingkan GPS Check-in DAN Check-out vs koordinat Outlet (toko)."],
  ["   Timestamp: tiap check-in di hari itu dibandingkan vs koordinat Outlet."],
  ["   Kalau jarak > threshold GPS (m) yang diset di panel kontrol -> di-flag."],
  ["   Koordinat Outlet didapat dari: Employee -> Sales Code -> file OM -> Outlet Code ->"],
  ["   file Outlet Master -> Latitude/Longitude toko (di-generate lewat mergertool)."],
  [""],
  ["4. GPS TOKO N/A (Timestamp & Absensi)"],
  ["   Muncul kalau rantai pencarian di atas GAGAL (Sales Code tidak ketemu di OM, atau Outlet"],
  ["   Code tidak ketemu koordinatnya di Outlet Master) -- BUKAN klaim GPS jauh, murni data"],
  ["   belum lengkap. Dihitung sebagai jumlah TOKO unik (Outlet Code) yang kekurangan data,"],
  ["   bukan jumlah baris/kejadian."],
  [""],
  ["5. #PROMOTOR NON-ACTIVE (Timestamp & Absensi)"],
  ["   HANYA di-flag kalau tanggal record (absen/check-in) TERBUKTI setelah tanggal End Date"],
  ["   (tanggal resign) di data HR/DOP. Status \"non-Active\" hari ini SAJA (tanpa End Date yang"],
  ["   bisa dibandingkan) TIDAK di-flag -- itu cuma snapshot HR hari export, bukan bukti"],
  ["   pelanggaran. Dihitung sebagai jumlah PROMOTOR unik, bukan jumlah baris."],
  [""],
  ["6. DURASI BERMASALAH (Absensi)"],
  ["   Shift kerja (Time Duration) lebih pendek dari threshold \"Pendek <\" ATAU lebih panjang"],
  ["   dari threshold \"Panjang >\", ATAU tidak ada jam Clock-out sama sekali."],
  [""],
  ["Kunci join antar file (di mergertool): Employee ID (Employee No/Employee Number)."],
  ["Kunci join ke data Outlet: Sales Code (Employee) -> OM -> Outlet Code -> Outlet Master."],
];

function exportRowsToXlsx(rows, filename, columns) {
  if (!rows || rows.length === 0) return;
  const data = columns
    ? rows.map((r) => {
        const out = {};
        columns.forEach((c) => { out[c.label] = c.render ? c.render(r) : r[c.key]; });
        return out;
      })
    : rows;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const methodWs = XLSX.utils.aoa_to_sheet(METHODOLOGY_LINES);
  methodWs["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, methodWs, "Metodologi");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx");
}

function ExportButton({ onClick, small }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Export ke Excel"
      className={`flex items-center gap-1 text-gray-400 hover:text-teal-700 transition-colors ${small ? "p-1" : "px-2 py-1 text-[11px] border border-gray-200 rounded-md hover:border-teal-300"}`}
    >
      <Download className={small ? "w-3 h-3" : "w-3 h-3"} />
      {!small && "Export"}
    </button>
  );
}

const getPosition = (r) =>
  r["Position_HR"] || r["Position_ABSENSI"] || r["Position_TIMESTAMP"] || r["Position_DOP"] || "-";

const getStatus = (r) => r["Employment Status_HR"] || r["Status_DOP"] || "-";
// Status kosong/nggak jelas TETAP diikutin (bukan otomatis dianggap terminate) —
// cuma yang eksplisit nunjukin resign/terminate/non-active yang di-exclude.
const isTerminatedStatus = (s) => /terminat|resign|non-?active|inactive/i.test(String(s || ""));

// Outlet reference coordinate, present only when the merger was run with
// OM + Outlet Master uploaded (see mergertool.html). Falls back to null
// when absent so callers can degrade gracefully.
const getOutletCoord = (r) => {
  const lat = toNum(r["Outlet Latitude"]);
  const lon = toNum(r["Outlet Longitude"]);
  return lat != null && lon != null ? { lat, lon } : null;
};

// Parses a date value that may already be a Date object, an Excel serial
// number, or a date string, returning a comparable Date (or null).
function formatDateShort(v) {
  const d = parseAnyDate(v);
  if (!d) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// Masa kerja (dalam bulan penuh) dari Join Date sampai tanggal referensi
// (biasanya tanggal record itu sendiri). Dipakai buat nyiapin fondasi fitur
// target/tiering promotor — logic target-nya sendiri belum final, jadi cuma
// nampilin angka masa kerja dulu.
function monthsBetween(joinDateVal, refDateVal) {
  const from = parseAnyDate(joinDateVal);
  const to = parseAnyDate(refDateVal);
  if (!from || !to) return null;
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

function parseAnyDate(v) {
  if (v == null || v === "" || v === "-") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + v * 86400000);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Fair status-anomaly check: only flags when we can PROVE the attendance/
// journey record happened AFTER the employee's resignation date (End Date).
// A status that is simply "not Active today" is NOT enough on its own —
// that only reflects today's HR snapshot, not the status on the day the
// record happened, so flagging on that alone would be misleading (it does
// NOT mean the attendance system let a resigned employee clock in).
function checkStatusAnomaly(status, recordDateVal, endDateVal) {
  const s = String(status || "").trim().toLowerCase();
  const isNonActive = !!s && s !== "-" && s !== "active";
  if (!isNonActive) return { flagged: false, verified: true };
  const recordDate = parseAnyDate(recordDateVal);
  const endDate = parseAnyDate(endDateVal);
  if (recordDate && endDate) {
    return { flagged: recordDate > endDate, verified: true };
  }
  // Non-active but no End Date to compare against — can't verify timing,
  // so we do NOT flag (avoids an unfair claim we can't back up).
  return { flagged: false, verified: false };
}

const describeFlagsTimestamp = (v) =>
  [v.zoneNotCompliant && `Zona Kurang (${v.distinctZoneCount}/3)`, v.gpsIdentical && "GPS Identik",
   v.farFromStore && `GPS Jauh dari Toko (${v.maxStoreDist !== null ? v.maxStoreDist.toFixed(0) : "-"}m)`,
   v.noOutletData && "GPS Toko N/A",
   v.noCoord && "No-GPS", v.statusAnomaly && "Status Non-Active"]
    .filter(Boolean).join(", ");

const describeFlagsAbsensi = (s) =>
  [s.gpsIssue && (s.noCoord ? "No-GPS" : `GPS Jauh dari Toko (${s.maxStoreDist !== null ? s.maxStoreDist.toFixed(0) : "-"}m)`),
   s.noOutletData && "GPS Toko N/A",
   s.statusAnomaly && "Status Non-Active",
   s.durationIssue && (s.noClockOut ? "No-Clockout" : s.shortShift ? "Durasi Pendek" : "Durasi Panjang")]
    .filter(Boolean).join(", ");

const TIMESTAMP_COLUMNS = [
  { key: "date", label: "Tgl" },
  { key: "employee_name", label: "Nama" },
  { key: "region", label: "Region" },
  { key: "cluster", label: "Cluster" },
  { key: "position", label: "Role" },
  { key: "status", label: "Status" },
  { key: "endDate", label: "End Date (Resign)", render: (v) => v.endDate ? formatDateShort(v.endDate) : "-" },
  { key: "joinDate", label: "Join Date", render: (v) => v.joinDate ? formatDateShort(v.joinDate) : "-" },
  { key: "tenureMonths", label: "Masa Kerja (Bulan)", render: (v) => v.tenureMonths != null ? v.tenureMonths.toLocaleString("id-ID") : "-" },
  { key: "checkinCount", label: "Absen" },
  { key: "distinctZoneCount", label: "Zona" },
  { key: "coordsList", label: "Koordinat Check-in (lat, lon)" },
  { key: "outletName", label: "Outlet", render: (v) => v.outletName || (v.rawOutletCode ? `(${v.rawOutletCode}) — nama tidak ditemukan` : "-") },
  { key: "distToStoreList", label: "Jarak ke Toko per Check-in (m)", render: (v) => v.distToStoreList || "-" },
  { key: "flags", label: "Flag", render: describeFlagsTimestamp },
];

const ABSENSI_COLUMNS = [
  { key: "date", label: "Tgl" },
  { key: "employee_name", label: "Nama" },
  { key: "region", label: "Region" },
  { key: "cluster", label: "Cluster" },
  { key: "position", label: "Role" },
  { key: "status", label: "Status" },
  { key: "endDate", label: "End Date (Resign)", render: (r) => r.endDate ? formatDateShort(r.endDate) : "-" },
  { key: "joinDate", label: "Join Date", render: (r) => r.joinDate ? formatDateShort(r.joinDate) : "-" },
  { key: "tenureMonths", label: "Masa Kerja (Bulan)", render: (r) => r.tenureMonths != null ? r.tenureMonths.toLocaleString("id-ID") : "-" },
  { key: "durHr", label: "Jam", render: (r) => r.durHr !== null ? r.durHr.toFixed(1) : "-" },
  { key: "coordIn", label: "Koordinat Check-in (lat, lon)" },
  { key: "coordOut", label: "Koordinat Check-out (lat, lon)" },
  { key: "outletName", label: "Outlet", render: (r) => r.outletName || (r.rawOutletCode ? `(${r.rawOutletCode}) — nama tidak ditemukan` : "-") },
  { key: "distToStoreIn", label: "Jarak Check-in ke Toko (m)", render: (r) => r.distToStoreIn !== null && r.distToStoreIn !== undefined ? r.distToStoreIn.toFixed(0) : "-" },
  { key: "distToStoreOut", label: "Jarak Check-out ke Toko (m)", render: (r) => r.distToStoreOut !== null && r.distToStoreOut !== undefined ? r.distToStoreOut.toFixed(0) : "-" },
  { key: "moveM", label: "Jarak In-Out (m)", render: (r) => r.moveM !== null ? r.moveM.toFixed(0) : "-" },
  { key: "flags", label: "Flag", render: describeFlagsAbsensi },
];

// ───────────────────────── Absensi (attendance) processing ─────────────────────────

function summarizeCoverage(items, idFn, dateFn) {
  const ids = new Set(items.map(idFn).filter((v) => v && v !== "-"));
  const dates = items.map(dateFn).filter((v) => v && v !== "-").sort();
  return {
    uniqueEmployees: ids.size,
    employeeIds: ids,
    dateMin: dates.length ? dates[0] : null,
    dateMax: dates.length ? dates[dates.length - 1] : null,
  };
}

function processAbsensi(rows, moveThresholdM, shortHr, longHr) {
  // Cuma In Store Promotor & Out Store Promotor yang masuk hitungan anomali —
  // role lain (SPV, Canvasser, dll) di-exclude dari analisis ini. Karyawan
  // yang statusnya Terminate/resign/non-active juga di-exclude total dari
  // sini — statusnya nggak jelas/kosong tetap DIIKUTIN (bukan Terminate).
  const scopedRows = rows.filter((r) => {
    const t = classifyPromotorType(getPosition(r));
    if (t !== "In Store Promotor" && t !== "Out Store Promotor") return false;
    return !isTerminatedStatus(getStatus(r));
  });
  const shifts = scopedRows.map((r) => {
    let latIn = toNum(r["Latitude In_ABSENSI"]);
    let lonIn = toNum(r["Longitude In_ABSENSI"]);
    let latOut = toNum(r["Latitude Out_ABSENSI"]);
    let lonOut = toNum(r["Longitude Out_ABSENSI"]);
    // (0,0) is a common sentinel for "GPS failed to capture" — treat as missing.
    if (latIn === 0 && lonIn === 0) { latIn = null; lonIn = null; }
    if (latOut === 0 && lonOut === 0) { latOut = null; lonOut = null; }
    const hasIn = latIn !== null && lonIn !== null;
    const hasOut = latOut !== null && lonOut !== null;
    const inOutDistM = hasIn && hasOut ? haversineMeters({ lat: latIn, lon: lonIn }, { lat: latOut, lon: lonOut }) : null;

    // Preferred comparison: check-in/out GPS vs the assigned OUTLET's actual
    // coordinate (from OM + Outlet Master, joined via Sales Code in the
    // merger tool). Falls back to comparing check-in vs check-out to each
    // other only when no outlet reference is available in this data.
    const outlet = getOutletCoord(r);
    const distToStoreIn = outlet && hasIn ? haversineMeters({ lat: latIn, lon: lonIn }, outlet) : null;
    const distToStoreOut = outlet && hasOut ? haversineMeters({ lat: latOut, lon: lonOut }, outlet) : null;
    const usingStoreRef = !!outlet;
    // Only claim "far from store" when we actually HAVE a store to compare
    // against — without an outlet reference we can't verify anything, so we
    // report that gap plainly (noOutletData) instead of guessing via in-vs-out.
    const farFromStore = usingStoreRef
      ? (distToStoreIn !== null && distToStoreIn > moveThresholdM) || (distToStoreOut !== null && distToStoreOut > moveThresholdM)
      : false;
    const noOutletData = !usingStoreRef && hasIn;
    const maxStoreDist = usingStoreRef ? Math.max(distToStoreIn ?? 0, distToStoreOut ?? 0) : null;

    const durHr = toNum(r["Time Duration Adj (Hours)_ABSENSI"] ?? r["Time Duration (Hours)_ABSENSI"]);
    const position = getPosition(r);
    const status = getStatus(r);
    const endDate = r["End Date_HR"] ?? r["End Date_DOP"] ?? null;
    const joinDate = r["Join Date_DOP"] ?? null;
    const tenureMonths = monthsBetween(joinDate, r["Date_ABSENSI"]);
    const statusCheck = checkStatusAnomaly(status, r["Date_ABSENSI"], endDate);
    const noCoord = !hasIn;
    const noClockOut = !String(r["Time Out_ABSENSI"] || "").trim();
    const shortShift = durHr !== null && durHr < shortHr;
    const longShift = durHr !== null && durHr > longHr;

    return {
      date: r["Date_ABSENSI"] || "-",
      employee_id: r["Employee ID"] || "-",
      employee_name: r["Employee Name_ABSENSI"] || r["Employee ID"] || "-",
      region: r["Region_DOP"] || "-",
      cluster: r["Cluster_DOP"] || "-",
      position,
      status,
      joinDate,
      tenureMonths,
      promotorType: classifyPromotorType(position),
      durHr,
      noClockOut,
      shortShift,
      longShift,
      moveM: inOutDistM,
      outletName: outlet ? (r["Outlet Name"] || "-") : null,
      rawOutletCode: r["Outlet Code"] || null,
      distToStoreIn,
      distToStoreOut,
      maxStoreDist,
      usingStoreRef,
      noOutletData,
      farFromStore,
      coordIn: latIn == null ? "(kosong)" : `(${latIn}, ${lonIn})`,
      coordOut: latOut == null ? "(kosong)" : `(${latOut}, ${lonOut})`,
      noCoord,
      // 3 currently-detectable signals given field data limitations. "No
      // Outlet Data" surfaces here too (not as a real GPS claim) so the gap
      // is visible instead of silently passing through unflagged.
      gpsIssue: noCoord || farFromStore || noOutletData,
      endDate,
      statusAnomaly: statusCheck.flagged,
      statusUnverified: !statusCheck.verified,
      durationIssue: noClockOut || shortShift || longShift,
    };
  });

  const total = shifts.length;
  const isFlagged = (s) => s.gpsIssue || s.statusAnomaly || s.durationIssue;
  const uniquePeople = (pred) => new Set(shifts.filter(pred).map((s) => s.employee_id).filter(Boolean)).size;
  const uniqueOutlets = (pred) => new Set(shifts.filter(pred).map((s) => s.rawOutletCode).filter(Boolean)).size;

  const anomalyCounts = {
    // GPS is split into 3 distinct signals instead of one bucket — lumping
    // them together previously made "missing outlet data" (a data-completeness
    // gap, not real GPS misbehavior) inflate the same number as genuine
    // far-from-store cases.
    gpsFar: uniquePeople((s) => s.farFromStore), // # promotor (unique), not hit-count
    gpsNoCoord: shifts.filter((s) => s.noCoord).length,
    gpsNoOutlet: uniqueOutlets((s) => s.noOutletData), // # toko (unique), not hit-count
    status: uniquePeople((s) => s.statusAnomaly), // # promotor (unique), not hit-count
    duration: shifts.filter((s) => s.durationIssue).length,
  };

  const byRole = {};
  shifts.forEach((s) => {
    byRole[s.position] = byRole[s.position] || { role: s.position, anomali: 0, total: 0 };
    byRole[s.position].total++;
    if (isFlagged(s)) byRole[s.position].anomali++;
  });

  // Same grouping but counting UNIQUE PROMOTOR per role, not activity rows —
  // used for the "role with most anomali" Key Insight so it reads as people,
  // not raw hit-count.
  const byRolePeopleRaw = {};
  shifts.forEach((s) => {
    if (!s.employee_id) return;
    byRolePeopleRaw[s.position] = byRolePeopleRaw[s.position] || { role: s.position, peopleSet: new Set(), anomaliSet: new Set() };
    byRolePeopleRaw[s.position].peopleSet.add(s.employee_id);
    if (isFlagged(s)) byRolePeopleRaw[s.position].anomaliSet.add(s.employee_id);
  });
  const byRolePeople = Object.values(byRolePeopleRaw)
    .map((r) => ({ role: r.role, anomaliPeople: r.anomaliSet.size, totalPeople: r.peopleSet.size }))
    .sort((a, b) => b.anomaliPeople - a.anomaliPeople);
  const worstRolePeople = byRolePeople.length && byRolePeople[0].anomaliPeople > 0 ? byRolePeople[0] : null;

  const byPromotorType = {};
  shifts.forEach((s) => {
    byPromotorType[s.promotorType] = byPromotorType[s.promotorType] || { type: s.promotorType, anomali: 0, total: 0 };
    byPromotorType[s.promotorType].total++;
    if (isFlagged(s)) byPromotorType[s.promotorType].anomali++;
  });

  const byDate = {};
  shifts.forEach((s) => {
    byDate[s.date] = byDate[s.date] || { date: s.date, anomali: 0, total: 0 };
    byDate[s.date].total++;
    if (isFlagged(s)) byDate[s.date].anomali++;
  });

  const flagged = shifts.filter(isFlagged);
  const byRoleArr = Object.values(byRole).sort((a, b) => b.anomali - a.anomali);
  const byDateArr = Object.values(byDate).sort((a, b) => (a.date > b.date ? 1 : -1));
  const worstRole = byRoleArr.length ? [...byRoleArr].sort((a, b) => b.anomali - a.anomali)[0] : null;
  const worstDate = byDateArr.length ? [...byDateArr].sort((a, b) => b.anomali - a.anomali)[0] : null;
  const coverage = summarizeCoverage(shifts, (s) => s.employee_id, (s) => s.date);

  return {
    total,
    all: shifts,
    anomalyCounts,
    byRole: byRoleArr,
    byPromotorType,
    byPromotorTypeChart: Object.values(byPromotorType).sort((a, b) => b.anomali - a.anomali),
    byDate: byDateArr,
    flagged,
    worstRole,
    worstRolePeople,
    worstDate,
    coverage,
    topOffenders: topNWithRole(flagged, (s) => s.employee_name, (s) => s.position, 5),
  };
}

// ───────────────────────── Timestamp (journey/visit) processing ─────────────────────────

// HARPA time-card zones — a check-in's hour determines which window it
// falls in. Multiple check-ins in the same zone only count once toward the
// "3 different zones" requirement.
function deriveZone(v) {
  let hour = null;
  if (v instanceof Date) hour = v.getHours();
  else if (typeof v === "number") hour = Math.floor((v % 1) * 24);
  else if (typeof v === "string") {
    const m = v.match(/(\d{1,2}):(\d{2})/);
    if (m) hour = parseInt(m[1], 10);
  }
  if (hour == null || Number.isNaN(hour)) return null;
  if (hour >= 7 && hour <= 10) return "Pagi";
  if (hour >= 11 && hour <= 14) return "Siang";
  if (hour >= 15 && hour <= 18) return "Sore";
  if (hour >= 19 && hour <= 22) return "Malam 1";
  if (hour === 23 || hour === 0) return "Malam 2";
  return null;
}

// Urutan zona resmi sepanjang hari — dipakai buat ngecek "berturut-turut tanpa
// lompat", bukan cuma "jumlah zona berbeda >= 3". Contoh: Pagi+Siang+Sore lolos
// (3 beruntun), tapi Pagi+Sore+Malam 1 GAGAL (lompat Siang) walau sama-sama 3
// zona berbeda.
const ZONE_ORDER = ["Pagi", "Siang", "Sore", "Malam 1", "Malam 2"];
function hasConsecutiveZones(zoneSet) {
  let run = 0;
  for (const z of ZONE_ORDER) {
    if (zoneSet.has(z)) {
      run++;
      if (run >= 3) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

// Deliberately EXACT match — no rounding. "GPS identik" means the raw
// latitude/longitude values are precisely the same, not just close.
const coordKey = (lat, lon) => (lat == null || lon == null ? null : lat + "," + lon);

function processTimestamp(rows, storeThresholdM) {
  // Cuma In Store Promotor & Out Store Promotor yang masuk hitungan anomali.
  // Karyawan Terminate/resign/non-active di-exclude total.
  const scopedRows = rows.filter((r) => {
    const t = classifyPromotorType(getPosition(r));
    if (t !== "In Store Promotor" && t !== "Out Store Promotor") return false;
    return !isTerminatedStatus(getStatus(r));
  });

  // Compliance HARPA dinilai PER HARI per karyawan (butuh minimal 3 check-in
  // di 3 zona waktu berbeda dalam 1 hari), jadi group dulu sebelum dinilai.
  const groups = new Map();
  scopedRows.forEach((r) => {
    const key = (r["Employee ID"] ?? "-") + "|" + (r["Date_TIMESTAMP"] || "-");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  const visits = [...groups.values()].map((groupRows) => {
    const first = groupRows[0];
    const position = getPosition(first);
    const status = getStatus(first);
    const endDate = first["End Date_HR"] ?? first["End Date_DOP"] ?? null;
    const joinDate = first["Join Date_DOP"] ?? null;
    const tenureMonths = monthsBetween(joinDate, first["Date_TIMESTAMP"]);
    const statusCheck = checkStatusAnomaly(status, first["Date_TIMESTAMP"], endDate);

    const outlet = getOutletCoord(first);
    const checks = groupRows.map((r) => {
      let lat = toNum(r["Latitude In_TIMESTAMP"]);
      let lon = toNum(r["Longitude In_TIMESTAMP"]);
      // (0,0) is a common sentinel for "GPS failed to capture", not a real
      // location — treat it the same as missing, not as a valid coordinate.
      if (lat === 0 && lon === 0) { lat = null; lon = null; }
      const distToStore = outlet && lat != null && lon != null ? haversineMeters({ lat, lon }, outlet) : null;
      return { zone: deriveZone(r["Start Time_TIMESTAMP"]), lat, lon, distToStore };
    });

    const distinctZones = new Set(checks.map((c) => c.zone).filter(Boolean));
    const checkinCount = groupRows.length;
    // Comply = ada MINIMAL 3 zona BERTURUT-TURUT (nggak boleh lompat) dari urutan
    // Pagi -> Siang -> Sore -> Malam 1 -> Malam 2. Contoh: Pagi+Siang+Sore = comply;
    // Pagi+Sore+Malam 1 = TIDAK comply (lompat Siang), walau sama-sama 3 zona beda.
    const zoneNotCompliant = !hasConsecutiveZones(distinctZones);

    // Rule 3: GPS identik antar check-in di hari yang sama.
    const seen = new Set();
    let gpsIdentical = false;
    checks.forEach((c) => {
      const key = coordKey(c.lat, c.lon);
      if (!key) return;
      if (seen.has(key)) gpsIdentical = true;
      seen.add(key);
    });

    const noCoord = checks.some((c) => c.lat == null || c.lon == null);
    // human-readable list of every check-in's coordinate for this day, so it's
    // visible (and exportable) exactly which raw lat/lon values were compared.
    const coordsList = checks.map((c) => (c.lat == null ? "(kosong)" : `(${c.lat}, ${c.lon})`)).join(" | ");
    const distToStoreList = outlet
      ? checks.map((c) => (c.distToStore == null ? "-" : c.distToStore.toFixed(0))).join(" | ")
      : null;
    const farFromStore = outlet ? checks.some((c) => c.distToStore !== null && c.distToStore > storeThresholdM) : false;
    const storeDists = checks.map((c) => c.distToStore).filter((d) => d !== null);
    const maxStoreDist = outlet && storeDists.length ? Math.max(...storeDists) : null;
    // No outlet reference at all for this employee (didn't match via Sales
    // Code -> OM -> Outlet Master) — report that plainly instead of
    // silently skipping the store-distance check.
    const noOutletData = !outlet && checks.some((c) => c.lat != null);

    return {
      date: first["Date_TIMESTAMP"] || "-",
      employee_id: first["Employee ID"] || "-",
      employee_name: first["Employee Name_TIMESTAMP"] || first["Employee ID"] || "-",
      region: first["Region_DOP"] || "-",
      cluster: first["Cluster_DOP"] || "-",
      position,
      status,
      joinDate,
      tenureMonths,
      promotorType: classifyPromotorType(position),
      checkinCount,
      distinctZoneCount: distinctZones.size,
      coordsList,
      outletName: outlet ? (first["Outlet Name"] || "-") : null,
      rawOutletCode: first["Outlet Code"] || null,
      distToStoreList,
      maxStoreDist,
      farFromStore,
      noOutletData,
      zoneNotCompliant,
      gpsIdentical,
      noCoord,
      endDate,
      statusAnomaly: statusCheck.flagged,
      statusUnverified: !statusCheck.verified,
    };
  });

  const total = visits.length;
  const isFlagged = (v) => v.zoneNotCompliant || v.gpsIdentical || v.noCoord || v.statusAnomaly || v.farFromStore;
  const uniquePeopleTs = (pred) => new Set(visits.filter(pred).map((v) => v.employee_id).filter(Boolean)).size;
  const uniqueOutletsTs = (pred) => new Set(visits.filter(pred).map((v) => v.rawOutletCode).filter(Boolean)).size;

  const anomalyCounts = {
    zone: visits.filter((v) => v.zoneNotCompliant).length, // # absensi <3x/hari (hit-count)
    gpsIdentical: visits.filter((v) => v.gpsIdentical).length, // Hits
    noCoord: visits.filter((v) => v.noCoord).length,
    status: uniquePeopleTs((v) => v.statusAnomaly), // # promotor (unique), not hit-count
    farFromStore: uniquePeopleTs((v) => v.farFromStore), // # promotor (unique), not hit-count
    noOutletData: uniqueOutletsTs((v) => v.noOutletData), // # toko (unique), not hit-count
  };
  const gpsIdenticalPeople = new Set(visits.filter((v) => v.gpsIdentical).map((v) => v.employee_id)).size;

  const byRole = {};
  visits.forEach((v) => {
    byRole[v.position] = byRole[v.position] || { role: v.position, anomali: 0, total: 0 };
    byRole[v.position].total++;
    if (isFlagged(v)) byRole[v.position].anomali++;
  });

  const byRolePeopleRawTs = {};
  visits.forEach((v) => {
    if (!v.employee_id) return;
    byRolePeopleRawTs[v.position] = byRolePeopleRawTs[v.position] || { role: v.position, peopleSet: new Set(), anomaliSet: new Set() };
    byRolePeopleRawTs[v.position].peopleSet.add(v.employee_id);
    if (isFlagged(v)) byRolePeopleRawTs[v.position].anomaliSet.add(v.employee_id);
  });
  const byRolePeople = Object.values(byRolePeopleRawTs)
    .map((r) => ({ role: r.role, anomaliPeople: r.anomaliSet.size, totalPeople: r.peopleSet.size }))
    .sort((a, b) => b.anomaliPeople - a.anomaliPeople);
  const worstRolePeople = byRolePeople.length && byRolePeople[0].anomaliPeople > 0 ? byRolePeople[0] : null;

  const byPromotorType = {};
  visits.forEach((v) => {
    byPromotorType[v.promotorType] = byPromotorType[v.promotorType] || { type: v.promotorType, anomali: 0, total: 0 };
    byPromotorType[v.promotorType].total++;
    if (isFlagged(v)) byPromotorType[v.promotorType].anomali++;
  });

  const byDate = {};
  visits.forEach((v) => {
    byDate[v.date] = byDate[v.date] || { date: v.date, anomali: 0, total: 0 };
    byDate[v.date].total++;
    if (isFlagged(v)) byDate[v.date].anomali++;
  });

  const flagged = visits.filter(isFlagged);
  const byRoleArr = Object.values(byRole).sort((a, b) => b.anomali - a.anomali);
  const byDateArr = Object.values(byDate).sort((a, b) => (a.date > b.date ? 1 : -1));
  const worstRole = byRoleArr.length ? [...byRoleArr].sort((a, b) => b.anomali - a.anomali)[0] : null;
  const worstDate = byDateArr.length ? [...byDateArr].sort((a, b) => b.anomali - a.anomali)[0] : null;
  const coverage = summarizeCoverage(visits, (v) => v.employee_id, (v) => v.date);

  return {
    total,
    all: visits,
    anomalyCounts,
    gpsIdenticalPeople,
    byRole: byRoleArr,
    byPromotorType,
    byPromotorTypeChart: Object.values(byPromotorType).sort((a, b) => b.anomali - a.anomali),
    byDate: byDateArr,
    flagged,
    worstRole,
    worstRolePeople,
    worstDate,
    coverage,
    topOffenders: topNWithRole(flagged, (v) => v.employee_name, (v) => v.position, 5),
  };
}

// ───────────────────────── Key Insights ─────────────────────────

function computeInsights(timestampResult, absensiResult) {
  const insights = [];

  if (timestampResult && timestampResult.total > 0) {
    const rate = ((timestampResult.flagged.length / timestampResult.total) * 100).toFixed(1).replace(".", ",");
    insights.push(`Anomali Timestamp: ${rate}%`);
    if (timestampResult.worstRolePeople) {
      insights.push(`Anomali Role Timestamp (${timestampResult.worstRolePeople.role}): ${timestampResult.worstRolePeople.anomaliPeople.toLocaleString("id-ID")} promotor`);
    }
  }

  if (absensiResult && absensiResult.total > 0) {
    const rate = ((absensiResult.flagged.length / absensiResult.total) * 100).toFixed(1).replace(".", ",");
    insights.push(`Anomali Absensi: ${rate}%`);
    if (absensiResult.worstRolePeople) {
      insights.push(`Anomali Role Absensi (${absensiResult.worstRolePeople.role}): ${absensiResult.worstRolePeople.anomaliPeople.toLocaleString("id-ID")} promotor`);
    }
  }

  if (timestampResult && absensiResult && timestampResult.total > 0 && absensiResult.total > 0) {
    const tRate = timestampResult.flagged.length / timestampResult.total;
    const aRate = absensiResult.flagged.length / absensiResult.total;
    if (tRate > aRate * 1.2) insights.push("Anomali Lebih Tinggi: Timestamp");
    else if (aRate > tRate * 1.2) insights.push("Anomali Lebih Tinggi: Absensi");
  }

  const gpsFarPeople = (timestampResult?.anomalyCounts.farFromStore ?? 0) + (absensiResult?.anomalyCounts.gpsFar ?? 0);
  const gpsNoOutletToko = Math.max(timestampResult?.anomalyCounts.noOutletData ?? 0, absensiResult?.anomalyCounts.gpsNoOutlet ?? 0);
  if (gpsFarPeople > 0) insights.push(`GPS Jauh dari Toko: ${gpsFarPeople.toLocaleString("id-ID")} promotor`);
  if (gpsNoOutletToko > 0) insights.push(`Toko Data GPS Belum Lengkap: ${gpsNoOutletToko.toLocaleString("id-ID")} toko`);

  const combinedTop = new Map();
  [timestampResult, absensiResult].forEach((res) => {
    if (!res) return;
    res.topOffenders.forEach((o) => {
      combinedTop.set(o.name, (combinedTop.get(o.name) || 0) + o.count);
    });
  });
  const topPerson = [...combinedTop.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPerson) insights.push(`Anomali Tertinggi (Gabungan): ${topPerson[0]} (${topPerson[1].toLocaleString("id-ID")} kejadian)`);

  return insights;
}

function InsightsCard({ insights }) {
  if (!insights || insights.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-700 font-semibold mb-3">
        <Lightbulb className="w-3.5 h-3.5" /> Key Insights
      </div>
      <ul className="space-y-1.5">
        {insights.map((txt, i) => (
          <li key={i} className="text-xs text-gray-700 flex gap-2">
            <span className="text-amber-600">&bull;</span>
            <span>{txt}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── shared UI bits ─────────────────────────

function UploadBox({ onFiles, label, fileNames }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const hasFiles = fileNames && fileNames.length > 0;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files)); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 flex flex-col items-center justify-center text-center transition-colors min-w-0 ${
        dragOver ? "border-teal-400 bg-teal-50" : hasFiles ? "border-teal-700 bg-teal-50" : "border-gray-300 bg-gray-50 hover:border-gray-400"
      }`}
    >
      {hasFiles ? (
        <>
          <CheckCircle2 className="w-6 h-6 text-teal-700 mb-2" />
          <p className="text-teal-700 text-sm font-medium">{fileNames.length} file terupload</p>
          <p className="text-gray-500 text-xs mt-1 max-w-full truncate px-4">{fileNames.join(", ")}</p>
          <p className="text-gray-400 text-[11px] mt-1">Klik atau drop lagi untuk tambah file</p>
        </>
      ) : (
        <>
          <Upload className="w-6 h-6 text-gray-500 mb-2" />
          <p className="text-gray-700 text-sm font-medium">{label}</p>
          <p className="text-gray-500 text-xs mt-1">CSV/XLSX/JSON/NDJSON, bisa pilih banyak file sekaligus</p>
        </>
      )}
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.json,.ndjson" multiple className="hidden"
        onChange={(e) => e.target.files.length && onFiles(Array.from(e.target.files))} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone, onClick, subtitle, unit, exportRows, exportColumns, exportFilename }) {
  const tones = {
    teal: "text-teal-700 bg-teal-100",
    amber: "text-amber-700 bg-amber-100",
    pink: "text-pink-700 bg-pink-100",
    indigo: "text-indigo-700 bg-indigo-100",
    red: "text-red-700 bg-red-100",
  };
  return (
    <div
      className={`relative text-left bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-2.5 w-full h-full transition-colors ${
        onClick ? "hover:border-gray-400 hover:bg-gray-100" : ""
      }`}
    >
      <button type="button" onClick={onClick} disabled={!onClick} className={`flex items-center gap-2.5 flex-1 min-w-0 text-left ${onClick ? "cursor-pointer" : "cursor-default"}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold text-gray-900 leading-none">{value.toLocaleString("id-ID")}{unit ? ` ${unit}` : ""}</div>
          <div className="text-[10px] text-gray-700 mt-1 truncate">{label}{subtitle ? ` • ${subtitle}` : ""}</div>
        </div>
      </button>
      {exportRows && (
        <ExportButton small onClick={() => exportRowsToXlsx(exportRows, exportFilename || "export", exportColumns)} />
      )}
    </div>
  );
}

function Panel({ title, height, children, exportData, exportFilename }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3.5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] text-gray-500">{title}</div>
        {exportData && exportData.length > 0 && (
          <ExportButton small onClick={() => exportRowsToXlsx(exportData, exportFilename || "chart-data")} />
        )}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function FlaggedTable({ rows, columns, exportFilename }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows.slice(0, 200) : rows.slice(0, 8);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden w-full min-w-0 h-full flex flex-col">
      {rows.length > 0 && (
        <div className="flex justify-end px-2.5 pt-2">
          <ExportButton small onClick={() => exportRowsToXlsx(rows, exportFilename || "detail", columns)} />
        </div>
      )}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              {columns.map((c) => <th key={c.key} className="text-left px-2.5 py-2 font-medium whitespace-nowrap">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-b border-gray-200/60 text-gray-700">
                {columns.map((c) => (
                  <td key={c.key} className="px-2.5 py-2 whitespace-nowrap">{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && (
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-500 hover:bg-gray-100 border-t border-gray-200 mt-auto">
          {open ? <>Tutup <ChevronUp className="w-3 h-3" /></> : <>Lihat semua ({rows.length}) <ChevronDown className="w-3 h-3" /></>}
        </button>
      )}
    </div>
  );
}

function Leaderboard({ title, data, tone, onItemClick, exportFilename }) {
  const tones = { teal: "text-teal-700", indigo: "text-indigo-700" };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3.5 h-full">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <Trophy className="w-3.5 h-3.5" /> {title}
        </div>
        {data.length > 0 && (
          <ExportButton small onClick={() => exportRowsToXlsx(data, exportFilename || "leaderboard")} />
        )}
      </div>
      {data.length === 0 ? (
        <div className="text-xs text-gray-400">Tidak ada anomali</div>
      ) : (
        <div className="space-y-2">
          {data.map((d, i) => (
            <button
              type="button"
              key={i}
              onClick={() => onItemClick && onItemClick(d)}
              className="w-full flex items-center justify-between text-xs text-left hover:bg-gray-100 rounded px-1 -mx-1 py-0.5"
            >
              <span className="text-gray-700 truncate pr-2 min-w-0">
                {i + 1}. {d.name}
                {d.role && <span className="text-gray-500"> — {d.role}</span>}
                {(d.region || d.cluster) && (
                  <span className="text-gray-400"> ({[d.region, d.cluster].filter(Boolean).join(" / ")})</span>
                )}
              </span>
              <span className={`font-semibold ${tones[tone]} flex-shrink-0`}>{d.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Glossary ─────────────────────────

function GlossaryModal({ open, onClose }) {
  if (!open) return null;
  const Section = ({ title, children }) => (
    <div className="mb-5">
      <div className="text-sm font-bold text-gray-900 mb-1.5">{title}</div>
      <div className="text-[13px] text-gray-700 leading-relaxed space-y-2">{children}</div>
    </div>
  );
  const Term = ({ name, children }) => (
    <div>
      <span className="font-semibold text-gray-900">{name}</span> — {children}
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white border border-gray-300 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-900">📖 Kamus Istilah Dashboard</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">

          <Section title="Sumber Data">
            <Term name="Timestamp (Journey)">data check-in lapangan, bisa beberapa kali per hari — dipakai buat ngukur pola kunjungan/zona waktu.</Term>
            <Term name="Absensi (Attendance)">data 1x Check-in + 1x Check-out per shift — dipakai buat ngukur durasi kerja & lokasi awal/akhir shift.</Term>
          </Section>

          <Section title="Tipe Promotor">
            <Term name="In Store Promotor">promotor yang kerja di dalam toko/outlet.</Term>
            <Term name="Out Store Promotor">promotor yang kerja di luar toko (lapangan/kanvasing).</Term>
          </Section>

          <Section title="6 Kategori Anomali">
            <Term name="1. Zona Waktu (< 3)">
              Tiap check-in Timestamp dikelompokkan ke 1 dari 5 zona jam (Pagi 07–10, Siang 11–14, Sore 15–18, Malam 1 19–22, Malam 2 23–00).
              <b> Comply</b> per hari = tercapai minimal 3 zona BERTURUT-TURUT tanpa lompat (boleh mulai dari zona mana saja). Contoh: Pagi+Siang+Sore lolos, tapi Pagi+Sore+Malam 1 GAGAL (lompat Siang) walau sama-sama 3 zona berbeda. Kategori ini murni soal pola waktu — jarak GPS tidak jadi parameter.
              Per orang diklasifikasi berdasarkan persentase hari comply: <i>Comply</i> (≥50% hari kerjanya comply) / <i>Not Comply</i> (&lt;50%).
            </Term>
            <Term name="2. GPS Identik">
              2+ check-in Timestamp di hari yang sama dengan koordinat lat/lon PERSIS SAMA (exact match, tanpa pembulatan).
            </Term>
            <Term name="3. GPS Jauh dari Toko">
              Jarak Haversine dari check-in (Timestamp) atau check-in/check-out (Absensi) ke koordinat Outlet, dibanding threshold GPS (m) yang bisa diatur.
              Koordinat Outlet didapat dari rantai Employee → Sales Code → OM → Outlet Code → Outlet Master.
              <b> Khusus Out Store Promotor: kategori ini tidak ditampilkan di breakdown Total Anomali.</b>
            </Term>
            <Term name="4. GPS Toko N/A">
              Rantai pencarian koordinat toko (lihat #3) GAGAL — bukan berarti GPS-nya jauh, datanya memang belum lengkap.
              Dihitung sebagai jumlah TOKO unik, bukan jumlah promotor.
            </Term>
            <Term name="5. Status Non-Active">
              HANYA di-flag kalau tanggal aktivitas &gt; End Date (resign) — dibuktikan lewat data. Kalau End Date tidak tersedia, TIDAK di-flag.
            </Term>
            <Term name="6. Durasi Bermasalah">
              Durasi = jam Check-out − jam Check-in (Absensi). Di-flag kalau salah satu dari 3 kondisi ini kena:
              <ul className="list-disc list-inside ml-2 mt-1">
                <li><b>Pendek</b>: durasi &lt; threshold "Pendek (jam)" — default 4 jam</li>
                <li><b>Panjang</b>: durasi &gt; threshold "Panjang (jam)" — default 14 jam</li>
                <li><b>No-Checkout</b>: jam Check-out kosong</li>
              </ul>
            </Term>
          </Section>

          <Section title="Total Anomali (Terindikasi)">
            <div>Promotor dengan <b>minimal 3 kejadian anomali</b>, gabungan dari ke-6 kategori di atas &amp; kedua sumber data.</div>
            <div>Kenapa 3, bukan 1: kalau cuma butuh 1 kejadian, hampir semua orang bakal kena di periode data yang panjang (1x kesenggol itu wajar). Threshold 3 lebih tajam — cuma nangkep pola berulang.</div>
          </Section>

          <Section title="Selisih Cakupan: Timestamp & Absensi vs Total Promotor">
            <Term name="Selisih total Timestamp">jumlah karyawan yang HANYA ada di Absensi (tidak tercatat di Timestamp).</Term>
            <Term name="Selisih total Absensi">jumlah karyawan yang HANYA ada di Timestamp (tidak tercatat di Absensi).</Term>
          </Section>

          <Section title="Struktur Wilayah">
            <Term name="Region">wilayah besar (contoh: BALI NUSRA). Dropdown filter cuma nampilin nilai HURUF BESAR SEMUA — varian typo/tidak konsisten otomatis disaring.</Term>
            <Term name="Cluster">sub-wilayah di dalam 1 Region.</Term>
          </Section>

          <Section title="Catatan">
            <div>Semua anomali di dashboard ini adalah titik awal investigasi, bukan vonis final. Perlu verifikasi manual sebelum jadi dasar keputusan.</div>
          </Section>

        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Region -> Cluster drill-down ─────────────────────────

function RegionDrillModal({ open, title, rows, onClose, onDrillToCluster }) {
  const [expandedRegion, setExpandedRegion] = useState(null);

  const grouped = useMemo(() => {
    if (!rows) return [];
    const byRegion = new Map();
    rows.forEach((r) => {
      const region = r.region || "-";
      const cluster = r.cluster || "-";
      if (!byRegion.has(region)) byRegion.set(region, { people: new Set(), clusters: new Map() });
      const entry = byRegion.get(region);
      entry.people.add(r.employee_id);
      if (!entry.clusters.has(cluster)) entry.clusters.set(cluster, new Set());
      entry.clusters.get(cluster).add(r.employee_id);
    });
    return [...byRegion.entries()]
      .map(([region, data]) => ({
        region,
        count: data.people.size,
        clusters: [...data.clusters.entries()]
          .map(([cluster, ids]) => ({ cluster, count: ids.size }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  React.useEffect(() => { setExpandedRegion(null); }, [open, rows]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white border border-gray-300 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-2 py-2">
          {grouped.length === 0 && <div className="text-sm text-gray-400 text-center py-8">Tidak ada data</div>}
          {grouped.map((g) => (
            <div key={g.region} className="mb-1">
              <button
                onClick={() => setExpandedRegion(expandedRegion === g.region ? null : g.region)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left"
              >
                <span className="text-sm font-medium text-gray-800">{g.region}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-teal-700">{g.count.toLocaleString("id-ID")} promotor</span>
                  {expandedRegion === g.region ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </span>
              </button>
              {expandedRegion === g.region && (
                <div className="pl-4 pb-1">
                  {g.clusters.map((c) => (
                    <button
                      key={c.cluster}
                      onClick={() => onDrillToCluster(g.region, c.cluster)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-teal-50 text-left"
                    >
                      <span className="text-[13px] text-gray-600">{c.cluster}</span>
                      <span className="text-[13px] font-medium text-gray-700">{c.count.toLocaleString("id-ID")} promotor</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

function DetailModal({ detail, onClose }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");

  React.useEffect(() => {
    setPage(1);
    setQ("");
  }, [detail]);

  const filteredRows = useMemo(() => {
    if (!detail) return [];
    let rows = detail.rows;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((r) =>
        detail.columns.some((c) => String(c.render ? c.render(r) : (r[c.key] ?? "")).toLowerCase().includes(needle))
      );
    }
    // Default: urut by Nama (A-Z), lalu Tanggal — biar konsisten & gampang dicari,
    // bukan sekadar urutan mentah sesuai file sumber.
    return [...rows].sort((a, b) => {
      const nameA = String(a.employee_name ?? "").toLowerCase();
      const nameB = String(b.employee_name ?? "").toLowerCase();
      if (nameA !== nameB) return nameA < nameB ? -1 : 1;
      const dateA = String(a.date ?? "");
      const dateB = String(b.date ?? "");
      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    });
  }, [detail, q]);

  if (!detail) return null;

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const shown = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white border border-gray-300 rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{detail.title}</div>
            <div className="text-[11px] text-gray-500">{filteredRows.length.toLocaleString("id-ID")} baris</div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {filteredRows.length > 0 && (
              <ExportButton small onClick={() => exportRowsToXlsx(filteredRows, detail.title, detail.columns)} />
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/(Comply|Campuran)/.test(detail.title) && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800">
            <ul className="list-disc list-inside space-y-0.5">
              <li>Comply/Not Comply butuh 3 zona berturut-turut tanpa lompat (bukan sekadar 3 zona beda)</li>
              <li>Jarak GPS tidak menjadi parameter perhitungan</li>
            </ul>
          </div>
        )}

        <div className="px-4 pt-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter (nama, role, tanggal, ...)"
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400"
          />
        </div>

        <div className="overflow-auto p-4 flex-1">
          {shown.length === 0 ? (
            <div className="text-xs text-gray-500">Tidak ada data yang cocok.</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  {detail.columns.map((c) => <th key={c.key} className="text-left px-2.5 py-2 font-medium whitespace-nowrap">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-200/60 ${detail.title.includes("per Kategori") && i < 3 ? "text-red-700 font-semibold" : "text-gray-700"}`}>
                    {detail.columns.map((c) => (
                      <td key={c.key} className="px-2.5 py-2 whitespace-nowrap">{c.render ? c.render(r) : r[c.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 text-xs text-gray-500">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="disabled:opacity-30 hover:text-gray-800"
            >
              &lsaquo; Sebelumnya
            </button>
            <span>Halaman {safePage} dari {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="disabled:opacity-30 hover:text-gray-800"
            >
              Selanjutnya &rsaquo;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Upload Page ─────────────────────────

function UploadPage({ fileNames, onFiles, onGoDashboard, canGo }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold text-teal-700 mb-2">Upload data hasil merge</div>
        <UploadBox onFiles={onFiles} label="Hasil dari Data Merger (Absensi + Timestamp digabung)" fileNames={fileNames} />
      </div>
      <button
        onClick={onGoDashboard}
        disabled={!canGo}
        className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-medium py-3 rounded-lg transition-colors"
      >
        Lihat Dashboard <ArrowRight className="w-4 h-4" />
      </button>
      {!canGo && <p className="text-center text-xs text-gray-400">Upload file hasil merge untuk lanjut</p>}
    </div>
  );
}

// ───────────────────────── Overview banner ─────────────────────────

function OverviewBanner({ absensiResult, timestampResult, onDetail }) {
  const [regionDrill, setRegionDrill] = useState(null); // { title, rows } | null

  const absensiTotal = absensiResult?.flagged.length ?? 0;
  const timestampTotal = timestampResult?.flagged.length ?? 0;
  const absensiRate = absensiResult ? ((absensiTotal / absensiResult.total) * 100).toFixed(1) : "-";
  const timestampRate = timestampResult ? ((timestampTotal / timestampResult.total) * 100).toFixed(1) : "-";

  const Num = ({ value, className, onClick, children }) => (
    <button type="button" onClick={onClick} disabled={!onClick} className={`text-left ${onClick ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}>
      <div className={className}>{value}</div>
      {children}
    </button>
  );

  // Semua perhitungan berat di bawah ini di-bungkus 1 useMemo — dihitung SEKALI
  // tiap kali timestampResult/absensiResult berubah, BUKAN diulang tiap render.
  // Ini krusial buat dataset besar (ratusan ribu baris) — sebelumnya beberapa
  // fungsi (combinedFlagged/allRecords) di-panggil ulang belasan kali per
  // render, masing-masing O(n), yang bikin browser berat/macet.
  const computed = useMemo(() => {
    const tsIds = timestampResult?.coverage.employeeIds || new Set();
    const abIds = absensiResult?.coverage.employeeIds || new Set();
    const totalPromotorAll = new Set([...tsIds, ...abIds]).size;
    const timestampPromotorAll = tsIds.size;
    const absensiPromotorAll = abIds.size;

    const combinedFlagged = [
      ...(timestampResult?.flagged || []).map((r) => ({ ...r, _source: "Timestamp" })),
      ...(absensiResult?.flagged || []).map((r) => ({ ...r, _source: "Absensi" })),
    ];
    const allRecords = [
      ...(timestampResult?.all || []).map((r) => ({ ...r, _source: "Timestamp" })),
      ...(absensiResult?.all || []).map((r) => ({ ...r, _source: "Absensi" })),
    ];

    const inStore = new Set(allRecords.filter((r) => r.promotorType === "In Store Promotor").map((r) => r.employee_id).filter(Boolean)).size;
    const outStore = new Set(allRecords.filter((r) => r.promotorType === "Out Store Promotor").map((r) => r.employee_id).filter(Boolean)).size;

    const onlyInTimestamp = new Set([...tsIds].filter((id) => !abIds.has(id)));
    const onlyInAbsensi = new Set([...abIds].filter((id) => !tsIds.has(id)));

    const ANOMALI_MIN_COUNT = 3;
    const flaggedCountByEmployee = new Map();
    combinedFlagged.forEach((r) => {
      if (!r.employee_id) return;
      flaggedCountByEmployee.set(r.employee_id, (flaggedCountByEmployee.get(r.employee_id) || 0) + 1);
    });
    const anomaliQualifiedIds = new Set(
      [...flaggedCountByEmployee.entries()].filter(([, count]) => count >= ANOMALI_MIN_COUNT).map(([id]) => id)
    );
    const anomaliInStoreCount = new Set(combinedFlagged.filter((r) => r.promotorType === "In Store Promotor" && anomaliQualifiedIds.has(r.employee_id)).map((r) => r.employee_id)).size;
    const anomaliOutStoreCount = new Set(combinedFlagged.filter((r) => r.promotorType === "Out Store Promotor" && anomaliQualifiedIds.has(r.employee_id)).map((r) => r.employee_id)).size;
    const pctIn = inStore ? ((anomaliInStoreCount / inStore) * 100).toFixed(1).replace(".", ",") : "0,0";
    const pctOut = outStore ? ((anomaliOutStoreCount / outStore) * 100).toFixed(1).replace(".", ",") : "0,0";

    // Per-promotor breakdown, dipakai saat klik angka Total Anomali.
    const buildAnomaliDetail = (promotorType) => {
      const map = new Map();
      combinedFlagged.forEach((r) => {
        if (!r.employee_id || !anomaliQualifiedIds.has(r.employee_id) || r.promotorType !== promotorType) return;
        const entry = map.get(r.employee_id) || {
          employee_name: r.employee_name, position: r.position,
          total: 0, zona: 0, gpsIdentik: 0, gpsJauh: 0, gpsNA: 0, status: 0, durasi: 0,
        };
        entry.total++;
        if (r.zoneNotCompliant) entry.zona++;
        if (r.gpsIdentical) entry.gpsIdentik++;
        if (r.farFromStore) entry.gpsJauh++;
        if (r.noOutletData) entry.gpsNA++;
        if (r.statusAnomaly) entry.status++;
        if (r.durationIssue) entry.durasi++;
        map.set(r.employee_id, entry);
      });
      return [...map.values()].sort((a, b) => b.total - a.total);
    };

    const CATEGORY_DEFS = [
      { key: "zona", label: "Zona Waktu (< 3)" },
      { key: "gpsNA", label: "GPS Toko N/A" },
      { key: "durasi", label: "Durasi Bermasalah" },
    ];
    const buildCategorySummary = (promotorType) => {
      const perPerson = buildAnomaliDetail(promotorType);
      const totalPeople = perPerson.length;
      return CATEGORY_DEFS.map((c) => {
        const affected = perPerson.filter((p) => p[c.key] > 0).length;
        const totalKejadian = perPerson.reduce((sum, p) => sum + p[c.key], 0);
        const persen = totalPeople ? ((affected / totalPeople) * 100).toFixed(1).replace(".", ",") : "0,0";
        return { kategori: c.label, jumlahPromotor: affected, persen: `${persen}%`, totalKejadian };
      }).sort((a, b) => b.jumlahPromotor - a.jumlahPromotor);
    };
    const categorySummaryColumns = [
      { key: "kategori", label: "Kategori" },
      { key: "jumlahPromotor", label: "Jumlah Promotor", render: (r) => r.jumlahPromotor.toLocaleString("id-ID") },
      { key: "persen", label: "Persentase" },
      { key: "totalKejadian", label: "Total Kejadian", render: (r) => r.totalKejadian.toLocaleString("id-ID") },
    ];

    // Zona Waktu — klasifikasi promotor Timestamp berdasarkan MAYORITAS hari
    // (bukan lagi "selalu comply setiap hari tanpa kecuali"): >=50% hari-nya
    // comply -> Comply; <50% -> Not Comply.
    const zonePattern = new Map();
    (timestampResult?.all || []).forEach((v) => {
      if (!v.employee_id) return;
      const e = zonePattern.get(v.employee_id) || { totalDays: 0, complyDays: 0 };
      e.totalDays++;
      if (!v.zoneNotCompliant) e.complyDays++;
      zonePattern.set(v.employee_id, e);
    });
    let zoneComplyIds = [], zoneNotComplyIds = [];
    zonePattern.forEach((e, id) => {
      const pct = e.totalDays ? e.complyDays / e.totalDays : 0;
      if (pct >= 0.5) zoneComplyIds.push(id); else zoneNotComplyIds.push(id);
    });
    const zoneAffectedCount = zoneNotComplyIds.length;
    const byZoneIds = (ids) => { const s = new Set(ids); return (timestampResult?.all || []).filter((v) => s.has(v.employee_id)); };

    const gpsIdenticalCount = timestampResult?.gpsIdenticalPeople ?? 0;

    const tsFarIds = new Set((timestampResult?.flagged || []).filter((v) => v.farFromStore).map((v) => v.employee_id).filter(Boolean));
    const abFarIds = new Set((absensiResult?.flagged || []).filter((s) => s.farFromStore).map((s) => s.employee_id).filter(Boolean));
    const gpsFarCombinedCount = new Set([...tsFarIds, ...abFarIds]).size;

    const tsTokoNA = new Set((timestampResult?.flagged || []).filter((v) => v.noOutletData).map((v) => v.rawOutletCode).filter(Boolean));
    const abTokoNA = new Set((absensiResult?.flagged || []).filter((s) => s.noOutletData).map((s) => s.rawOutletCode).filter(Boolean));
    const tokoNACount = new Set([...tsTokoNA, ...abTokoNA]).size;
    const totalTokoCount = new Set([
      ...(timestampResult?.all || []).map((v) => v.rawOutletCode),
      ...(absensiResult?.all || []).map((s) => s.rawOutletCode),
    ].filter(Boolean)).size;

    const tsStatusIds = new Set((timestampResult?.flagged || []).filter((v) => v.statusAnomaly).map((v) => v.employee_id).filter(Boolean));
    const abStatusIds = new Set((absensiResult?.flagged || []).filter((s) => s.statusAnomaly).map((s) => s.employee_id).filter(Boolean));
    const statusCombinedCount = new Set([...tsStatusIds, ...abStatusIds]).size;

    const durasiCount = new Set((absensiResult?.flagged || []).filter((s) => s.durationIssue).map((s) => s.employee_id).filter(Boolean)).size;

    return {
      totalPromotorAll, timestampPromotorAll, absensiPromotorAll,
      combinedFlagged, inStore, outStore, onlyInTimestamp, onlyInAbsensi,
      anomaliInStoreCount, anomaliOutStoreCount, pctIn, pctOut,
      buildCategorySummary, categorySummaryColumns,
      zoneComplyIds, zoneNotComplyIds, zoneAffectedCount, byZoneIds,
      gpsIdenticalCount, gpsFarCombinedCount, tokoNACount, totalTokoCount,
      statusCombinedCount, durasiCount,
    };
  }, [timestampResult, absensiResult]);

  const {
    totalPromotorAll, timestampPromotorAll, absensiPromotorAll,
    combinedFlagged, inStore, outStore, onlyInTimestamp, onlyInAbsensi,
    anomaliInStoreCount, anomaliOutStoreCount, pctIn, pctOut,
    buildCategorySummary, categorySummaryColumns,
    zoneComplyIds, zoneNotComplyIds, zoneAffectedCount, byZoneIds,
    gpsIdenticalCount, gpsFarCombinedCount, tokoNACount, totalTokoCount,
    statusCombinedCount, durasiCount,
  } = computed;

  const mixedColumns = [
    { key: "_source", label: "Sumber" },
    { key: "date", label: "Tgl" },
    { key: "employee_name", label: "Nama" },
    { key: "region", label: "Region" },
    { key: "cluster", label: "Cluster" },
    { key: "position", label: "Role" },
    { key: "flags", label: "Flag", render: (r) => (r._source === "Timestamp" ? describeFlagsTimestamp(r) : describeFlagsAbsensi(r)) },
  ];

  return (
    <div className="bg-gradient-to-r from-emerald-50 to-white border border-emerald-200 rounded-xl p-5 mb-4">
      <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold mb-3">
        Overview Total — Timestamp (Journey) + Absensi (Attendance)
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:divide-x md:divide-emerald-200/50">
        <div className="md:pr-6">
          {/* 1. Total Promotor */}
          <div className="text-base font-bold text-gray-900 mb-1.5">Total Promotor</div>
          <div className="text-3xl sm:text-4xl font-bold text-gray-900 leading-none">{(inStore + outStore).toLocaleString("id-ID")}</div>
          <div className="text-xs text-gray-700 mt-1.5">In Store: {inStore.toLocaleString("id-ID")} &middot; Out Store: {outStore.toLocaleString("id-ID")}</div>

          {/* 2. Total Anomali (Terindikasi) */}
          <div className="mt-4 pt-4 border-t border-emerald-200/50">
            <div className="text-base font-bold text-gray-900 mb-1">Total Anomali (Terindikasi)</div>
            <div className="text-[11px] text-gray-500 mb-2">Promotor dengan minimal 3 kejadian anomali (gabungan 6 kategori, Timestamp &amp; Absensi).</div>
            <div className="grid grid-cols-2 gap-4">
              <Num
                value={<>{anomaliInStoreCount.toLocaleString("id-ID")}/{inStore.toLocaleString("id-ID")} <span className="text-sm">({pctIn}%)</span></>}
                className="text-2xl font-bold text-amber-700 leading-none"
                onClick={() => onDetail("Total Anomali — In Store Promotor (per Kategori)", buildCategorySummary("In Store Promotor"), categorySummaryColumns)}
              >
                <div className="text-[11px] text-gray-700 mt-1">In Store Promotor</div>
              </Num>
              <Num
                value={<>{anomaliOutStoreCount.toLocaleString("id-ID")}/{outStore.toLocaleString("id-ID")} <span className="text-sm">({pctOut}%)</span></>}
                className="text-2xl font-bold text-fuchsia-700 leading-none"
                onClick={() => onDetail("Total Anomali — Out Store Promotor (per Kategori)", buildCategorySummary("Out Store Promotor"), categorySummaryColumns)}
              >
                <div className="text-[11px] text-gray-700 mt-1">Out Store Promotor</div>
              </Num>
            </div>
          </div>
        </div>

        <div className="md:pl-6">
          {/* 3. Rincian per Kategori Anomali */}
          <div className="text-base font-bold text-gray-900 mb-2">Rincian per Kategori Anomali</div>
          <ol className="text-sm text-gray-800 space-y-1.5 list-decimal list-inside">
            <li>
              <span className="font-semibold">Zona Waktu — Not Comply (&lt;50% hari)</span>{" "}
              <span className="text-[11px] text-gray-500">(Timestamp)</span>:{" "}
              <b>{zoneAffectedCount.toLocaleString("id-ID")}</b> dari {timestampPromotorAll.toLocaleString("id-ID")} promotor
            </li>
            <li>
              <span className="font-semibold">GPS Toko N/A</span>{" "}
              <span className="text-[11px] text-gray-500">(Timestamp &amp; Absensi)</span>:{" "}
              <b>{tokoNACount.toLocaleString("id-ID")}</b> dari {totalTokoCount.toLocaleString("id-ID")} toko
            </li>
            <li>
              <span className="font-semibold">Durasi Bermasalah</span>{" "}
              <span className="text-[11px] text-gray-500">(Absensi)</span>:{" "}
              <b>{durasiCount.toLocaleString("id-ID")}</b> dari {absensiPromotorAll.toLocaleString("id-ID")} promotor
            </li>
          </ol>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 pt-4 border-t border-emerald-200/50 md:divide-x md:divide-emerald-200/50">
        <div className="md:pr-6 space-y-2.5">
          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Periode Timestamp</div>
            {timestampResult ? (
              <div className="text-sm text-gray-800">
                <span className="font-bold text-gray-900">{timestampResult.coverage.uniqueEmployees.toLocaleString("id-ID")} karyawan</span>
                {" "}&middot; {formatDateShort(timestampResult.coverage.dateMin)} s.d. {formatDateShort(timestampResult.coverage.dateMax)}
              </div>
            ) : <div className="text-sm text-gray-400">Data tidak tersedia</div>}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Periode Absensi</div>
            {absensiResult ? (
              <div className="text-sm text-gray-800">
                <span className="font-bold text-gray-900">{absensiResult.coverage.uniqueEmployees.toLocaleString("id-ID")} karyawan</span>
                {" "}&middot; {formatDateShort(absensiResult.coverage.dateMin)} s.d. {formatDateShort(absensiResult.coverage.dateMax)}
              </div>
            ) : <div className="text-sm text-gray-400">Data tidak tersedia</div>}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Selisih Cakupan: Timestamp & Absensi vs Total Promotor</div>
            {timestampResult && absensiResult ? (
              <ul className="text-sm text-gray-800 list-disc list-inside space-y-1">
                <li>Selisih total Timestamp: <span className="font-bold text-gray-900">{onlyInAbsensi.size.toLocaleString("id-ID")} karyawan</span></li>
                <li>Selisih total Absensi: <span className="font-bold text-gray-900">{onlyInTimestamp.size.toLocaleString("id-ID")} karyawan</span></li>
              </ul>
            ) : <div className="text-sm text-gray-400">Perlu kedua dataset untuk dibandingkan</div>}
          </div>
        </div>

        <div className="md:pl-6">
          {timestampResult && (
            <>
              <div className="text-sm font-bold text-gray-900 mb-1">Detail Zona Waktu (Timestamp)</div>
              <div className="text-[11px] text-gray-500 mb-2">Klik angka untuk melihat daftar promotor.</div>
              <div className="grid grid-cols-2 gap-3">
                <Num
                  value={zoneComplyIds.length.toLocaleString("id-ID")}
                  className="text-lg font-bold text-emerald-700 leading-none"
                  onClick={() => setRegionDrill({ title: "Comply (≥50% hari kerja) — per Region", rows: byZoneIds(zoneComplyIds) })}
                >
                  <div className="text-[10px] text-gray-700 mt-1">Comply (≥50% hari)</div>
                </Num>
                <Num
                  value={zoneNotComplyIds.length.toLocaleString("id-ID")}
                  className="text-lg font-bold text-red-700 leading-none"
                  onClick={() => setRegionDrill({ title: "Not Comply (<50% hari kerja) — per Region", rows: byZoneIds(zoneNotComplyIds) })}
                >
                  <div className="text-[10px] text-gray-700 mt-1">Not Comply (&lt;50% hari)</div>
                </Num>
              </div>
              <ul className="text-[11px] text-gray-600 mt-2 list-disc list-inside">
                <li>Comply/Not Comply butuh 3 zona berturut-turut tanpa lompat (bukan sekadar 3 zona beda)</li>
                <li>Jarak GPS tidak menjadi parameter perhitungan</li>
                <li>Per orang: dilihat dari persentase hari comply — ≥50% hari comply → Comply, &lt;50% → Not Comply</li>
              </ul>
            </>
          )}
        </div>
      </div>

      <RegionDrillModal
        open={!!regionDrill}
        title={regionDrill?.title}
        rows={regionDrill?.rows}
        onClose={() => setRegionDrill(null)}
        onDrillToCluster={(region, cluster) => {
          if (!regionDrill) return;
          const filtered = (regionDrill.rows || []).filter((r) => (r.region || "-") === region && (r.cluster || "-") === cluster);
          const baseTitle = regionDrill.title.split(" — ")[0];
          setRegionDrill(null);
          onDetail(`${baseTitle} — ${region} / ${cluster}`, filtered, TIMESTAMP_COLUMNS);
        }}
      />
    </div>
  );
}

// ───────────────────────── Dashboard Page ─────────────────────────

// Bangun ulang semua agregat (total, byDate, topOffenders, anomalyCounts)
// dari sebuah result (Timestamp/Absensi) tapi DIBATASI ke 1 tipe promotor
// aja. `flagged` di result asli dan `all` itu row yang SAMA (reference sama
// persis), jadi cukup pakai Set buat cek "row ini termasuk flagged apa
// nggak" tanpa perlu re-derive logic isFlagged dari awal.
function computeTypeView(result, promotorType, isTimestamp) {
  if (!result) return null;
  const all = (result.all || []).filter((r) => r.promotorType === promotorType);
  const flaggedSet = new Set(result.flagged);
  const flagged = all.filter((r) => flaggedSet.has(r));
  const total = all.length;

  const byDateMap = {};
  all.forEach((r) => {
    byDateMap[r.date] = byDateMap[r.date] || { date: r.date, anomali: 0, total: 0 };
    byDateMap[r.date].total++;
    if (flaggedSet.has(r)) byDateMap[r.date].anomali++;
  });
  const byDate = Object.values(byDateMap).sort((a, b) => (a.date > b.date ? 1 : -1));
  const topOffenders = topNWithRole(flagged, (r) => r.employee_name, (r) => r.position, 5, (r) => r.region, (r) => r.cluster);

  const uniquePeople = (pred) => new Set(flagged.filter(pred).map((r) => r.employee_id).filter(Boolean)).size;
  const uniqueOutlets = (pred) => new Set(flagged.filter(pred).map((r) => r.rawOutletCode).filter(Boolean)).size;
  const uniqueCoverage = new Set(all.map((r) => r.employee_id).filter(Boolean)).size;

  if (isTimestamp) {
    return {
      total, all, flagged, byDate, topOffenders, uniqueCoverage,
      anomalyCounts: {
        zone: flagged.filter((v) => v.zoneNotCompliant).length,
        gpsIdentical: flagged.filter((v) => v.gpsIdentical).length,
        gpsIdenticalPeople: new Set(flagged.filter((v) => v.gpsIdentical).map((v) => v.employee_id)).size,
        status: uniquePeople((v) => v.statusAnomaly),
        farFromStore: uniquePeople((v) => v.farFromStore),
        noOutletData: uniqueOutlets((v) => v.noOutletData),
      },
    };
  }
  return {
    total, all, flagged, byDate, topOffenders, uniqueCoverage,
    anomalyCounts: {
      gpsFar: uniquePeople((s) => s.farFromStore),
      gpsNoOutlet: uniqueOutlets((s) => s.noOutletData),
      status: uniquePeople((s) => s.statusAnomaly),
      duration: flagged.filter((s) => s.durationIssue).length,
    },
  };
}

function DashboardPage(props) {
  const {
    timestampData,
    absensiData, moveThresholdM, setMoveThresholdM, shortHr, setShortHr, longHr, setLongHr,
  } = props;

  const [detail, setDetail] = useState(null);
  const openDetail = useCallback((title, rows, columns) => setDetail({ title, rows, columns }), []);
  const closeDetail = useCallback(() => setDetail(null), []);

  const timestampResult = useMemo(() => timestampData ? processTimestamp(timestampData, moveThresholdM) : null, [timestampData, moveThresholdM]);
  const absensiResult = useMemo(() => absensiData ? processAbsensi(absensiData, moveThresholdM, shortHr, longHr) : null, [absensiData, moveThresholdM, shortHr, longHr]);
  const insights = useMemo(() => computeInsights(timestampResult, absensiResult), [timestampResult, absensiResult]);

  // Views baru: dipecah per TIPE PROMOTOR (bukan per sumber data lagi).
  // Masing-masing tetap punya sub-bagian Timestamp & Absensi di dalamnya,
  // karena kategori anomalinya emang beda per sumber — cuma level
  // pengelompokan PALING LUAR yang sekarang Tipe, bukan Sumber.
  const inStoreTs = useMemo(() => computeTypeView(timestampResult, "In Store Promotor", true), [timestampResult]);
  const inStoreAb = useMemo(() => computeTypeView(absensiResult, "In Store Promotor", false), [absensiResult]);
  const outStoreTs = useMemo(() => computeTypeView(timestampResult, "Out Store Promotor", true), [timestampResult]);
  const outStoreAb = useMemo(() => computeTypeView(absensiResult, "Out Store Promotor", false), [absensiResult]);

  return (
    <div>
      <OverviewBanner absensiResult={absensiResult} timestampResult={timestampResult} onDetail={openDetail} />
      <InsightsCard insights={insights} />

      {/* Threshold GPS/Durasi — kontrol GLOBAL (dipakai kedua tipe promotor),
          jadi cuma 1 instance di sini, bukan diulang per kolom. */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3 items-center text-[11px] text-gray-500">
        <span className="font-semibold text-gray-700">Threshold:</span>
        <label className="flex items-center gap-1.5">Pendek &lt; (jam):
          <input type="number" value={shortHr} onChange={(e) => setShortHr(parseFloat(e.target.value) || 0)}
            className="w-12 bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-gray-800" />
        </label>
        <label className="flex items-center gap-1.5">Panjang &gt; (jam):
          <input type="number" value={longHr} onChange={(e) => setLongHr(parseFloat(e.target.value) || 0)}
            className="w-12 bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-gray-800" />
        </label>
        <label className="flex items-center gap-1.5">GPS (m):
          <input type="number" step="10" value={moveThresholdM} onChange={(e) => setMoveThresholdM(parseFloat(e.target.value) || 0)}
            className="w-16 bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-gray-800" />
        </label>
        <span className="text-gray-400 italic">Berlaku buat kedua tipe promotor (In Store &amp; Out Store), Timestamp &amp; Absensi.</span>
      </div>

      {/* ═══════ GRID A: bagian Timestamp (Journey) tiap tipe ═══════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 min-w-0 mb-5">

        {/* ── IN STORE PROMOTOR — Timestamp ── */}
        <div className="md:col-start-1 md:row-start-1 mb-3 md:mb-0">
          <div className="text-base font-bold text-amber-700 mb-1">In Store Promotor</div>
          <div className="text-base font-bold text-gray-900 mb-0.5">Timestamp (Journey)</div>
          <div className="text-[11px] text-gray-500 mb-2">{inStoreTs?.uniqueCoverage.toLocaleString("id-ID") ?? 0} promotor, {inStoreTs?.total.toLocaleString("id-ID") ?? 0} hari-kerja</div>
          {inStoreTs ? (
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard icon={AlertTriangle} label="#Absensi <3x/hari" value={inStoreTs.anomalyCounts.zone} tone="indigo"
                onClick={() => openDetail("In Store — Timestamp — Absensi <3x/hari", inStoreTs.flagged.filter((v) => v.zoneNotCompliant), TIMESTAMP_COLUMNS)}
                exportRows={inStoreTs.flagged.filter((v) => v.zoneNotCompliant)} exportColumns={TIMESTAMP_COLUMNS} exportFilename="instore-timestamp-absensi-kurang-3x" />
              <StatCard icon={MapPin} label="#Toko GPS N/A" value={inStoreTs.anomalyCounts.noOutletData} tone="pink"
                onClick={() => openDetail("In Store — Timestamp — GPS Toko N/A", inStoreTs.flagged.filter((v) => v.noOutletData), TIMESTAMP_COLUMNS)}
                exportRows={inStoreTs.flagged.filter((v) => v.noOutletData)} exportColumns={TIMESTAMP_COLUMNS} exportFilename="instore-timestamp-gps-toko-na" />
            </div>
          ) : <div className="text-xs text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded-xl">Tidak ada data</div>}
        </div>

        {/* ── OUT STORE PROMOTOR — Timestamp ── */}
        <div className="md:col-start-2 md:row-start-1 mb-3 md:mb-0">
          <div className="text-base font-bold text-fuchsia-700 mb-1">Out Store Promotor</div>
          <div className="text-base font-bold text-gray-900 mb-0.5">Timestamp (Journey)</div>
          <div className="text-[11px] text-gray-500 mb-2">{outStoreTs?.uniqueCoverage.toLocaleString("id-ID") ?? 0} promotor, {outStoreTs?.total.toLocaleString("id-ID") ?? 0} hari-kerja</div>
          {outStoreTs ? (
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard icon={AlertTriangle} label="#Absensi <3x/hari" value={outStoreTs.anomalyCounts.zone} tone="indigo"
                onClick={() => openDetail("Out Store — Timestamp — Absensi <3x/hari", outStoreTs.flagged.filter((v) => v.zoneNotCompliant), TIMESTAMP_COLUMNS)}
                exportRows={outStoreTs.flagged.filter((v) => v.zoneNotCompliant)} exportColumns={TIMESTAMP_COLUMNS} exportFilename="outstore-timestamp-absensi-kurang-3x" />
              <StatCard icon={MapPin} label="#Toko GPS N/A" value={outStoreTs.anomalyCounts.noOutletData} tone="pink"
                onClick={() => openDetail("Out Store — Timestamp — GPS Toko N/A", outStoreTs.flagged.filter((v) => v.noOutletData), TIMESTAMP_COLUMNS)}
                exportRows={outStoreTs.flagged.filter((v) => v.noOutletData)} exportColumns={TIMESTAMP_COLUMNS} exportFilename="outstore-timestamp-gps-toko-na" />
            </div>
          ) : <div className="text-xs text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded-xl">Tidak ada data</div>}
        </div>

        <div className="md:col-start-1 md:row-start-2 mb-3 md:mb-0">
          <Panel title="Tren Anomali per Tanggal — In Store (Timestamp, by Activity ID)" height={160} exportData={inStoreTs?.byDate} exportFilename="instore-timestamp-tren-tanggal">
            {inStoreTs && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={inStoreTs.byDate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={9} />
                  <YAxis stroke="#6b7280" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #d1d5db", fontSize: 11 }} />
                  <Line type="monotone" dataKey="anomali" stroke="#f59e0b" strokeWidth={2}
                    dot={{ r: 3, cursor: "pointer" }}
                    activeDot={{ r: 6, cursor: "pointer", onClick: (_, p) => openDetail(`In Store — Timestamp — ${p.payload.date}`, inStoreTs.flagged.filter((v) => v.date === p.payload.date), TIMESTAMP_COLUMNS) }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>
        <div className="md:col-start-2 md:row-start-2 mb-3 md:mb-0">
          <Panel title="Tren Anomali per Tanggal — Out Store (Timestamp, by Activity ID)" height={160} exportData={outStoreTs?.byDate} exportFilename="outstore-timestamp-tren-tanggal">
            {outStoreTs && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={outStoreTs.byDate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={9} />
                  <YAxis stroke="#6b7280" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #d1d5db", fontSize: 11 }} />
                  <Line type="monotone" dataKey="anomali" stroke="#d946ef" strokeWidth={2}
                    dot={{ r: 3, cursor: "pointer" }}
                    activeDot={{ r: 6, cursor: "pointer", onClick: (_, p) => openDetail(`Out Store — Timestamp — ${p.payload.date}`, outStoreTs.flagged.filter((v) => v.date === p.payload.date), TIMESTAMP_COLUMNS) }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>

        <div className="md:col-start-1 md:row-start-3 mb-3 md:mb-0">
          <Leaderboard title="Top 5 Anomali — In Store (Timestamp)" data={inStoreTs?.topOffenders || []} tone="teal"
            onItemClick={(d) => openDetail(`In Store — Timestamp — ${d.name}`, (inStoreTs?.flagged || []).filter((v) => v.employee_name === d.name), TIMESTAMP_COLUMNS)}
            exportFilename="instore-timestamp-leaderboard" />
        </div>
        <div className="md:col-start-2 md:row-start-3 mb-3 md:mb-0">
          <Leaderboard title="Top 5 Anomali — Out Store (Timestamp)" data={outStoreTs?.topOffenders || []} tone="indigo"
            onItemClick={(d) => openDetail(`Out Store — Timestamp — ${d.name}`, (outStoreTs?.flagged || []).filter((v) => v.employee_name === d.name), TIMESTAMP_COLUMNS)}
            exportFilename="outstore-timestamp-leaderboard" />
        </div>

        <div className="md:col-start-1 md:row-start-4">
          <div className="text-[11px] text-gray-500 mb-2">Detail ter-flag In Store — Timestamp ({inStoreTs?.flagged.length ?? 0}/{inStoreTs?.total ?? 0})</div>
          <FlaggedTable rows={inStoreTs?.flagged || []} columns={TIMESTAMP_COLUMNS} exportFilename="instore-timestamp-detail-anomali" />
        </div>
        <div className="md:col-start-2 md:row-start-4">
          <div className="text-[11px] text-gray-500 mb-2">Detail ter-flag Out Store — Timestamp ({outStoreTs?.flagged.length ?? 0}/{outStoreTs?.total ?? 0})</div>
          <FlaggedTable rows={outStoreTs?.flagged || []} columns={TIMESTAMP_COLUMNS} exportFilename="outstore-timestamp-detail-anomali" />
        </div>
      </div>

      {/* ═══════ GRID B: bagian Absensi (Attendance) tiap tipe ═══════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 min-w-0 mt-10 pt-6 border-t-2 border-gray-200">

        <div className="md:col-start-1 md:row-start-1 mb-3 md:mb-0">
          <div className="text-base font-bold text-gray-900 mb-0.5">Absensi (Attendance)</div>
          <div className="text-[11px] text-gray-500 mb-2">{inStoreAb?.uniqueCoverage.toLocaleString("id-ID") ?? 0} promotor, {inStoreAb?.total.toLocaleString("id-ID") ?? 0} shift</div>
          {inStoreAb ? (
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard icon={MapPin} label="#Toko GPS N/A" value={inStoreAb.anomalyCounts.gpsNoOutlet} tone="pink"
                onClick={() => openDetail("In Store — Absensi — GPS Toko N/A", inStoreAb.flagged.filter((s) => s.noOutletData), ABSENSI_COLUMNS)}
                exportRows={inStoreAb.flagged.filter((s) => s.noOutletData)} exportColumns={ABSENSI_COLUMNS} exportFilename="instore-absensi-gps-toko-na" />
              <StatCard icon={Clock} label="Durasi Bermasalah (Pendek/Panjang/No-Checkout)" value={inStoreAb.anomalyCounts.duration} tone="indigo"
                onClick={() => openDetail("In Store — Absensi — Durasi Bermasalah", inStoreAb.flagged.filter((s) => s.durationIssue), ABSENSI_COLUMNS)}
                exportRows={inStoreAb.flagged.filter((s) => s.durationIssue)} exportColumns={ABSENSI_COLUMNS} exportFilename="instore-absensi-durasi-bermasalah" />
            </div>
          ) : <div className="text-xs text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded-xl">Tidak ada data</div>}
        </div>
        <div className="md:col-start-2 md:row-start-1 mb-3 md:mb-0">
          <div className="text-base font-bold text-gray-900 mb-0.5">Absensi (Attendance)</div>
          <div className="text-[11px] text-gray-500 mb-2">{outStoreAb?.uniqueCoverage.toLocaleString("id-ID") ?? 0} promotor, {outStoreAb?.total.toLocaleString("id-ID") ?? 0} shift</div>
          {outStoreAb ? (
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard icon={MapPin} label="#Toko GPS N/A" value={outStoreAb.anomalyCounts.gpsNoOutlet} tone="pink"
                onClick={() => openDetail("Out Store — Absensi — GPS Toko N/A", outStoreAb.flagged.filter((s) => s.noOutletData), ABSENSI_COLUMNS)}
                exportRows={outStoreAb.flagged.filter((s) => s.noOutletData)} exportColumns={ABSENSI_COLUMNS} exportFilename="outstore-absensi-gps-toko-na" />
              <StatCard icon={Clock} label="Durasi Bermasalah (Pendek/Panjang/No-Checkout)" value={outStoreAb.anomalyCounts.duration} tone="indigo"
                onClick={() => openDetail("Out Store — Absensi — Durasi Bermasalah", outStoreAb.flagged.filter((s) => s.durationIssue), ABSENSI_COLUMNS)}
                exportRows={outStoreAb.flagged.filter((s) => s.durationIssue)} exportColumns={ABSENSI_COLUMNS} exportFilename="outstore-absensi-durasi-bermasalah" />
            </div>
          ) : <div className="text-xs text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded-xl">Tidak ada data</div>}
        </div>

        <div className="md:col-start-1 md:row-start-2 mb-3 md:mb-0">
          <Panel title="Tren Anomali per Tanggal — In Store (Absensi, by Activity ID)" height={160} exportData={inStoreAb?.byDate} exportFilename="instore-absensi-tren-tanggal">
            {inStoreAb && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={inStoreAb.byDate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={9} />
                  <YAxis stroke="#6b7280" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #d1d5db", fontSize: 11 }} />
                  <Line type="monotone" dataKey="anomali" stroke="#f59e0b" strokeWidth={2}
                    dot={{ r: 3, cursor: "pointer" }}
                    activeDot={{ r: 6, cursor: "pointer", onClick: (_, p) => openDetail(`In Store — Absensi — ${p.payload.date}`, inStoreAb.flagged.filter((s) => s.date === p.payload.date), ABSENSI_COLUMNS) }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>
        <div className="md:col-start-2 md:row-start-2 mb-3 md:mb-0">
          <Panel title="Tren Anomali per Tanggal — Out Store (Absensi, by Activity ID)" height={160} exportData={outStoreAb?.byDate} exportFilename="outstore-absensi-tren-tanggal">
            {outStoreAb && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={outStoreAb.byDate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={9} />
                  <YAxis stroke="#6b7280" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #d1d5db", fontSize: 11 }} />
                  <Line type="monotone" dataKey="anomali" stroke="#d946ef" strokeWidth={2}
                    dot={{ r: 3, cursor: "pointer" }}
                    activeDot={{ r: 6, cursor: "pointer", onClick: (_, p) => openDetail(`Out Store — Absensi — ${p.payload.date}`, outStoreAb.flagged.filter((s) => s.date === p.payload.date), ABSENSI_COLUMNS) }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>

        <div className="md:col-start-1 md:row-start-3 mb-3 md:mb-0">
          <Leaderboard title="Top 5 Anomali — In Store (Absensi)" data={inStoreAb?.topOffenders || []} tone="teal"
            onItemClick={(d) => openDetail(`In Store — Absensi — ${d.name}`, (inStoreAb?.flagged || []).filter((s) => s.employee_name === d.name), ABSENSI_COLUMNS)}
            exportFilename="instore-absensi-leaderboard" />
        </div>
        <div className="md:col-start-2 md:row-start-3 mb-3 md:mb-0">
          <Leaderboard title="Top 5 Anomali — Out Store (Absensi)" data={outStoreAb?.topOffenders || []} tone="indigo"
            onItemClick={(d) => openDetail(`Out Store — Absensi — ${d.name}`, (outStoreAb?.flagged || []).filter((s) => s.employee_name === d.name), ABSENSI_COLUMNS)}
            exportFilename="outstore-absensi-leaderboard" />
        </div>

        <div className="md:col-start-1 md:row-start-4">
          <div className="text-[11px] text-gray-500 mb-2">Detail ter-flag In Store — Absensi ({inStoreAb?.flagged.length ?? 0}/{inStoreAb?.total ?? 0})</div>
          <FlaggedTable rows={inStoreAb?.flagged || []} columns={ABSENSI_COLUMNS} exportFilename="instore-absensi-detail-anomali" />
        </div>
        <div className="md:col-start-2 md:row-start-4">
          <div className="text-[11px] text-gray-500 mb-2">Detail ter-flag Out Store — Absensi ({outStoreAb?.flagged.length ?? 0}/{outStoreAb?.total ?? 0})</div>
          <FlaggedTable rows={outStoreAb?.flagged || []} columns={ABSENSI_COLUMNS} exportFilename="outstore-absensi-detail-anomali" />
        </div>
      </div>

      <DetailModal detail={detail} onClose={closeDetail} />
    </div>
  );
}

// ───────────────────────── root ─────────────────────────

export default function Dashboard() {
  const [page, setPage] = useState("upload");
  const [showGlossary, setShowGlossary] = useState(false);

  const [rawRows, setRawRows] = useState(null);
  const [fileNames, setFileNames] = useState([]);

  const [moveThresholdM, setMoveThresholdM] = useState(100);
  const [shortHr, setShortHr] = useState(4);
  const [longHr, setLongHr] = useState(14);

  const onFiles = useCallback(async (files) => {
    const parsedPerFile = await Promise.all(files.map((f) => parseAnyFile(f)));
    const combined = parsedPerFile.flat();
    setRawRows((prev) => (prev ? prev.concat(combined) : combined));
    setFileNames((prev) => [...prev, ...files.map((f) => f.name)]);
  }, []);

  const { absensi: absensiDataAll, timestamp: timestampDataAll } = useMemo(
    () => (rawRows ? splitByRecordType(rawRows) : { absensi: null, timestamp: null }),
    [rawRows]
  );

  // Region/Cluster filter — national view by default ("Semua"), drills down
  // using Region_DOP/Cluster_DOP (present once the merger has been re-run
  // with the version that keeps these columns from the DOP source).
  const [selectedRegion, setSelectedRegion] = useState("Semua");
  const [selectedCluster, setSelectedCluster] = useState("Semua");
  const [selectedStatus, setSelectedStatus] = useState("Semua");

  const rowIsActive = (r) => {
    const s = String(r["Employment Status_HR"] ?? r["Status_DOP"] ?? "").trim().toLowerCase();
    return s === "active";
  };
  const matchesStatus = (r) => {
    if (selectedStatus === "Semua") return true;
    if (selectedStatus === "Active") return rowIsActive(r);
    return !rowIsActive(r); // "Non-Active"
  };

  // Only surface Region/Cluster values with a meaningful amount of data —
  // filters out stray typo/inconsistent entries (e.g. "Central" alongside
  // "CENTRAL JAVA") that only ever have a handful of rows.
  const MIN_GROUP_SIZE = 3;
  const groupOptionsByCount = (rows, key) => {
    const idsByValue = new Map();
    rows.forEach((r) => {
      const value = r[key];
      if (!value) return;
      if (!idsByValue.has(value)) idsByValue.set(value, new Set());
      const id = r["Employee ID"];
      if (id) idsByValue.get(value).add(id);
    });
    return [...idsByValue.entries()]
      .filter(([, ids]) => ids.size >= MIN_GROUP_SIZE)
      // Canonical Region/Cluster values in this data are written ALL CAPS
      // (e.g. "CENTRAL JAVA", "KALIMANTAN"). Inconsistent Title-Case
      // duplicates (e.g. "Central", "Kalimantan") are stray/typo entries —
      // filter them out rather than guessing by name.
      .filter(([value]) => value === value.toUpperCase())
      .map(([value]) => value)
      .sort();
  };

  const regionOptions = useMemo(() => {
    if (!rawRows) return [];
    return groupOptionsByCount(rawRows, "Region_DOP");
  }, [rawRows]);

  const clusterOptions = useMemo(() => {
    if (!rawRows) return [];
    const scoped = selectedRegion === "Semua" ? rawRows : rawRows.filter((r) => r["Region_DOP"] === selectedRegion);
    return groupOptionsByCount(scoped, "Cluster_DOP");
  }, [rawRows, selectedRegion]);

  const timestampData = useMemo(() => {
    if (!timestampDataAll) return null;
    return timestampDataAll.filter((r) =>
      (selectedRegion === "Semua" || r["Region_DOP"] === selectedRegion) &&
      (selectedCluster === "Semua" || r["Cluster_DOP"] === selectedCluster) &&
      matchesStatus(r)
    );
  }, [timestampDataAll, selectedRegion, selectedCluster, selectedStatus]);

  const absensiData = useMemo(() => {
    if (!absensiDataAll) return null;
    return absensiDataAll.filter((r) =>
      (selectedRegion === "Semua" || r["Region_DOP"] === selectedRegion) &&
      (selectedCluster === "Semua" || r["Cluster_DOP"] === selectedCluster) &&
      matchesStatus(r)
    );
  }, [absensiDataAll, selectedRegion, selectedCluster, selectedStatus]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 overflow-x-hidden">
      <div className="max-w-6xl mx-auto px-4 py-6 w-full min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Dashboard Anomali Lapangan</h1>
          <div className="flex items-center gap-3">
            {page === "dashboard" && (
              <button onClick={() => setShowGlossary(true)} className="flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 font-medium">
                📖 Kamus Istilah
              </button>
            )}
            {page === "dashboard" && (
              <button onClick={() => setPage("upload")} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800">
                <ArrowLeft className="w-3.5 h-3.5" /> Upload
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          {page === "upload"
            ? "Upload 1 file hasil Data Merger (CSV/XLSX/JSON) untuk mulai analisis."
            : "Klik angka atau chart untuk lihat detail. Signal: zona absen (Timestamp), GPS, status employment, durasi kerja (Absensi)."}
        </p>

        {page === "upload" ? (
          <UploadPage
            fileNames={fileNames}
            onFiles={onFiles}
            onGoDashboard={() => setPage("dashboard")}
            canGo={!!rawRows && rawRows.length > 0}
          />
        ) : (
          <>
            {rawRows && (
              <div className="flex flex-wrap items-center gap-3 mb-4 bg-white border border-gray-200 rounded-xl px-4 py-3">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tampilan:</span>
                {regionOptions.length > 0 && (
                  <>
                    <label className="flex items-center gap-1.5 text-xs text-gray-700">
                      Region:
                      <select
                        value={selectedRegion}
                        onChange={(e) => { setSelectedRegion(e.target.value); setSelectedCluster("Semua"); }}
                        className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-gray-800"
                      >
                        <option value="Semua">Semua (Nasional)</option>
                        {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-700">
                      Cluster:
                      <select
                        value={selectedCluster}
                        onChange={(e) => setSelectedCluster(e.target.value)}
                        className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-gray-800"
                      >
                        <option value="Semua">Semua Cluster</option>
                        {clusterOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  </>
                )}
                <label className="flex items-center gap-1.5 text-xs text-gray-700">
                  Status:
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-gray-800"
                  >
                    <option value="Semua">Semua Status</option>
                    <option value="Active">Active</option>
                    <option value="Non-Active">Non-Active</option>
                  </select>
                </label>
                {(selectedRegion !== "Semua" || selectedCluster !== "Semua" || selectedStatus !== "Semua") && (
                  <button
                    type="button"
                    onClick={() => { setSelectedRegion("Semua"); setSelectedCluster("Semua"); setSelectedStatus("Semua"); }}
                    className="text-[11px] text-teal-700 hover:underline"
                  >
                    Reset ke Nasional
                  </button>
                )}
              </div>
            )}
            <DashboardPage
              timestampData={timestampData}
              absensiData={absensiData} moveThresholdM={moveThresholdM} setMoveThresholdM={setMoveThresholdM}
              shortHr={shortHr} setShortHr={setShortHr} longHr={longHr} setLongHr={setLongHr}
            />
          </>
        )}
        <div className="text-center text-[10px] text-gray-300 mt-8">Dashboard v86</div>
      </div>
      <GlossaryModal open={showGlossary} onClose={() => setShowGlossary(false)} />
    </div>
  );
}
