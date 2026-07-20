import React, { useState, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  RotateCcw,
  Radio,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Palette (inline styles only — this runtime has no Tailwind JIT, so
// arbitrary bracket classes like bg-[#111] never apply. Every custom color
// below is applied via the style prop instead.)
// ---------------------------------------------------------------------------
const C = {
  bg: "#0F1318",
  panel: "#151A20",
  panelAlt: "#12161B",
  border: "#232A32",
  borderHover: "#3A4450",
  text: "#FFFFFF",
  textMuted: "#FFFFFF",
  textMuted2: "#FFFFFF",
  accent: "#F5A623",
  accentHover: "#FFB84D",
  accentText: "#14181C",
  green: "#58D68D",
  red: "#FF6B6B",
  redText: "#FF6B6B",
  amberText: "#FFFFFF",
  tableBorder: "#1B2028",
  cellText: "#FFFFFF",
};

// ---------------------------------------------------------------------------
// Config: the 4 source files and how to normalize their join key
// ---------------------------------------------------------------------------
const SLOTS = [
  { key: "dop", label: "DOP", file: "DOP.xlsx", idCol: "Employee ID", suffix: "DOP", accent: "#F0B27A" },
  { key: "hr", label: "File HR", file: "File_HR.xlsx", idCol: "Employee Number", suffix: "HR", accent: "#5DADE2" },
  { key: "absensi", label: "Absensi", file: "Absensi.xlsx", idCol: "Employee No", suffix: "ABSENSI", accent: "#FF6B6B" },
  { key: "timestamp", label: "Timestamp", file: "Timestamp.xlsx", idCol: "Employee No", suffix: "TIMESTAMP", accent: "#58D68D" },
];

const CATEGORY_COLORS = {
  gps: "#FF6B6B",
  waktu: "#FFD966",
  remark: "#C39BD3",
  status: "#5DADE2",
  posisi: "#58D68D",
  timing: "#F0B27A",
  id: "#9CA3AF",
};
const CATEGORY_LABEL = {
  gps: "GPS / Lokasi",
  waktu: "Jam Kerja / Durasi",
  remark: "Remark / Catatan",
  status: "Status Employment",
  posisi: "Posisi / Tipe",
  timing: "Tanggal Input",
  id: "Identitas",
};

const ID_COLS = ["Employee ID", "Record_Type", "Employee Name_ABSENSI", "Employee Name_TIMESTAMP"];

const CATEGORY_MAP = {
  "Longitude In_ABSENSI": "gps", "Latitude In_ABSENSI": "gps", "Longitude Out_ABSENSI": "gps", "Latitude Out_ABSENSI": "gps",
  "Address In_ABSENSI": "gps", "Address Out_ABSENSI": "gps",
  "Longitude In_TIMESTAMP": "gps", "Latitude In_TIMESTAMP": "gps", "Longitude Out_TIMESTAMP": "gps", "Latitude Out_TIMESTAMP": "gps",
  "Address In_TIMESTAMP": "gps", "Address Out_TIMESTAMP": "gps",
  "Time In_ABSENSI": "waktu", "Time Out_ABSENSI": "waktu",
  "Time Duration (Hours)_ABSENSI": "waktu", "Time Duration (Hours)_1_ABSENSI": "waktu",
  "Time In Adj_ABSENSI": "waktu", "Time Out Adj_ABSENSI": "waktu", "Time Duration Adj (Hours)_ABSENSI": "waktu",
  "Late In_ABSENSI": "waktu", "Early Out_ABSENSI": "waktu",
  "Start Time_TIMESTAMP": "waktu", "End Time_TIMESTAMP": "waktu", "Time Duration (Hours)_TIMESTAMP": "waktu",
  "Remark In_ABSENSI": "remark", "Remark Out_ABSENSI": "remark",
  "Employment Status_HR": "status", "End Date_HR": "status", "Status_DOP": "status", "End Date_DOP": "status",
  "Position_HR": "posisi", "Position_DOP": "posisi", "Position_ABSENSI": "posisi", "Position_TIMESTAMP": "posisi",
  "Date_ABSENSI": "timing", "Creation Date_ABSENSI": "timing",
  "Date_TIMESTAMP": "timing", "Date In_TIMESTAMP": "timing", "Creation Date_TIMESTAMP": "timing",
  "Created Date_DOP": "timing", "Join Date_DOP": "timing",
};

// Only these raw (un-suffixed) columns are ever needed from each source file.
// Filtering down to just these at parse time (instead of carrying every
// column from the original file through the whole merge) is what keeps
// memory manageable on large real-world files / mobile browsers.
function neededRawColumnsFor(suffix) {
  const raw = new Set();
  Object.keys(CATEGORY_MAP).forEach((col) => {
    const tail = `_${suffix}`;
    if (col.endsWith(tail)) raw.add(col.slice(0, -tail.length));
  });
  ID_COLS.forEach((col) => {
    const tail = `_${suffix}`;
    if (col.endsWith(tail)) raw.add(col.slice(0, -tail.length));
  });
  return raw;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------
function normalizeHeader(h) {
  if (h == null || h === "") return "Column";
  return String(h)
    .replace(/\u00A0/g, " ") // non-breaking space -> normal space
    .replace(/\s+/g, " ")     // collapse repeated whitespace
    .trim();
}

function dedupeHeaders(headers) {
  const seen = {};
  return headers.map((raw) => {
    const name = normalizeHeader(raw);
    if (seen[name] != null) {
      seen[name] += 1;
      return `${name}_${seen[name]}`;
    }
    seen[name] = 0;
    return name;
  });
}

async function parseWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  if (rows.length === 0) return [];
  const headers = dedupeHeaders(rows[0]);
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = r[i] !== undefined ? r[i] : null));
    return obj;
  });
}

