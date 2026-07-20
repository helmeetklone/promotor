import React, { useState, useMemo, useCallback, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList
} from "recharts";
import {
  Upload, MapPin, Clock, FileWarning, AlertTriangle, ArrowLeft,
  ChevronDown, ChevronUp, Trophy, ArrowRight, CheckCircle2
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
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const classifyPromotorType = (roleStr) => {
  const r = String(roleStr || "").trim().toLowerCase();
  if (!r || r === "-") return "Lainnya";
  if (r.includes("in store") || r.includes("sgs") || r.includes("spg")) return "In Store Promotor";
  if (r.includes("out store") || r.includes("sds") || r === "ds") return "Out Store Promotor";
  return "Lainnya";
};

const topNWithRole = (rows, keyFn, roleFn, n) => {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, { count: 0, role: roleFn(r) });
    map.get(k).count++;
  });
  return [...map.entries()]
    .map(([name, v]) => ({ name, role: v.role, count: v.count }))
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

const getPosition = (r) =>
  r["Position_HR"] || r["Position_ABSENSI"] || r["Position_TIMESTAMP"] || r["Position_DOP"] || "-";

// ───────────────────────── Absensi (attendance) processing ─────────────────────────

function processAbsensi(rows, moveThresholdM, shortHr, longHr) {
  const shifts = rows.map((r) => {
    const latIn = toNum(r["Latitude In_ABSENSI"]);
    const lonIn = toNum(r["Longitude In_ABSENSI"]);
    const latOut = toNum(r["Latitude Out_ABSENSI"]);
    const lonOut = toNum(r["Longitude Out_ABSENSI"]);
    const hasIn = latIn !== null && lonIn !== null;
    const hasOut = latOut !== null && lonOut !== null;
    const distM = hasIn && hasOut ? haversineMeters({ lat: latIn, lon: lonIn }, { lat: latOut, lon: lonOut }) : null;
    const durHr = toNum(r["Time Duration Adj (Hours)_ABSENSI"] ?? r["Time Duration (Hours)_ABSENSI"]);
    const position = getPosition(r);

    return {
      date: r["Date_ABSENSI"] || "-",
      employee_name: r["Employee Name_ABSENSI"] || r["Employee ID"] || "-",
      position,
      promotorType: classifyPromotorType(position),
      late: !!String(r["Late In_ABSENSI"] || "").trim(),
      earlyOut: !!String(r["Early Out_ABSENSI"] || "").trim(),
      noClockOut: !String(r["Time Out_ABSENSI"] || "").trim(),
      durHr,
      shortShift: durHr !== null && durHr < shortHr,
      longShift: durHr !== null && durHr > longHr,
      moveM: distM,
      bigMove: distM !== null && distM > moveThresholdM,
      noCoord: !hasIn,
    };
  });

  const total = shifts.length;
  const anomalyCounts = {
    late: shifts.filter((s) => s.late).length,
    earlyOut: shifts.filter((s) => s.earlyOut).length,
    noClockOut: shifts.filter((s) => s.noClockOut).length,
    duration: shifts.filter((s) => s.shortShift || s.longShift).length,
    gpsMove: shifts.filter((s) => s.bigMove).length,
  };

  const byRole = {};
  shifts.forEach((s) => {
    byRole[s.position] = byRole[s.position] || { role: s.position, anomali: 0, total: 0 };
    byRole[s.position].total++;
    if (s.late || s.earlyOut || s.noClockOut || s.shortShift || s.longShift || s.bigMove) byRole[s.position].anomali++;
  });

  const byPromotorType = {};
  shifts.forEach((s) => {
    byPromotorType[s.promotorType] = byPromotorType[s.promotorType] || { type: s.promotorType, anomali: 0, total: 0 };
    byPromotorType[s.promotorType].total++;
    if (s.late || s.earlyOut || s.noClockOut || s.shortShift || s.longShift || s.bigMove) byPromotorType[s.promotorType].anomali++;
  });

  const byDate = {};
  shifts.forEach((s) => {
    byDate[s.date] = byDate[s.date] || { date: s.date, anomali: 0, total: 0 };
    byDate[s.date].total++;
    if (s.late || s.earlyOut || s.noClockOut || s.shortShift || s.longShift || s.bigMove) byDate[s.date].anomali++;
  });

  const flagged = shifts.filter((s) => s.late || s.earlyOut || s.noClockOut || s.shortShift || s.longShift || s.bigMove);

  return {
    total,
    anomalyCounts,
    byRole: Object.values(byRole).sort((a, b) => b.anomali - a.anomali),
    byPromotorType,
    byPromotorTypeChart: Object.values(byPromotorType).sort((a, b) => b.anomali - a.anomali),
    byDate: Object.values(byDate).sort((a, b) => (a.date > b.date ? 1 : -1)),
    flagged,
    topOffenders: topNWithRole(flagged, (s) => s.employee_name, (s) => s.position, 5),
  };
}

// ───────────────────────── Timestamp (journey/visit) processing ─────────────────────────

function processTimestamp(rows, gpsThresholdM, shortVisitHr) {
  const visits = rows.map((r) => {
    const latIn = toNum(r["Latitude In_TIMESTAMP"]);
    const lonIn = toNum(r["Longitude In_TIMESTAMP"]);
    const latOut = toNum(r["Latitude Out_TIMESTAMP"]);
    const lonOut = toNum(r["Longitude Out_TIMESTAMP"]);
    const hasIn = latIn !== null && lonIn !== null;
    const hasOut = latOut !== null && lonOut !== null;
    const distM = hasIn && hasOut ? haversineMeters({ lat: latIn, lon: lonIn }, { lat: latOut, lon: lonOut }) : null;
    const durHr = toNum(r["Time Duration (Hours)_TIMESTAMP"]);
    const position = getPosition(r);

    return {
      date: r["Date_TIMESTAMP"] || "-",
      employee_name: r["Employee Name_TIMESTAMP"] || r["Employee ID"] || "-",
      position,
      promotorType: classifyPromotorType(position),
      durationHr: durHr,
      hasOrgCoord: hasIn,
      gpsDistanceM: distM,
      gpsMismatch: distM !== null && distM > gpsThresholdM,
      shortVisit: durHr !== null && durHr < shortVisitHr,
      incomplete: !hasOut,
    };
  });

  const total = visits.length;
  const anomalyCounts = {
    gps: visits.filter((v) => v.gpsMismatch).length,
    noCoord: visits.filter((v) => !v.hasOrgCoord).length,
    short: visits.filter((v) => v.shortVisit).length,
    incomplete: visits.filter((v) => v.incomplete).length,
  };

  const byRole = {};
  visits.forEach((v) => {
    byRole[v.position] = byRole[v.position] || { role: v.position, anomali: 0, total: 0 };
    byRole[v.position].total++;
    if (v.gpsMismatch || !v.hasOrgCoord || v.shortVisit || v.incomplete) byRole[v.position].anomali++;
  });

  const byPromotorType = {};
  visits.forEach((v) => {
    byPromotorType[v.promotorType] = byPromotorType[v.promotorType] || { type: v.promotorType, anomali: 0, total: 0 };
    byPromotorType[v.promotorType].total++;
    if (v.gpsMismatch || !v.hasOrgCoord || v.shortVisit || v.incomplete) byPromotorType[v.promotorType].anomali++;
  });

  const byDate = {};
  visits.forEach((v) => {
    byDate[v.date] = byDate[v.date] || { date: v.date, anomali: 0, total: 0 };
    byDate[v.date].total++;
    if (v.gpsMismatch || !v.hasOrgCoord || v.shortVisit || v.incomplete) byDate[v.date].anomali++;
  });

  const flagged = visits.filter((v) => v.gpsMismatch || !v.hasOrgCoord || v.shortVisit || v.incomplete);

  return {
    total,
    anomalyCounts,
    byRole: Object.values(byRole).sort((a, b) => b.anomali - a.anomali),
    byPromotorType,
    byPromotorTypeChart: Object.values(byPromotorType).sort((a, b) => b.anomali - a.anomali),
    byDate: Object.values(byDate).sort((a, b) => (a.date > b.date ? 1 : -1)),
    flagged,
    topOffenders: topNWithRole(flagged, (v) => v.employee_name, (v) => v.position, 5),
  };
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
        dragOver ? "border-teal-400 bg-teal-950/40" : hasFiles ? "border-teal-700 bg-teal-950/20" : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
      }`}
    >
      {hasFiles ? (
        <>
          <CheckCircle2 className="w-6 h-6 text-teal-400 mb-2" />
          <p className="text-teal-300 text-sm font-medium">{fileNames.length} file terupload</p>
          <p className="text-slate-500 text-xs mt-1 max-w-full truncate px-4">{fileNames.join(", ")}</p>
          <p className="text-slate-600 text-[11px] mt-1">Klik atau drop lagi untuk tambah file</p>
        </>
      ) : (
        <>
          <Upload className="w-6 h-6 text-slate-500 mb-2" />
          <p className="text-slate-300 text-sm font-medium">{label}</p>
          <p className="text-slate-500 text-xs mt-1">CSV/XLSX/JSON, bisa pilih banyak file sekaligus</p>
        </>
      )}
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.json" multiple className="hidden"
        onChange={(e) => e.target.files.length && onFiles(Array.from(e.target.files))} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    teal: "text-teal-400 bg-teal-950/50",
    amber: "text-amber-400 bg-amber-950/50",
    pink: "text-pink-400 bg-pink-950/50",
    indigo: "text-indigo-400 bg-indigo-950/50",
    red: "text-red-400 bg-red-950/50",
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-2.5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-base font-bold text-slate-100 leading-none">{value.toLocaleString("id-ID")}</div>
        <div className="text-[10px] text-slate-500 mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

function FlaggedTable({ rows, columns }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows.slice(0, 200) : rows.slice(0, 8);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden w-full min-w-0">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500">
              {columns.map((c) => <th key={c.key} className="text-left px-2.5 py-2 font-medium whitespace-nowrap">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-b border-slate-800/60 text-slate-300">
                {columns.map((c) => (
                  <td key={c.key} className="px-2.5 py-2 whitespace-nowrap">{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && (
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-center gap-1 py-2 text-xs text-slate-400 hover:bg-slate-800/50 border-t border-slate-800">
          {open ? <>Tutup <ChevronUp className="w-3 h-3" /></> : <>Lihat semua ({rows.length}) <ChevronDown className="w-3 h-3" /></>}
        </button>
      )}
    </div>
  );
}

function Leaderboard({ title, data, tone }) {
  const tones = { teal: "text-teal-400", indigo: "text-indigo-400" };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-2.5">
        <Trophy className="w-3.5 h-3.5" /> {title}
      </div>
      {data.length === 0 ? (
        <div className="text-xs text-slate-600">Tidak ada anomali</div>
      ) : (
        <div className="space-y-2">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-slate-300 truncate pr-2 min-w-0">
                {i + 1}. {d.name}
                {d.role && <span className="text-slate-500"> — {d.role}</span>}
              </span>
              <span className={`font-semibold ${tones[tone]} flex-shrink-0`}>{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Upload Page ─────────────────────────

function UploadPage({ fileNames, onFiles, onGoDashboard, canGo }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold text-teal-400 mb-2">Upload data hasil merge</div>
        <UploadBox onFiles={onFiles} label="Hasil dari Data Merger (Absensi + Timestamp digabung)" fileNames={fileNames} />
      </div>
      <button
        onClick={onGoDashboard}
        disabled={!canGo}
        className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium py-3 rounded-lg transition-colors"
      >
        Lihat Dashboard <ArrowRight className="w-4 h-4" />
      </button>
      {!canGo && <p className="text-center text-xs text-slate-600">Upload file hasil merge untuk lanjut</p>}
    </div>
  );
}

// ───────────────────────── Overview banner ─────────────────────────

function OverviewBanner({ absensiResult, timestampResult }) {
  const absensiTotal = absensiResult?.flagged.length ?? 0;
  const timestampTotal = timestampResult?.flagged.length ?? 0;
  const combinedTotal = absensiTotal + timestampTotal;
  const absensiRate = absensiResult ? ((absensiTotal / absensiResult.total) * 100).toFixed(1) : "-";
  const timestampRate = timestampResult ? ((timestampTotal / timestampResult.total) * 100).toFixed(1) : "-";

  const inStore =
    (timestampResult?.byPromotorType["In Store Promotor"]?.anomali ?? 0) +
    (absensiResult?.byPromotorType["In Store Promotor"]?.anomali ?? 0);
  const outStore =
    (timestampResult?.byPromotorType["Out Store Promotor"]?.anomali ?? 0) +
    (absensiResult?.byPromotorType["Out Store Promotor"]?.anomali ?? 0);

  return (
    <div className="bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-900 rounded-xl p-5 mb-6">
      <div className="text-[11px] uppercase tracking-wide text-emerald-400 font-semibold mb-3">
        Overview Total — Timestamp (Journey) + Absensi (Attendance)
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className="text-3xl font-bold text-slate-100 leading-none">{combinedTotal.toLocaleString("id-ID")}</div>
          <div className="text-[11px] text-slate-400 mt-1">Total Anomali Promotor</div>
        </div>
        <div>
          <div className="text-xl font-bold text-teal-400 leading-none">{timestampTotal}</div>
          <div className="text-[11px] text-slate-500 mt-1">Timestamp &middot; {timestampRate}%</div>
        </div>
        <div>
          <div className="text-xl font-bold text-indigo-400 leading-none">{absensiTotal}</div>
          <div className="text-[11px] text-slate-500 mt-1">Absensi &middot; {absensiRate}%</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-emerald-900/50 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="text-[11px] text-slate-500 w-full">Berdasarkan tipe promotor (dari kolom Position)</div>
        <div>
          <div className="text-xl font-bold text-amber-400 leading-none">{inStore.toLocaleString("id-ID")}</div>
          <div className="text-[11px] text-slate-500 mt-1">In Store Promotor</div>
        </div>
        <div>
          <div className="text-xl font-bold text-fuchsia-400 leading-none">{outStore.toLocaleString("id-ID")}</div>
          <div className="text-[11px] text-slate-500 mt-1">Out Store Promotor</div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Timestamp column ─────────────────────────

function TimestampColumn({ data, gpsThresholdM, setGpsThresholdM, shortVisitHr, setShortVisitHr }) {
  const result = useMemo(() => data ? processTimestamp(data, gpsThresholdM, shortVisitHr) : null, [data, gpsThresholdM, shortVisitHr]);

  if (!result) {
    return <div className="text-xs text-slate-600 text-center py-10 border border-dashed border-slate-800 rounded-xl">Tidak ada data Timestamp di file yang diupload</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center text-[11px] text-slate-400">
        <label className="flex items-center gap-1.5">GPS (m):
          <input type="number" step="10" value={gpsThresholdM} onChange={(e) => setGpsThresholdM(parseFloat(e.target.value) || 0)}
            className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200" />
        </label>
        <label className="flex items-center gap-1.5">Durasi min (jam):
          <input type="number" step="0.1" value={shortVisitHr} onChange={(e) => setShortVisitHr(parseFloat(e.target.value) || 0)}
            className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={MapPin} label="GPS Mismatch" value={result.anomalyCounts.gps} tone="red" />
        <StatCard icon={FileWarning} label="Tanpa Koordinat" value={result.anomalyCounts.noCoord} tone="amber" />
        <StatCard icon={Clock} label="Kunjungan Singkat" value={result.anomalyCounts.short} tone="pink" />
        <StatCard icon={AlertTriangle} label="Tidak Lengkap" value={result.anomalyCounts.incomplete} tone="indigo" />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
        <div className="text-[11px] text-slate-400 mb-2">Tren Anomali per Tanggal</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={result.byDate}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={9} />
            <YAxis stroke="#64748b" fontSize={10} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 11 }} />
            <Line type="monotone" dataKey="anomali" stroke="#2dd4bf" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
        <div className="text-[11px] text-slate-400 mb-2">Anomali per Tipe Promotor</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={result.byPromotorTypeChart} layout="vertical" margin={{ left: 10, right: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
            <XAxis type="number" stroke="#64748b" fontSize={10} />
            <YAxis type="category" dataKey="type" stroke="#64748b" fontSize={9} width={100} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 11 }} />
            <Bar dataKey="anomali" fill="#f472b6" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="anomali" position="right" fill="#e2e8f0" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
        <div className="text-[11px] text-slate-400 mb-2">Anomali per Role</div>
        <ResponsiveContainer width="100%" height={Math.max(120, result.byRole.length * 34)}>
          <BarChart data={result.byRole} layout="vertical" margin={{ left: 10, right: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
            <XAxis type="number" stroke="#64748b" fontSize={10} />
            <YAxis type="category" dataKey="role" stroke="#64748b" fontSize={9} width={100} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 11 }} />
            <Bar dataKey="anomali" fill="#2dd4bf" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="anomali" position="right" fill="#e2e8f0" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Leaderboard title="Top 5 Anomali per Orang (dengan Role)" data={result.topOffenders} tone="teal" />

      <div>
        <div className="text-[11px] text-slate-400 mb-2">Detail ter-flag ({result.flagged.length}/{result.total})</div>
        <FlaggedTable
          rows={result.flagged}
          columns={[
            { key: "date", label: "Tgl" },
            { key: "employee_name", label: "Nama" },
            { key: "position", label: "Role" },
            { key: "gpsDistanceM", label: "GPS(m)", render: (r) => r.gpsDistanceM ? r.gpsDistanceM.toFixed(0) : "-" },
            { key: "flags", label: "Flag", render: (r) => [
                r.gpsMismatch && "GPS", !r.hasOrgCoord && "No-Coord", r.shortVisit && "Singkat", r.incomplete && "Bolong"
              ].filter(Boolean).join(", ") },
          ]}
        />
      </div>
    </div>
  );
}

// ───────────────────────── Absensi column ─────────────────────────

function AbsensiColumn({ data, moveThresholdM, setMoveThresholdM, shortHr, setShortHr, longHr, setLongHr }) {
  const result = useMemo(() => data ? processAbsensi(data, moveThresholdM, shortHr, longHr) : null, [data, moveThresholdM, shortHr, longHr]);

  if (!result) {
    return <div className="text-xs text-slate-600 text-center py-10 border border-dashed border-slate-800 rounded-xl">Tidak ada data Absensi di file yang diupload</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center text-[11px] text-slate-400">
        <label className="flex items-center gap-1.5">Pendek &lt; (jam):
          <input type="number" value={shortHr} onChange={(e) => setShortHr(parseFloat(e.target.value) || 0)}
            className="w-12 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200" />
        </label>
        <label className="flex items-center gap-1.5">Panjang &gt; (jam):
          <input type="number" value={longHr} onChange={(e) => setLongHr(parseFloat(e.target.value) || 0)}
            className="w-12 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200" />
        </label>
        <label className="flex items-center gap-1.5">GPS (m):
          <input type="number" step="10" value={moveThresholdM} onChange={(e) => setMoveThresholdM(parseFloat(e.target.value) || 0)}
            className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={Clock} label="Telat" value={result.anomalyCounts.late} tone="amber" />
        <StatCard icon={Clock} label="Pulang Cepat" value={result.anomalyCounts.earlyOut} tone="pink" />
        <StatCard icon={FileWarning} label="Belum Clock-out" value={result.anomalyCounts.noClockOut} tone="red" />
        <StatCard icon={AlertTriangle} label="Durasi Ganjil" value={result.anomalyCounts.duration} tone="indigo" />
      </div>
      <StatCard icon={MapPin} label="GPS In≠Out Jauh" value={result.anomalyCounts.gpsMove} tone="teal" />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
        <div className="text-[11px] text-slate-400 mb-2">Tren Anomali per Tanggal</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={result.byDate}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" stroke="#64748b" fontSize={9} />
            <YAxis stroke="#64748b" fontSize={10} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 11 }} />
            <Line type="monotone" dataKey="anomali" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
        <div className="text-[11px] text-slate-400 mb-2">Anomali per Tipe Promotor</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={result.byPromotorTypeChart} layout="vertical" margin={{ left: 10, right: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
            <XAxis type="number" stroke="#64748b" fontSize={10} />
            <YAxis type="category" dataKey="type" stroke="#64748b" fontSize={9} width={100} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 11 }} />
            <Bar dataKey="anomali" fill="#818cf8" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="anomali" position="right" fill="#e2e8f0" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
        <div className="text-[11px] text-slate-400 mb-2">Anomali per Role</div>
        <ResponsiveContainer width="100%" height={Math.max(120, result.byRole.length * 34)}>
          <BarChart data={result.byRole} layout="vertical" margin={{ left: 10, right: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
            <XAxis type="number" stroke="#64748b" fontSize={10} />
            <YAxis type="category" dataKey="role" stroke="#64748b" fontSize={9} width={100} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 11 }} />
            <Bar dataKey="anomali" fill="#f59e0b" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="anomali" position="right" fill="#e2e8f0" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Leaderboard title="Top 5 Anomali per Orang (dengan Role)" data={result.topOffenders} tone="indigo" />

      <div>
        <div className="text-[11px] text-slate-400 mb-2">Detail ter-flag ({result.flagged.length}/{result.total})</div>
        <FlaggedTable
          rows={result.flagged}
          columns={[
            { key: "date", label: "Tgl" },
            { key: "employee_name", label: "Nama" },
            { key: "position", label: "Role" },
            { key: "durHr", label: "Jam", render: (r) => r.durHr !== null ? r.durHr.toFixed(1) : "-" },
            { key: "flags", label: "Flag", render: (r) => [
                r.late && "Telat", r.earlyOut && "Cepat Pulang", r.noClockOut && "No-Out",
                r.shortShift && "Pendek", r.longShift && "Panjang", r.bigMove && "GPS Jauh"
              ].filter(Boolean).join(", ") },
          ]}
        />
      </div>
    </div>
  );
}

// ───────────────────────── Dashboard Page ─────────────────────────

function DashboardPage(props) {
  const {
    timestampData, gpsThresholdM, setGpsThresholdM, shortVisitHr, setShortVisitHr,
    absensiData, moveThresholdM, setMoveThresholdM, shortHr, setShortHr, longHr, setLongHr,
  } = props;

  const timestampResult = useMemo(() => timestampData ? processTimestamp(timestampData, gpsThresholdM, shortVisitHr) : null, [timestampData, gpsThresholdM, shortVisitHr]);
  const absensiResult = useMemo(() => absensiData ? processAbsensi(absensiData, moveThresholdM, shortHr, longHr) : null, [absensiData, moveThresholdM, shortHr, longHr]);

  return (
    <div>
      <OverviewBanner absensiResult={absensiResult} timestampResult={timestampResult} />
      <div className="grid md:grid-cols-2 gap-5 min-w-0">
        <div className="min-w-0">
          <div className="text-sm font-bold text-teal-400 mb-3">Data Timestamp (Journey)</div>
          <TimestampColumn
            data={timestampData}
            gpsThresholdM={gpsThresholdM} setGpsThresholdM={setGpsThresholdM}
            shortVisitHr={shortVisitHr} setShortVisitHr={setShortVisitHr}
          />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-indigo-400 mb-3">Data Absensi (Attendance)</div>
          <AbsensiColumn
            data={absensiData}
            moveThresholdM={moveThresholdM} setMoveThresholdM={setMoveThresholdM}
            shortHr={shortHr} setShortHr={setShortHr}
            longHr={longHr} setLongHr={setLongHr}
          />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── root ─────────────────────────

export default function Dashboard() {
  const [page, setPage] = useState("upload");

  const [rawRows, setRawRows] = useState(null);
  const [fileNames, setFileNames] = useState([]);

  const [gpsThresholdM, setGpsThresholdM] = useState(100);
  const [shortVisitHr, setShortVisitHr] = useState(0.25);

  const [moveThresholdM, setMoveThresholdM] = useState(100);
  const [shortHr, setShortHr] = useState(4);
  const [longHr, setLongHr] = useState(14);

  const onFiles = useCallback(async (files) => {
    const parsedPerFile = await Promise.all(files.map((f) => parseAnyFile(f)));
    const combined = parsedPerFile.flat();
    setRawRows((prev) => (prev ? prev.concat(combined) : combined));
    setFileNames((prev) => [...prev, ...files.map((f) => f.name)]);
  }, []);

  const { absensi: absensiData, timestamp: timestampData } = useMemo(
    () => (rawRows ? splitByRecordType(rawRows) : { absensi: null, timestamp: null }),
    [rawRows]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">
      <div className="max-w-6xl mx-auto px-4 py-6 w-full min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Dashboard Anomali Lapangan</h1>
          {page === "dashboard" && (
            <button onClick={() => setPage("upload")} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
              <ArrowLeft className="w-3.5 h-3.5" /> Upload
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-6">
          {page === "upload"
            ? "Upload 1 file hasil Data Merger (CSV/XLSX/JSON) untuk mulai analisis."
            : "GPS mismatch, telat/durasi, dan data tidak lengkap — dari Timestamp & Absensi"}
        </p>

        {page === "upload" ? (
          <UploadPage
            fileNames={fileNames}
            onFiles={onFiles}
            onGoDashboard={() => setPage("dashboard")}
            canGo={!!rawRows && rawRows.length > 0}
          />
        ) : (
          <DashboardPage
            timestampData={timestampData} gpsThresholdM={gpsThresholdM} setGpsThresholdM={setGpsThresholdM}
            shortVisitHr={shortVisitHr} setShortVisitHr={setShortVisitHr}
            absensiData={absensiData} moveThresholdM={moveThresholdM} setMoveThresholdM={setMoveThresholdM}
            shortHr={shortHr} setShortHr={setShortHr} longHr={longHr} setLongHr={setLongHr}
          />
        )}
      </div>
    </div>
  );
}