// Finds which actual column in a row corresponds to the expected ID column,
// tolerating case differences and stray whitespace so real-world exports
// (which often have inconsistent header formatting) still match.
function resolveIdKey(sampleKeys, idCol) {
  if (sampleKeys.includes(idCol)) return idCol;
  const target = idCol.toLowerCase().replace(/\s+/g, " ").trim();
  const caseInsensitive = sampleKeys.find(
    (k) => k.toLowerCase().replace(/\s+/g, " ").trim() === target
  );
  if (caseInsensitive) return caseInsensitive;
  // last resort: any column that looks like an employee identifier
  const fuzzy = sampleKeys.find((k) => {
    const lk = k.toLowerCase();
    return lk.includes("employee") && (lk.includes("id") || lk.includes("no") || lk.includes("number"));
  });
  return fuzzy || null;
}

function processSource(rows, idCol, suffix) {
  if (rows.length === 0) return { data: [], resolvedIdKey: null };
  const resolvedIdKey = resolveIdKey(Object.keys(rows[0]), idCol);
  const neededRaw = neededRawColumnsFor(suffix);
  const data = rows.map((row) => {
    const out = {};
    Object.entries(row).forEach(([k, v]) => {
      if (k === resolvedIdKey) out["Employee ID"] = v == null ? null : String(v).trim();
      else if (neededRaw.has(k)) out[`${k}_${suffix}`] = v;
      // any other column from the source file is intentionally dropped —
      // it isn't part of the anomaly-detection output, so keeping it would
      // only cost memory (and, for confidential HR data, needlessly retain it).
    });
    return out;
  });
  return { data, resolvedIdKey };
}

function outerJoinMaster(hrRows, dopRows) {
  const dopMap = new Map();
  dopRows.forEach((r) => {
    const k = r["Employee ID"];
    if (k == null) return;
    if (!dopMap.has(k)) dopMap.set(k, r);
  });
  const matched = new Set();
  const out = [];
  hrRows.forEach((h) => {
    const k = h["Employee ID"];
    const match = k != null ? dopMap.get(k) : undefined;
    if (match) matched.add(k);
    out.push(match ? { ...h, ...match, "Employee ID": k } : { ...h });
  });
  dopRows.forEach((d) => {
    const k = d["Employee ID"];
    if (k != null && !matched.has(k)) out.push({ ...d });
  });
  return out;
}

function leftJoinMaster(eventRows, masterRows) {
  const masterMap = new Map();
  masterRows.forEach((r) => {
    const k = r["Employee ID"];
    if (k == null) return;
    if (!masterMap.has(k)) masterMap.set(k, r);
  });
  return eventRows.map((row) => {
    const k = row["Employee ID"];
    const match = k != null ? masterMap.get(k) : undefined;
    return { row, matched: !!match, merged: match ? { ...row, ...match, "Employee ID": k } : { ...row } };
  });
}

function buildFinalColumns(existingKeys) {
  const idCols = ID_COLS.filter((c) => existingKeys.has(c));
  const anomalyCols = Object.keys(CATEGORY_MAP).filter((c) => existingKeys.has(c));
  return [...idCols, ...anomalyCols];
}

function formatCell(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    if (v.getFullYear() <= 1900) {
      return v.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    }
    return v.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (typeof v === "number") return v.toLocaleString("id-ID", { maximumFractionDigits: 6 });
  return String(v);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function AnomalyMergerInner() {
  const [files, setFiles] = useState({ dop: null, hr: null, absensi: null, timestamp: null });
  const [parsed, setParsed] = useState({ dop: null, hr: null, absensi: null, timestamp: null });
  const [status, setStatus] = useState({});
  const [result, setResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [showHeaders, setShowHeaders] = useState({});
  const [headerPreview, setHeaderPreview] = useState({});
  const inputRefs = useRef({});

  const allUploaded = SLOTS.every((s) => files[s.key]);

  const handleFile = useCallback(async (slotKey, fileObj) => {
    if (!fileObj) return;
    setError(null);
    setFiles((f) => ({ ...f, [slotKey]: fileObj }));
    setStatus((s) => ({ ...s, [slotKey]: "reading" }));
    try {
      const rows = await parseWorkbook(fileObj);
      setParsed((p) => ({ ...p, [slotKey]: rows }));
      setHeaderPreview((h) => ({ ...h, [slotKey]: rows[0] ? Object.keys(rows[0]) : [] }));
      setStatus((s) => ({ ...s, [slotKey]: "ok" }));
    } catch (e) {
      setStatus((s) => ({ ...s, [slotKey]: "error" }));
      setError(`Gagal membaca ${fileObj.name}: ${e.message}`);
    }
  }, []);

  const process = useCallback(() => {
    setProcessing(true);
    setError(null);
    // Defer the heavy synchronous work one tick so the "Memproses..." state
    // actually paints first, instead of the click handler blocking the main
    // thread immediately (which on some mobile webviews looks like a freeze
    // / reload rather than a working spinner).
    setTimeout(() => {
    try {
      const dopSrc = processSource(parsed.dop || [], "Employee ID", "DOP");
      const hrSrc = processSource(parsed.hr || [], "Employee Number", "HR");
      const absensiSrc = processSource(parsed.absensi || [], "Employee No", "ABSENSI");
      const timestampSrc = processSource(parsed.timestamp || [], "Employee No", "TIMESTAMP");

      // Warn (rather than silently fail) if a source's ID column could not be
      // located at all — this is the #1 cause of a near-empty output.
      const missingId = [
        ["DOP", dopSrc, parsed.dop],
        ["File_HR", hrSrc, parsed.hr],
        ["Absensi", absensiSrc, parsed.absensi],
        ["Timestamp", timestampSrc, parsed.timestamp],
      ]
        .filter(([, src, rows]) => rows && rows.length > 0 && !src.resolvedIdKey)
        .map(([label]) => label);

      if (missingId.length > 0) {
        setError(
          `Kolom Employee ID tidak ketemu di file: ${missingId.join(", ")}. ` +
          `Cek nama header-nya lewat "Lihat nama kolom terdeteksi" di slot yang bersangkutan.`
        );
      }

      const master = outerJoinMaster(hrSrc.data, dopSrc.data);

      const absensiJoined = leftJoinMaster(absensiSrc.data, master).map((r) => ({
        ...r.merged,
        Record_Type: "Absensi",
        __matched: r.matched,
      }));
      const timestampJoined = leftJoinMaster(timestampSrc.data, master).map((r) => ({
        ...r.merged,
        Record_Type: "Timestamp",
        __matched: r.matched,
      }));

      const combined = [...absensiJoined, ...timestampJoined];
      const existingKeys = new Set();
      combined.forEach((row) => Object.keys(row).forEach((k) => existingKeys.add(k)));
      const columns = buildFinalColumns(existingKeys);

      const finalRows = combined.map((row) => {
        const out = {};
        columns.forEach((c) => (out[c] = row[c] !== undefined ? row[c] : null));
        out.__matched = row.__matched;
        return out;
      });

      const matchedCount = finalRows.filter((r) => r.__matched).length;

      setResult({ columns, rows: finalRows, matchedCount, totalCount: finalRows.length });
      // free the large raw row arrays now that they've been merged — only the
      // small header-name list (kept in headerPreview) is still needed
      setParsed({ dop: null, hr: null, absensi: null, timestamp: null });
    } catch (e) {
      setError(`Gagal memproses data: ${e.message}`);
    } finally {
      setProcessing(false);
    }
    }, 30);
  }, [parsed]);

  const reset = useCallback(() => {
    setFiles({ dop: null, hr: null, absensi: null, timestamp: null });
    setParsed({ dop: null, hr: null, absensi: null, timestamp: null });
    setHeaderPreview({});
    setStatus({});
    setResult(null);
    setError(null);
  }, []);

  const download = useCallback(() => {
    if (!result) return;
    const exportRows = result.rows.map((r) => {
      const { __matched, ...rest } = r;
      return rest;
    });
    const ws = XLSX.utils.json_to_sheet(exportRows, { header: result.columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Anomali_Deteksi");
    XLSX.writeFile(wb, "Anomali_Deteksi_Promotor.xlsx");
  }, [result]);

  const legend = useMemo(() => Object.entries(CATEGORY_LABEL), []);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.bg, color: C.text, fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "20px 24px" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, borderRadius: 8,
                backgroundColor: "rgba(245,166,35,0.12)", color: C.accent,
              }}
            >
              <Radio size={18} strokeWidth={2} />
            </div>
            <div>
              <h1 style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 600, letterSpacing: "-0.2px", color: C.text, margin: 0 }}>
                PROMOTOR ANOMALY MERGE
              </h1>
              <p style={{ fontSize: 12, color: C.textMuted, margin: "2px 0 0" }}>
                DOP · File_HR · Absensi · Timestamp → 1 tabel deteksi
              </p>
            </div>
          </div>
          {result && (
            <button
              type="button"
              onClick={reset}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                borderRadius: 8, border: `1px solid ${C.border}`,
                padding: "6px 12px", fontSize: 12, color: C.textMuted2,
                backgroundColor: "transparent", cursor: "pointer",
              }}
            >
              <RotateCcw size={13} /> Mulai ulang
            </button>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1152, margin: "0 auto", padding: "40px 24px" }}>
        {!result && (
          <>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 4px" }}>
                1. Upload 4 file sumber
              </h2>
              <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 24px" }}>
                Format .xlsx. Employee ID akan otomatis distandarkan sebagai kunci join.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {SLOTS.map((slot) => {
                  const st = status[slot.key];
                  const f = files[slot.key];
                  return (
                    <div
                      key={slot.key}
                      style={{
                        display: "flex", flexDirection: "column", justifyContent: "space-between",
                        borderRadius: 10, border: `1px solid ${C.border}`, borderTop: `3px solid ${slot.accent}`,
                        backgroundColor: C.panel, padding: 16,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted }}>
                            {slot.label}
                          </span>
                          {st === "ok" && <CheckCircle2 size={15} color={C.green} />}
                          {st === "error" && <AlertTriangle size={15} color={C.red} />}
                        </div>
                        <p style={{ fontSize: 13, color: C.text, margin: "0 0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f ? f.name : slot.file}
                        </p>
                        {st === "ok" && (
                          <button
                            onClick={() => setShowHeaders((s) => ({ ...s, [slot.key]: !s[slot.key] }))}
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              fontSize: 11, color: C.accent, padding: 0, marginBottom: 12, textAlign: "left",
                            }}
                          >
                            {showHeaders[slot.key] ? "Sembunyikan nama kolom" : "Lihat nama kolom terdeteksi"}
                          </button>
                        )}
                        {showHeaders[slot.key] && headerPreview[slot.key] && (
                          <ul
                            style={{
                              fontSize: 10, color: C.textMuted2, margin: "0 0 12px", padding: "8px 10px",
                              backgroundColor: C.panelAlt, borderRadius: 6, maxHeight: 140, overflowY: "auto",
                              listStyle: "none", fontFamily: "monospace", lineHeight: 1.6,
                            }}
                          >
                            {headerPreview[slot.key].map((h) => (
                              <li key={h}>{h}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <label
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          borderRadius: 8, border: `1px dashed ${C.borderHover}`,
                          padding: "8px 0", fontSize: 11, color: C.textMuted2, cursor: "pointer",
                        }}
                      >
                        <UploadCloud size={13} />
                        {f ? "Ganti file" : "Pilih file"}
                        <input
                          ref={(el) => (inputRefs.current[slot.key] = el)}
                          type="file"
                          accept=".xlsx,.xls"
                          style={{ display: "none" }}
                          onChange={(e) => handleFile(slot.key, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            {error && (
              <div
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  borderRadius: 8, border: "1px solid rgba(255,107,107,0.3)",
                  backgroundColor: "rgba(255,107,107,0.1)", padding: "12px 16px",
                  fontSize: 14, color: C.redText, marginBottom: 24,
                }}
              >
                <AlertTriangle size={15} style={{ marginTop: 2, flexShrink: 0 }} />
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={!allUploaded || processing}
              onClick={process}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                borderRadius: 8, border: "none",
                backgroundColor: C.accent, color: C.accentText,
                padding: "10px 20px", fontSize: 14, fontWeight: 600,
                cursor: !allUploaded || processing ? "not-allowed" : "pointer",
                opacity: !allUploaded || processing ? 0.3 : 1,
              }}
            >
              {processing ? "Memproses..." : "Gabungkan & deteksi"}
              <ChevronRight size={15} />
            </button>
          </>
        )}

        {result && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="Total baris" value={result.totalCount} />
              <StatCard label="Kolom output" value={result.columns.length} accent={C.accent} />
              <StatCard label="Match ke master" value={`${result.matchedCount}/${result.totalCount}`} accent={C.green} />
              <StatCard
                label="Tidak match"
                value={result.totalCount - result.matchedCount}
                accent={result.totalCount - result.matchedCount > 0 ? C.red : C.textMuted}
              />
            </div>

            {result.totalCount - result.matchedCount > 0 && (
              <div
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  borderRadius: 8, border: "1px solid rgba(245,166,35,0.3)",
                  backgroundColor: "rgba(245,166,35,0.1)", padding: "12px 16px",
                  fontSize: 14, color: C.amberText, marginBottom: 24,
                }}
              >
                <AlertTriangle size={15} style={{ marginTop: 2, flexShrink: 0 }} />
                Ada baris Employee ID yang tidak ketemu di File_HR/DOP (mis. prefix berbeda seperti INTR vs
                TRAD) — baris ini ditandai merah muda di kolom Employee ID pada tabel di bawah.
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              {legend.map(([key, label]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.textMuted2 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: CATEGORY_COLORS[key] }} />
                  {label}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button
                type="button"
                onClick={download}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  borderRadius: 8, border: "none",
                  backgroundColor: C.accent, color: C.accentText,
                  padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                <Download size={15} /> Download Excel
              </button>
            </div>

            {result.totalCount > 500 && (
              <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 8px" }}>
                Menampilkan 500 dari {result.totalCount} baris di layar (biar ringan). File Excel yang di-download tetap berisi semua baris.
              </p>
            )}
            <div style={{ overflow: "auto", borderRadius: 10, border: `1px solid ${C.border}`, maxHeight: "65vh" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: 11 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                  <tr>
                    {result.columns.map((col) => {
                      const cat = ID_COLS.includes(col) ? "id" : CATEGORY_MAP[col];
                      const color = CATEGORY_COLORS[cat] || "#9CA3AF";
                      return (
                        <th
                          key={col}
                          style={{
                            whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}`,
                            padding: "8px 12px", textAlign: "left", fontWeight: 600,
                            color: "#14181C", backgroundColor: color,
                          }}
                          title={CATEGORY_LABEL[cat]}
                        >
                          {col.replace(/_(HR|DOP|ABSENSI|TIMESTAMP)$/, "")}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 500).map((row, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 ? C.panel : C.panelAlt }}>
                      {result.columns.map((col) => (
                        <td
                          key={col}
                          style={{
                            whiteSpace: "nowrap", borderBottom: `1px solid ${C.tableBorder}`,
                            padding: "6px 12px",
                            color: col === "Employee ID" && !row.__matched ? C.redText : C.cellText,
                            fontWeight: col === "Employee ID" && !row.__matched ? 600 : 400,
                          }}
                        >
                          {formatCell(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, accent = "#E7EBEF" }) {
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, backgroundColor: C.panel, padding: 16 }}>
      <p style={{ fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted, margin: "0 0 4px" }}>
        {label}
      </p>
      <p style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: accent, margin: 0 }}>
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error boundary — if anything throws during render (a bad cell value, an
// unexpected data shape, etc.) this shows a clear message and a reset button
// instead of the app going blank / appearing to "reload from scratch".
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("AnomalyMerger crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", backgroundColor: "#0F1318", color: "#FFFFFF", fontFamily: "system-ui, sans-serif", padding: 24 }}>
          <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center" }}>
            <AlertTriangle size={28} color="#FF6B6B" style={{ marginBottom: 12 }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>Terjadi error saat memproses</h2>
            <p style={{ fontSize: 13, color: "#C7D0DA", margin: "0 0 20px" }}>
              {this.state.error?.message || String(this.state.error)}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              style={{
                borderRadius: 8, border: "none", backgroundColor: "#F5A623", color: "#14181C",
                padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Coba lagi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MergerTool() {
  return (
    <ErrorBoundary>
      <AnomalyMergerInner />
    </ErrorBoundary>
  );
}
