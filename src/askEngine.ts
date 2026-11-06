// askEngine.ts — v139. Mesin "Tanya Data" tanpa AI/API key: membaca pertanyaan bahasa Indonesia santai,
// lalu menghitung jawabannya dari data yang SEDANG tampil di dashboard (hasil processTimestamp/processAbsensi).
// Murni fungsi (tanpa React) supaya gampang dites. Semua angka dihitung ulang dari baris data, bukan dikarang.
//
// Batasan yang disengaja: hanya paham pola pertanyaan di bawah (ranking / jumlah / total / profil promotor).
// Pertanyaan di luar pola dijawab "belum paham" + contoh, bukan ditebak.

export type Person = {
  id: string; name: string; region: string; cluster: string; tipe: string; player: string;
  tenure: number | null; target: number | null;
  hasPenc: boolean; gar: number; nca: number; fresh: number; good: number; bad: number; unid: number;
  days: number; rows: number; flagRows: number; reasonRows: Record<string, number>;
  dayList: string[]; dayFlag: Record<string, Record<string, number>>;
};
export type Dataset = { people: Person[]; regions: string[]; clusters: string[]; hasPenc: boolean; nRows: number; nTs: number; nAb: number; period: { min: string; max: string } | null };
export type ChartKind = "bar" | "column" | "stacked" | "line" | "area" | "pie" | "donut" | "radar" | "scatter";
export type Chart = { labels: string[]; series: { name: string; values: number[] }[]; fmt: "num" | "pct"; kind?: ChartKind };

export const CHART_KIND_LABEL: Record<ChartKind, string> = {
  bar: "Batang (horizontal)", column: "Kolom (vertikal)", stacked: "Batang bertumpuk", line: "Garis", area: "Area",
  pie: "Pie", donut: "Donut", radar: "Radar", scatter: "Sebaran (scatter)",
};

// Jenis grafik yang masuk akal untuk data ini (pie butuh 1 seri tanpa nilai negatif, scatter butuh 2 seri, dst).
export function validKinds(c: Chart): ChartKind[] {
  const one = c.series.length === 1, many = c.series.length > 1;
  const nonNeg = c.series.every((s) => s.values.every((v) => v >= 0));
  const out: ChartKind[] = ["bar", "column"];
  if (many) out.push("stacked");
  out.push("line", "area");
  if (one && nonNeg && c.labels.length >= 2) out.push("pie", "donut");
  if (c.labels.length >= 3) out.push("radar");
  if (many) out.push("scatter");
  return out;
}
// Jenis yang diminta tidak cocok dengan datanya → turun ke yang terdekat (mis. pie untuk 2 seri → kolom).
export function resolveKind(c: Chart, want?: ChartKind | null): ChartKind {
  const k = want || c.kind || "bar";
  if (validKinds(c).includes(k)) return k;
  if (k === "pie" || k === "donut") return c.series.length > 1 ? "column" : "bar";
  if (k === "stacked" || k === "scatter") return "column";
  return c.labels.length > 6 ? "bar" : "column";
}
// Pie/donut: maksimal 10 irisan; sisanya digabung "Lainnya".
export function pieSlices(c: Chart): { name: string; value: number }[] {
  const v = c.series[0].values.map((value, i) => ({ name: c.labels[i], value })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  if (v.length <= 10) return v;
  return [...v.slice(0, 9), { name: "Lainnya", value: v.slice(9).reduce((a, b) => a + b.value, 0) }];
}
// Pilihan jenis grafik per objek Chart (dari dropdown di chat) — dipakai juga oleh PPT supaya samanya.
const chosenKind = new WeakMap<Chart, ChartKind>();
export const setChartKind = (c: Chart, k: ChartKind) => { chosenKind.set(c, k); };
export const effectiveKind = (c: Chart, requested?: ChartKind | null): ChartKind => resolveKind(c, chosenKind.get(c) || requested || c.kind);
export type Section = { title?: string; head: string[]; rows: string[][]; chart?: Chart };
export type Answer = { text: string; interpretasi?: string; cerita?: string; alts?: Alt[]; clarify?: boolean; sections?: Section[]; chips?: string[]; wantChart?: boolean; chartKind?: ChartKind; unknown?: boolean };

const REASON_LABEL: Record<string, string> = {
  zona: "Absensi <3x / zona tidak berurutan", identik: "GPS identik", koordinat: "Koordinat kosong",
  jauh: "GPS jauh dari toko", tokoNA: "GPS Toko N/A", status: "Status non-active", durasi: "Durasi shift bermasalah",
};

// Alasan anomali per baris — meniru isFlagged() di processTimestamp (punya checkinCount) & processAbsensi.
function rowReasons(r: any): string[] {
  const out: string[] = [];
  if (r.checkinCount !== undefined) {
    if (r.zoneNotCompliant) out.push("zona");
    if (r.gpsIdentical) out.push("identik");
    if (r.noCoord) out.push("koordinat");
    if (r.farFromStore) out.push("jauh");
    if (r.statusAnomaly) out.push("status");
  } else {
    if (r.noCoord) out.push("koordinat");
    if (r.farFromStore) out.push("jauh");
    if (r.noOutletData) out.push("tokoNA");
    if (r.statusAnomaly) out.push("status");
    if (r.durationIssue) out.push("durasi");
  }
  return out;
}

// Tanggal baris → "YYYY-MM-DD" WIB. Tanggal Excel yang terbaca UTC (mis. 2026-08-31T16:59:48Z = 1 Sep 00:00 WIB)
// digeser +7 jam lalu dibulatkan ke jam terdekat (selisih detik di file sumber), sama seperti fmtTanggal di dashboard.
function wibDay(v: any): string | null {
  if (!v) return null;
  const s = String(v);
  if (/T/.test(s) && /(Z|[+-]\d\d:?\d\d)$/.test(s)) {
    const t = Date.parse(s);
    if (!isFinite(t)) return null;
    const hr = 3600000;
    return new Date(Math.round((t + 7 * hr) / hr) * hr).toISOString().slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

export function buildDataset(tsAll: any[], abAll: any[], getTarget: (tenure: number) => number | null): Dataset {
  const map = new Map<string, Person>();
  const days = new Map<string, Set<string>>();
  const rows = [...(tsAll || []), ...(abAll || [])];
  let minD: string | null = null, maxD: string | null = null;
  for (const r of rows) {
    const d = wibDay(r.date);
    if (d) { if (!minD || d < minD) minD = d; if (!maxD || d > maxD) maxD = d; }
    if (!r.employee_id || r.employee_id === "-") continue;
    let p = map.get(r.employee_id);
    if (!p) {
      p = { id: r.employee_id, name: "", region: "", cluster: "", tipe: "", player: "", tenure: null, target: null, hasPenc: false, gar: 0, nca: 0, fresh: 0, good: 0, bad: 0, unid: 0, days: 0, rows: 0, flagRows: 0, reasonRows: {}, dayList: [], dayFlag: {} };
      map.set(r.employee_id, p); days.set(r.employee_id, new Set());
    }
    if (!p.name && r.employee_name && r.employee_name !== "-") p.name = r.employee_name;
    if (!p.region && r.region && r.region !== "-") p.region = r.region;
    if (!p.cluster && r.cluster && r.cluster !== "-") p.cluster = r.cluster;
    if (!p.tipe && r.promotorType) p.tipe = r.promotorType;
    if (!p.player && r.outletPlayer) p.player = r.outletPlayer;
    if (p.tenure == null && r.tenureMonths != null) p.tenure = r.tenureMonths;
    const pc = r.pencapaian;
    if (!p.hasPenc && pc && pc.ncaGAR != null) {
      p.hasPenc = true; p.gar = pc.ncaGAR || 0; p.nca = pc.ncaNCA || 0; p.fresh = pc.ncaFresh || 0;
      p.good = pc.ncaGoodSRC || 0; p.bad = pc.ncaBadSRC || 0; p.unid = pc.ncaUnidentified || 0;
    }
    if (r.date) { const d = wibDay(r.date); if (d) days.get(r.employee_id)!.add(d); }
    p.rows++;
    const why = rowReasons(r);
    if (why.length) {
      p.flagRows++; why.forEach((k) => { p.reasonRows[k] = (p.reasonRows[k] || 0) + 1; });
      const dd = wibDay(r.date);
      if (dd) { const f = p.dayFlag[dd] || (p.dayFlag[dd] = { _all: 0 }); f._all++; why.forEach((k) => { f[k] = (f[k] || 0) + 1; }); }
    }
  }
  const people = [...map.values()];
  for (const p of people) {
    p.dayList = [...days.get(p.id)!];
    p.days = p.dayList.length;
    p.target = p.tenure != null ? getTarget(p.tenure) : null;
    if (!p.name) p.name = p.id;
    if (!p.region) p.region = "Tanpa Region";
    if (!p.cluster) p.cluster = "Tanpa Cluster";
  }
  return {
    people, nRows: rows.length, nTs: (tsAll || []).length, nAb: (abAll || []).length, period: minD && maxD ? { min: minD, max: maxD } : null, hasPenc: people.some((p) => p.hasPenc),
    regions: [...new Set(people.map((p) => p.region))], clusters: [...new Set(people.map((p) => p.cluster))],
  };
}

// ── helper format ──
const fmt = (n: number | null | undefined) => (n == null || !isFinite(n) ? "-" : Math.round(n).toLocaleString("id-ID"));
const fmt1 = (n: number | null | undefined) => (n == null || !isFinite(n) ? "-" : n.toLocaleString("id-ID", { maximumFractionDigits: 1 }));
const pct = (n: number | null | undefined) => (n == null || !isFinite(n) ? "-" : fmt1(n) + "%");
const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9%<>\s./-]/g, " ").replace(/\s+/g, " ").trim();
const hasWord = (q: string, re: RegExp) => re.test(q);

// ── belajar dari koreksi pengguna (disimpan di browser, lihat askLearn.ts) ──
export type Lesson = { from: string; to: string };   // kata/frasa pengguna → frasa baku yang dimengerti mesin
export type Alt = { label: string; question: string; lesson?: Lesson };
const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Padanan nama wilayah bawaan (bahasa Indonesia / singkatan / ejaan lain → nama region di data).
const ALIASES: [RegExp, string][] = [
  [/\b(sumatera|sumatra) utara\b|\bnorth(ern)? sumater?a\b|\bsumut\b/g, "northern sumatra"],
  [/\b(sumatera|sumatra) selatan\b|\bsouth(ern)? sumater?a\b|\bsumsel\b/g, "southern sumatra"],
  [/\bjawa barat\b|\bjabar\b/g, "west java"],
  [/\bjawa tengah\b|\bjateng\b/g, "central java"],
  [/\bjawa timur\b|\bjatim\b/g, "east java"],
  [/\bnusa tenggara\b|\bntb\b|\bntt\b|(?<!bali )\bnusra\b/g, "bali nusra"],
  [/\bsumatera\b/g, "sumatra"],
];
function applyAliases(q0: string): string {
  let q = q0;
  for (const [re, to] of ALIASES) q = q.replace(re, to);
  for (const [, to] of ALIASES) q = q.replace(new RegExp("(" + to + ")( " + to + ")+", "g"), "$1");
  return q.replace(/\s+/g, " ").trim();
}
function applyLessons(raw: string, lessons?: Lesson[]): { q: string; used: Lesson[] } {
  let q = applyAliases(norm(raw));
  const used: Lesson[] = [];
  for (const l of [...(lessons || [])].sort((a, b) => b.from.length - a.from.length)) {
    const re = new RegExp("(^|\\s)" + escRe(l.from) + "(?=\\s|$)", "g");
    if (l.from && re.test(q)) { q = q.replace(re, "$1" + l.to); used.push(l); }
  }
  q = q.replace(/\b(region|cluster) \1\b/g, "$1").replace(/\s+/g, " ").trim();
  return { q, used };
}
const tipeLabel = (t: string) => (t === "In Store Promotor" ? "In Store" : t === "Out Store Promotor" ? "Out Store" : t || "-");

// ── agregat per grup ──
type Group = { key: string; label: string; people: Person[] };
type Agg = {
  n: number; nData: number; gar: number; nca: number; fresh: number; good: number; bad: number; unid: number;
  capai: number; tgt: number; pctCapai: number | null; ach: number | null; anomaliPeople: number; kejadian: number; pctAnomali: number | null; hari: number | null;
};
function aggregate(people: Person[], reason: string | null): Agg {
  const withData = people.filter((p) => p.hasPenc);
  const sum = (f: (p: Person) => number) => withData.reduce((a, p) => a + f(p), 0);
  const nRated = withData.filter((p) => p.target != null);
  const capai = nRated.filter((p) => p.nca >= (p.target as number)).length;
  const tgt = nRated.reduce((a, p) => a + (p.target as number), 0);
  const isF = (p: Person) => (reason ? (p.reasonRows[reason] || 0) > 0 : p.flagRows > 0);
  const flagged = people.filter(isF);
  return {
    n: people.length, nData: withData.length, gar: sum((p) => p.gar), nca: sum((p) => p.nca), fresh: sum((p) => p.fresh),
    good: sum((p) => p.good), bad: sum((p) => p.bad), unid: sum((p) => p.unid),
    capai, tgt, pctCapai: nRated.length ? (capai / nRated.length) * 100 : null,
    ach: tgt ? (nRated.reduce((a, p) => a + p.nca, 0) / tgt) * 100 : null,
    anomaliPeople: flagged.length,
    kejadian: people.reduce((a, p) => a + (reason ? p.reasonRows[reason] || 0 : p.flagRows), 0),
    pctAnomali: people.length ? (flagged.length / people.length) * 100 : null,
    hari: people.length ? people.reduce((a, p) => a + p.days, 0) / people.length : null,
  };
}

type MetricKey = "gar" | "nca" | "fresh" | "good" | "bad" | "unid" | "promotor" | "anomali" | "kejadian" | "pctAnomali" | "capai" | "pctCapai" | "ach" | "hari";
const METRICS: Record<MetricKey, { label: string; get: (a: Agg, avg: boolean) => number | null; f: (n: number | null) => string; needsPenc?: boolean; good: "high" | "low"; countLike?: boolean }> = {
  gar: { label: "GAR", get: (a, avg) => (avg ? (a.nData ? a.gar / a.nData : null) : a.gar), f: (n) => fmt(n), needsPenc: true, good: "high" },
  nca: { label: "NCA", get: (a, avg) => (avg ? (a.nData ? a.nca / a.nData : null) : a.nca), f: (n) => fmt(n), needsPenc: true, good: "high" },
  fresh: { label: "Fresh IMEI", get: (a) => a.fresh, f: (n) => fmt(n), needsPenc: true, good: "high" },
  good: { label: "Good SRC", get: (a) => a.good, f: (n) => fmt(n), needsPenc: true, good: "high" },
  bad: { label: "Bad SRC", get: (a) => a.bad, f: (n) => fmt(n), needsPenc: true, good: "low" },
  unid: { label: "Unidentified IMEI", get: (a) => a.unid, f: (n) => fmt(n), needsPenc: true, good: "low" },
  promotor: { label: "jumlah promotor", get: (a) => a.n, f: (n) => fmt(n), good: "high", countLike: true },
  anomali: { label: "promotor beranomali", get: (a) => a.anomaliPeople, f: (n) => fmt(n), good: "low", countLike: true },
  kejadian: { label: "kejadian anomali", get: (a) => a.kejadian, f: (n) => fmt(n), good: "low", countLike: true },
  pctAnomali: { label: "% promotor beranomali", get: (a) => a.pctAnomali, f: (n) => pct(n), good: "low" },
  capai: { label: "promotor capai target NCA", get: (a) => a.capai, f: (n) => fmt(n), needsPenc: true, good: "high", countLike: true },
  pctCapai: { label: "% promotor capai target NCA", get: (a) => a.pctCapai, f: (n) => pct(n), needsPenc: true, good: "high" },
  ach: { label: "NCA vs target (%)", get: (a) => a.ach, f: (n) => pct(n), needsPenc: true, good: "high" },
  hari: { label: "rata-rata hari aktif", get: (a) => a.hari, f: (n) => fmt1(n), good: "high" },
};

// ── parsing pertanyaan ──
type Dim = "region" | "cluster" | "promotor" | "tipe" | "player";
type Parsed = {
  q: string; metrics: MetricKey[]; dims: Dim[]; order: "desc" | "asc" | null; topN: number | null; avg: boolean;
  count: boolean; ask: "ranking" | "count" | "total" | "profile" | null; reason: string | null;
  tipe: string | null; player: string | null; region: string | null; cluster: string | null;
  cmp: { op: ">" | "<"; v: number } | null; belumCapai: boolean; masukTop: boolean; note?: string; wantChart: boolean; group: boolean; chartKind: ChartKind | null; daily: boolean; byReason: boolean;
};

const WORDNUM: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10 };

function detectMetrics(q: string): MetricKey[] {
  const m: MetricKey[] = [];
  const anomali = hasWord(q, /anomal|janggal|bermasalah|mencurigakan|pelanggaran/);
  const persen = hasWord(q, /persen|%|persentase|rasio/);
  if (hasWord(q, /kejadian/) && anomali) m.push("kejadian");
  else if (anomali) m.push(persen ? "pctAnomali" : "anomali");
  if (hasWord(q, /nca vs target|pencapaian nca|\bach(ievement)?\b/) ) m.push("ach");
  else if (hasWord(q, /capai|tercapai|target/) && !(hasWord(q, /\bgar\b|\bnca\b/) && !hasWord(q, /capai|tercapai/))) m.push(persen ? "pctCapai" : "capai");
  if (hasWord(q, /\bgar\b/)) m.push("gar");
  if (hasWord(q, /\bnca\b/)) m.push("nca");
  if (hasWord(q, /fresh/)) m.push("fresh");
  if (hasWord(q, /good src|\bgood\b/)) m.push("good");
  if (hasWord(q, /bad src|\bbad\b/)) m.push("bad");
  if (hasWord(q, /unidentified|unident/)) m.push("unid");
  if (hasWord(q, /hari aktif|aktivitas|rajin/)) m.push("hari");
  return [...new Set(m)];
}

function detectKind(q: string, chartWord: boolean): ChartKind | null {
  if (/donut|donat|doughnut/.test(q)) return "donut";
  if (/\bpie\b|pizza|lingkaran|\bkue\b|diagram pai/.test(q)) return "pie";
  if (/bertumpuk|\bstack/.test(q)) return "stacked";
  if (/radar|laba.?laba|jaring/.test(q)) return "radar";
  if (/scatter|sebaran|titik.?titik|diagram titik/.test(q)) return "scatter";
  if (/(grafik|chart|diagram) area|area chart|\bgrafik bidang/.test(q)) return "area";
  if (/\bgaris\b|\bline\b|\btren\b|\btrend\b/.test(q)) return "line";
  if (/kolom|vertikal|column/.test(q)) return "column";
  if (/batang|\bbar\b|horizontal/.test(q)) return "bar";
  if (chartWord && /komposisi|proporsi|porsi|\bshare\b/.test(q)) return "pie";
  return null;
}

// Cocok sebagian: kata di pertanyaan (>=4 huruf) sama dengan SATU kata dari nama region/cluster, dan hanya 1 yang punya kata itu.
const NOT_NAME = new Set(["region", "cluster", "wilayah", "klaster", "store", "promotor", "player", "mana", "manakah", "yang", "paling", "tinggi", "rendah", "berapa", "jumlah", "total", "tanpa"]);
function partialMatch(q: string, names: string[]): { name: string; word: string } | null {
  const words = q.split(" ").filter((w) => w.length >= 4 && !NOT_NAME.has(w));
  for (const w of words) {
    const hits = names.filter((n) => n.startsWith("Tanpa ") ? false : norm(n).split(/[\s-]+/).includes(w));
    if (hits.length === 1) return { name: hits[0], word: w };
  }
  return null;
}

const NAME_SKIP = new Set(["mana", "manakah", "yang", "paling", "tinggi", "rendah", "berapa", "jumlah", "total", "ya", "dong", "donk", "deh", "apa", "siapa", "dengan", "dan", "atau", "untuk", "punya", "lebih", "kurang", "banyak", "sedikit", "terbaik", "terburuk", "tertinggi", "terendah", "terbanyak", "masuk", "top", "per", "saja", "aja", "ini", "itu", "nya", "kok", "sih", "bisa", "ada", "beranomali", "anomali", "gar", "nca", "capai", "achieve", "tidak", "belum", "sudah", "udah", "bagaimana", "gimana", "bagus", "jelek", "tinggi", "rendah", "di", "ke", "dari"]);

function parseQuestion(raw: string, ds: Dataset): Parsed {
  const q = norm(raw);
  const p: Parsed = { q, metrics: detectMetrics(q), dims: [], order: null, topN: null, avg: false, count: false, ask: null, reason: null, tipe: null, player: null, region: null, cluster: null, cmp: null, belumCapai: false, masukTop: false, wantChart: false, group: false, chartKind: null, daily: false, byReason: false };

  const chartWord = /grafik|chart|diagram|visualis|\bplot\b/.test(q);
  p.chartKind = detectKind(q, chartWord);
  p.wantChart = chartWord || p.chartKind !== null;
  p.daily = /per hari|harian|tiap hari|setiap hari|per tanggal|hari ke hari|\btren\b|\btrend\b|perkembangan/.test(q);
  p.byReason = /per jenis|jenis anomali|jenis-jenis|kategori anomali|macam anomali|penyebab|komposisi anomali|proporsi anomali|per kategori/.test(q);
  const why = /\b(kenapa|mengapa|sebab|alasan|kok)\b|bisa banyak|apa (saja )?(yang )?(bikin|menyebabkan)/.test(q) && /anomali/.test(q);
  if (why) p.byReason = true;
  p.group = p.wantChart || /\bper\b|tiap|setiap|masing.?masing|\bby\b|bandingkan|perbandingan|dibandingkan/.test(q);

  // dimensi
  if (hasWord(q, /\bregion\b|\bregional\b|wilayah|\bregion-?region\b/)) p.dims.push("region");
  if (hasWord(q, /\bcluster\b|\bklaster\b/)) p.dims.push("cluster");
  const personRank = /\bsiapa\b|nama promotor|promotor (mana|manakah)|promotor (yang )?(paling|tertinggi|terendah|terbanyak)|\btop \d+ promotor|\d+ promotor (teratas|terbawah|dengan|paling|yang)|promotor .*(tertinggi|terendah|terbanyak|tersedikit|teratas|terbawah)/;
  if (personRank.test(q) && !/berapa (banyak )?(jumlah )?promotor/.test(q)) p.dims.push("promotor");
  if (hasWord(q, /per tipe|tipe promotor (mana|manakah)|in store atau out store|in store vs out store/)) p.dims.push("tipe");
  if (hasWord(q, /tipe outlet|per player|player atau non player/)) p.dims.push("player");

  // urutan
  const asc = /terendah|paling rendah|terkecil|tersedikit|paling sedikit|terbawah|paling kecil|minimum|terkecil/.test(q);
  const desc = /tertinggi|paling tinggi|terbesar|terbanyak|paling banyak|teratas|paling besar|maksimum|\btop\b|paling/.test(q);
  const worst = /terburuk|terparah|paling parah|paling buruk|parah/.test(q);
  const best = /terbaik|paling bagus|paling oke/.test(q);
  const primary = p.metrics[0];
  if (asc) p.order = "asc";
  else if (worst) p.order = primary && METRICS[primary].good === "low" ? "desc" : primary ? "asc" : "desc";
  else if (best) p.order = primary && METRICS[primary].good === "low" ? "asc" : "desc";
  else if (desc) p.order = "desc";

  // top N
  const tn = q.match(/\btop\s*(\d+)\b|\b(\d+)\s*(teratas|terbawah|besar|tertinggi|terendah|terbanyak)\b|\b(\d+)\s+(promotor|region|cluster)\b/);
  if (tn) p.topN = parseInt(tn[1] || tn[2] || tn[4], 10);
  else {
    const w = q.match(/\btop\s*(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b|\b(satu|dua|tiga|empat|lima|sepuluh)\s*(teratas|terbawah|tertinggi|terendah|terbanyak)\b/);
    if (w) p.topN = WORDNUM[w[1] || w[2]];
  }
  p.masukTop = /masuk\s+(ke\s+)?(dalam\s+)?top|termasuk\s+top|ada di top|di top/.test(q);

  p.avg = /rata-rata|rata rata|rerata|average|\bavg\b|per promotor/.test(q);
  p.count = /\bberapa\b|\bjumlah\b|\bbanyak(nya)?\b|\bhitung\b|\bcount\b/.test(q);

  // alasan anomali spesifik
  if (/jauh.*(toko|outlet)|gps jauh|di luar toko/.test(q)) p.reason = "jauh";
  else if (/identik|kembar|sama persis/.test(q)) p.reason = "identik";
  else if (/<\s*3x|kurang dari 3|zona|comply|tidak comply|absen(si)? (kurang|<)/.test(q)) p.reason = "zona";
  else if (/non.?active|resign|status/.test(q)) p.reason = "status";
  else if (/durasi|clock.?out|jam kerja|shift/.test(q)) p.reason = "durasi";
  else if (/koordinat kosong|gps kosong|tanpa koordinat/.test(q)) p.reason = "koordinat";
  else if (/toko n\/a|gps toko/.test(q)) p.reason = "tokoNA";
  if (p.reason && !p.metrics.some((m) => m === "anomali" || m === "kejadian" || m === "pctAnomali")) p.metrics.unshift("anomali");

  // filter
  if (/non.?player/.test(q)) p.player = "Non Player"; else if (/\bplayer\b/.test(q)) p.player = "Player";
  if (/\bin.?store\b|\bsgs\b|\bspg\b/.test(q) && !/in.?store (atau|vs|dan) out.?store/.test(q)) p.tipe = "In Store Promotor";
  else if (/\bout.?store\b|\bsds\b|\bds\b/.test(q) && !/in.?store (atau|vs|dan) out.?store/.test(q)) p.tipe = "Out Store Promotor";
  const byLen = (a: string, b: string) => b.length - a.length;
  const inQ = (name: string) => { const n = norm(name); return n.length >= 3 && new RegExp("(^|\\s)" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)").test(q); };
  p.region = [...ds.regions].sort(byLen).find(inQ) || null;
  p.cluster = [...ds.clusters].sort(byLen).find(inQ) || null;
  // Cocok sebagian (mis. "jakarta" → JAKARTA BANTEN). Cluster hanya dicocokkan sebagian kalau region TIDAK ketemu,
  // supaya "di jakarta" tidak menyempit diam-diam ke satu cluster.
  if (!p.region && !p.cluster) {
    const r = partialMatch(q, ds.regions);
    if (r) { p.region = r.name; p.note = `Aku artikan "${r.word}" sebagai region ${r.name}.`; }
    else {
      const c = partialMatch(q, ds.clusters);
      if (c) { p.cluster = c.name; p.note = `Aku artikan "${c.word}" sebagai cluster ${c.name}.`; }
    }
  }

  // nama yang disebut setelah "region/cluster" tapi tidak ada di data → jangan diam-diam abaikan
  if (!p.region && !p.cluster) {
    const m = q.match(/\b(?:region|cluster|wilayah)\s+([a-z][a-z0-9-]{2,})/);
    const SKIP = NAME_SKIP;
    if (m && !SKIP.has(m[1])) p.note = `Aku tidak menemukan "${m[1]}" sebagai region/cluster di data ini, jadi jawabannya untuk seluruh data yang tampil. Cek ejaannya, atau klik 👎 supaya kutawarkan pilihan yang mirip.`;
  }

  // "region medan": Medan adalah nama cluster, bukan region → pakai region induknya (seluruh cluster di region itu)
  if (/\bregion\b|\bwilayah\b/.test(q) && !/\bcluster\b|\bklaster\b/.test(q) && p.cluster && !p.region) {
    const parent = ds.people.find((x) => x.cluster === p.cluster)?.region;
    if (parent) { p.note = `"${p.cluster}" adalah cluster di region ${parent}. Karena kamu menyebut region, aku pakai seluruh region ${parent} (bukan hanya cluster itu). Kalau maksudmu cluster-nya saja, tulis "cluster ${p.cluster}".`; p.region = parent; p.cluster = null; }
  }

  // pembanding angka: "di atas 150", "kurang dari 50"
  const gt = q.match(/(?:di ?atas|lebih dari|lebih besar dari|minimal|>=?|melebihi|lewat)\s*(\d[\d.,]*)/);
  const lt = q.match(/(?:di ?bawah|kurang dari|lebih kecil dari|maksimal|<=?)\s*(\d[\d.,]*)/);
  const num = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));
  if (gt) p.cmp = { op: ">", v: num(gt[1]) }; else if (lt) p.cmp = { op: "<", v: num(lt[1]) };
  p.belumCapai = /belum (capai|tercapai|mencapai|memenuhi)|tidak (capai|tercapai)|gagal capai|di bawah target/.test(q);
  return p;
}

// ── eksekusi ──
const NO_PENC = "Data GAR/NCA belum ada di CSV yang di-upload (atau belum ter-join), jadi angka GAR/NCA/target belum bisa dihitung. Gabungkan file GAR/NCA lewat merger tool lalu upload ulang.";

export const SUGGESTIONS = [
  "Region dan cluster mana yang paling tinggi GAR-nya?",
  "Berapa region yang masuk top 3 anomali?",
  "Region mana yang anomalinya paling banyak?",
  "Kira-kira region mana yang achieve target bulan ini?",
  "Berapa promotor yang belum capai target NCA?",
  "Siapa 5 promotor dengan GAR tertinggi?",
  "Berapa total promotor In Store dan Out Store?",
  "Buat grafik NCA vs target per region",
  "Grafik pie komposisi anomali per jenis",
  "Grafik garis tren anomali per hari",
  "Buat PPT status achieve per region",
];

// Soal-soal baku untuk "buat PPT ringkasan" (kalau tidak ada topik & belum ada jawaban yang dikumpulkan).
export const PPT_PRESET = [
  "region mana yang achieve bulan ini",
  "region mana yang promotor beranomalinya paling banyak",
  "region dan cluster mana yang paling tinggi GAR nya",
  "siapa 5 promotor dengan NCA tertinggi",
  "berapa total promotor in store dan out store",
];

// Deteksi permintaan PPT. topic = bagian pertanyaan setelah kata-kata perintah dibuang ("buat ppt status achieve per region" → "status achieve per region").
export function pptRequest(raw: string): { topic: string; addLast: boolean } | null {
  const q = norm(raw);
  if (!/\b(ppt|pptx|powerpoint|slide|slides|presentasi|deck)\b/.test(q)) return null;
  const addLast = /\b(tambah(kan|in)?|masuk(kan|in)?|simpan)\b/.test(q);
  const t = q
    .replace(/\b(ppt|pptx|powerpoint|slide|slides|presentasi|deck|buat(kan)?|bikin(kan)?|tolong|dong|ya+|generate|download|unduh|export|ekspor|tentang|mengenai|soal|untuk|berisi|isinya|isi|dalam bentuk|jadi|ke dalam|ke|masuk(kan|in)?|tambah(kan|in)?|simpan|dari|hasil|jawaban|tadi|ini|itu|yang|aku|saya|mau|ingin|minta|kasih|grafik|ringkasan|rangkuman|lengkap|overview|umum|semua|buatin|bikinin|buatkan|bisa|gak|ga|nggak|enggak|tidak|apa|kan|donk|deh|sih|nih|file|data|laporan|report|bentuk|format|berupa|sebagai|bisakah|mohon|please|plis|saja|aja|nya|di|kah)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  return { topic: t.length >= 3 ? t : "", addLast };
}

export function periodText(ds: Dataset): string | null {
  const per = periodInfo(ds);
  return per ? per.text.replace(/^data /, "") : null;
}

function groupBy(people: Person[], dim: Dim): Group[] {
  const m = new Map<string, Group>();
  for (const p of people) {
    const key = dim === "region" ? p.region : dim === "cluster" ? p.region + " | " + p.cluster : dim === "tipe" ? p.tipe || "Lainnya" : dim === "player" ? p.player || "Tidak ada info" : p.id;
    const label = dim === "cluster" ? `${p.cluster} (${p.region})` : dim === "tipe" ? tipeLabel(p.tipe) : dim === "promotor" ? p.name : key;
    let g = m.get(key);
    if (!g) { g = { key, label, people: [] }; m.set(key, g); }
    g.people.push(p);
  }
  return [...m.values()];
}

const DIM_LABEL: Record<Dim, string> = { region: "Region", cluster: "Cluster", promotor: "Promotor", tipe: "Tipe promotor", player: "Tipe outlet" };

function scopeText(p: Parsed): string {
  return [p.region && `region ${p.region}`, p.cluster && `cluster ${p.cluster}`, p.tipe && tipeLabel(p.tipe), p.player].filter(Boolean).join(", ");
}

function applyFilters(ds: Dataset, p: Parsed): Person[] {
  return ds.people.filter((x) =>
    (!p.region || x.region === p.region) && (!p.cluster || x.cluster === p.cluster) &&
    (!p.tipe || x.tipe === p.tipe) && (!p.player || x.player === p.player));
}

function sortGroups(rows: { g: Group; a: Agg; v: number | null }[], order: "desc" | "asc") {
  return rows.filter((r) => r.v != null).sort((x, y) => (order === "desc" ? (y.v as number) - (x.v as number) : (x.v as number) - (y.v as number)) || y.a.n - x.a.n);
}

function rankingSection(title: string, dim: Dim, groups: Group[], mk: MetricKey, p: Parsed, order: "desc" | "asc", limit: number): { sec: Section; top: { g: Group; a: Agg; v: number | null }[] } {
  const M = METRICS[mk];
  const rows = groups.map((g) => { const a = aggregate(g.people, p.reason); return { g, a, v: M.get(a, p.avg) }; });
  const sorted = sortGroups(rows, order);
  const shown = sorted.slice(0, limit);
  const byPerson = dim === "promotor";
  const extraCols = byPerson
    ? { head: ["Wilayah", "Tipe"], cell: (a: Agg, g: Group) => [`${g.people[0].cluster} · ${g.people[0].region}`, tipeLabel(g.people[0].tipe)] }
    : mk === "anomali" || mk === "kejadian"
      ? { head: ["Promotor", "% Beranomali"], cell: (a: Agg) => [fmt(a.n), pct(a.pctAnomali)] }
      : mk === "pctAnomali" ? { head: ["Promotor", "Beranomali"], cell: (a: Agg) => [fmt(a.n), fmt(a.anomaliPeople)] }
      : mk === "promotor" ? { head: ["Beranomali"], cell: (a: Agg) => [fmt(a.anomaliPeople)] }
      : { head: ["Promotor"], cell: (a: Agg) => [fmt(a.n)] };
  const sec: Section = {
    title,
    head: ["#", DIM_LABEL[dim], M.label + (p.avg && (mk === "gar" || mk === "nca") ? " (rata-rata)" : ""), ...extraCols.head],
    rows: shown.map((r, i) => [String(i + 1), r.g.label, M.f(r.v), ...extraCols.cell(r.a, r.g)]),
    chart: !shown.length ? undefined : mk === "ach"
      ? { kind: "column" as ChartKind, labels: shown.map((r) => r.g.label), series: [{ name: "NCA", values: shown.map((r) => r.a.nca) }, { name: "Target", values: shown.map((r) => r.a.tgt) }], fmt: "num" }
      : { kind: "bar" as ChartKind, labels: shown.map((r) => r.g.label), series: [{ name: M.label, values: shown.map((r) => Math.round((r.v as number) * 10) / 10) }], fmt: mk === "pctAnomali" || mk === "pctCapai" ? "pct" : "num" },
  };
  return { sec, top: sorted };
}

// Nama wilayah yang tidak ketemu persis / ambigu → minta pengguna memilih, jangan menjawab diam-diam untuk seluruh data.
function lev(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function clarifyName(q: string, ds: Dataset): Answer | null {
  const rep = (w: string, to: string) => q.replace(new RegExp("(^|\\s)" + escRe(w) + "(?=\\s|$)", "g"), "$1" + to).replace(/\b(region|cluster) \1\b/g, "$1");
  const toks = (n: string) => norm(n).split(/[\s-]+/).filter((t) => t.length >= 3);
  const regions = ds.regions.filter((n) => !n.startsWith("Tanpa "));
  const clusters = ds.clusters.filter((n) => !n.startsWith("Tanpa "));
  let w = "", cand: { kind: "region" | "cluster"; name: string }[] = [], ambiguous = false;
  const m = q.match(/\b(?:region|cluster|wilayah)\s+([a-z][a-z0-9-]{2,})/);
  if (m && !NAME_SKIP.has(m[1]) && !NOT_NAME.has(m[1])) {
    const x = m[1];
    const near = (t: string) => t === x || (x.length >= 4 && t.length >= 4 && (t.startsWith(x) || x.startsWith(t))) || (x.length >= 5 && t.length >= 5 && lev(t, x) <= 2);
    const rg = regions.filter((n) => toks(n).some(near)).map((name) => ({ kind: "region" as const, name }));
    const cl = clusters.filter((n) => toks(n).some(near)).map((name) => ({ kind: "cluster" as const, name }));
    if (rg.length + cl.length) { w = x; cand = [...rg, ...cl]; }
  }
  if (!w) {
    // kata yang cocok dengan >1 region (mis. "sumatra", "java") tanpa kata penjelas lain
    for (const x of q.split(" ").filter((t) => t.length >= 4 && !NOT_NAME.has(t) && !STOP.has(t) && !NAME_SKIP.has(t))) {
      const rg = regions.filter((n) => toks(n).includes(x));
      if (rg.length >= 2) { w = x; cand = rg.map((name) => ({ kind: "region" as const, name })); ambiguous = true; break; }
    }
  }
  if (!w || !cand.length) return null;
  const list = cand.slice(0, 6);
  const alts: Alt[] = list.map((c) => ({ label: `${c.kind === "region" ? "Region" : "Cluster"} ${c.name}`, question: rep(w, `${c.kind} ${norm(c.name)}`), lesson: { from: w, to: `${c.kind} ${norm(c.name)}` } }));
  return { text: ambiguous ? `Kata "${w}" cocok dengan beberapa region. Maksudmu yang mana?` : `Aku belum menemukan "${w}" persis di data ini. Maksudmu yang mana? Pilihanmu akan kuingat.`, alts, clarify: true };
}

export function answerQuestion(raw0: string, ds: Dataset, scope?: string, lessons?: Lesson[]): Answer {
  const { q: raw, used } = applyLessons(raw0, lessons);
  if (ds.people.length && raw) {
    const pq = parseQuestion(raw, ds);
    if (!pq.region && !pq.cluster) { const c = clarifyName(norm(raw), ds); if (c) return c; }
  }
  const a = answerCore(raw, ds, scope);
  const parsed = ds.people.length && String(raw || "").trim() ? parseQuestion(raw, ds) : null;
  if (used.length) {
    const ingat = used.map((l) => `"${l.from}" = ${l.to}`).join(", ");
    a.interpretasi = (a.interpretasi ? a.interpretasi + " " : "") + `Aku ingat dari koreksimu sebelumnya: ${ingat}.`;
  }
  if (parsed?.note) a.interpretasi = a.interpretasi ? parsed.note + " " + a.interpretasi : parsed.note;
  if (parsed?.wantChart) a.wantChart = true;
  if (parsed?.chartKind) a.chartKind = parsed.chartKind;
  return a;
}

function answerCore(raw: string, ds: Dataset, scope?: string): Answer {
  const text0 = String(raw || "").trim();
  if (!text0) return { text: "Tulis pertanyaannya dulu ya.", chips: SUGGESTIONS.slice(0, 3) };
  if (!ds.people.length) return { text: "Belum ada data promotor yang bisa dihitung. Upload CSV hasil merge dulu." };
  const p = parseQuestion(text0, ds);
  const q = p.q;
  const scopeNote = scope && scope !== "Nasional" ? ` (data yang tampil: ${scope})` : "";

  if (/^(help|bantuan|tolong|bisa tanya apa|apa saja|contoh|menu)\b|bisa (nanya|tanya) apa/.test(q)) {
    return { text: "Aku bisa jawab pertanyaan seputar GAR, NCA, target, jumlah promotor, dan anomali — per region, cluster, tipe promotor (In/Out Store), atau per promotor. Contoh:", chips: SUGGESTIONS };
  }

  // 1) profil promotor: cocokkan ID atau nama lengkap
  const prof = findPerson(q, ds);
  if (prof && !(p.dims.length && p.order)) return profileAnswer(prof);

  const people = applyFilters(ds, p);
  if (!people.length) return { text: `Tidak ada promotor yang cocok dengan filter ${scopeText(p) || "itu"}${scopeNote}.` };
  const primary: MetricKey | null = p.metrics[0] || null;
  if (primary && METRICS[primary].needsPenc && !ds.hasPenc) return { text: NO_PENC };

  if (p.reason) {
    const needTs = p.reason === "zona" || p.reason === "identik";
    const needAb = p.reason === "durasi" || p.reason === "tokoNA";
    if (needTs && !ds.nTs) return { text: `Anomali "${REASON_LABEL[p.reason]}" dihitung dari data Timestamp, dan CSV yang di-upload belum berisi baris Timestamp, jadi belum bisa dijawab.` };
    if (needAb && !ds.nAb) return { text: `Anomali "${REASON_LABEL[p.reason]}" dihitung dari data Absensi, dan CSV yang di-upload belum berisi baris Absensi, jadi belum bisa dijawab.` };
  }

  // 1a) tren harian & komposisi anomali per jenis (biasanya untuk grafik garis / pie)
  if (p.byReason && (!p.dims.length || p.region || p.cluster || (p.q.match(/\b(kenapa|mengapa|sebab|alasan|kok)\b/) && !/\bper (region|cluster|tipe|promotor)\b/.test(p.q)))) return reasonBreakdownAnswer(p, people, scopeNote);
  if (p.daily && (!p.dims.length || /per hari|harian|tiap hari|setiap hari|per tanggal|hari ke hari/.test(p.q))) return dailyAnswer(p, people, ds, scopeNote);

  // 1b) status / proyeksi achieve target
  if (isStatusIntent(p)) return statusAnswer(p, people, ds, scopeNote);

  // 2) "berapa region yang masuk top N anomali"
  if (p.masukTop && p.topN && p.dims.some((d) => d === "region" || d === "cluster") && (primary === "anomali" || primary === "kejadian" || primary === "pctAnomali" || !primary)) {
    return topAnomaliRegions(p, people, ds, scopeNote);
  }

  // 3) ranking per dimensi
  const dims = p.dims.length ? p.dims : [];
  const wantsRank = dims.length > 0 && (p.order !== null || p.topN !== null || p.group || /mana|manakah|siapa|urut|ranking|peringkat/.test(q)) && !(p.count && !p.order && !p.topN && !p.group && !/mana|manakah/.test(q));
  if (wantsRank && primary) {
    const order = p.order || (METRICS[primary].good === "low" && /parah|buruk/.test(q) ? "desc" : "desc");
    const limit = Math.max(1, Math.min(p.topN || (p.group ? (dims.includes("promotor") ? 10 : 15) : 5), 20));
    const sections: Section[] = [];
    const lines: string[] = [];
    const cl = !!METRICS[primary].countLike;
    const hi = order === "desc" ? (cl ? "terbanyak" : "tertinggi") : (cl ? "tersedikit" : "terendah");
    for (const d of dims) {
      const { sec, top } = rankingSection(`${DIM_LABEL[d]} — ${METRICS[primary].label} ${hi}`, d, groupBy(people, d), primary, p, order, limit);
      if (!top.length) continue;
      const w = top[0];
      lines.push(`${DIM_LABEL[d]} dengan ${METRICS[primary].label} ${hi}: ${w.g.label} (${METRICS[primary].f(w.v)}).`);
      const tie = top.length > 1 && top[1].v === w.v;
      if (tie) lines.push(`Catatan: ada nilai yang sama persis di peringkat berikutnya (${top[1].g.label}).`);
      sections.push(sec);
    }
    if (!sections.length) return { text: "Datanya belum cukup untuk menghitung itu" + scopeNote + "." };
    const rsn = p.reason ? ` (khusus: ${REASON_LABEL[p.reason]})` : "";
    const isSum = (primary === "gar" || primary === "nca" || primary === "fresh" || primary === "good" || primary === "bad" || primary === "unid") && !dims.every((d) => d === "promotor");
    const hint = p.avg && (primary === "gar" || primary === "nca") ? "Angka = rata-rata per promotor." : isSum ? `Angka = total ${METRICS[primary].label} seluruh promotor di grup itu, jadi grup dengan promotor lebih banyak cenderung lebih tinggi. Untuk perbandingan yang adil, tanya "rata-rata ${METRICS[primary].label} per promotor".` : undefined;
    return { text: lines.join("\n") + rsn + scopeNote, sections, interpretasi: hint };
  }

  // 4) jumlah / total tanpa dimensi
  if (primary || p.count || p.cmp || p.belumCapai) return countTotalAnswer(p, people, ds, scopeNote, primary);

  // 5) rescue: mungkin nama promotor sebagian
  const maybe = findPersonLoose(q, ds);
  if (maybe) return maybe.length === 1 ? profileAnswer(maybe[0]) : { text: `Ada ${maybe.length} promotor yang cocok. Maksudmu yang mana?`, sections: [{ head: ["Nama", "Wilayah", "ID"], rows: maybe.slice(0, 8).map((x) => [x.name, `${x.cluster} · ${x.region}`, x.id]) }] };

  // pertanyaan "bisa bikin chart/grafik/ppt?" tanpa topik → jelaskan kemampuan + beri contoh yang bisa diklik
  if (/\b(chart|grafik|diagram|visual|visualisasi|gambar|ppt|pptx|powerpoint|presentasi|slide)\b/.test(norm(text0))) {
    return { text: "Bisa! Aku bisa menampilkan grafik langsung di chat (batang, kolom, bertumpuk, garis, area, pie, donut, radar, scatter) dan membuat PPT dari datamu. Tinggal sebut topiknya, misalnya pilih salah satu ini:", chips: ["Grafik GAR per region", "Grafik anomali per region pie", "Grafik tren anomali per hari", "Grafik NCA vs target per region scatter", "Buat PPT status achieve per region", "Buat PPT anomali per region"] };
  }
  return { text: "Maaf, aku belum paham pertanyaan itu. Aku bisa jawab soal GAR, NCA, target, jumlah promotor, dan anomali — per region, cluster, tipe, atau per promotor. Coba salah satu contoh ini:", chips: SUGGESTIONS, unknown: true };
}

// ── status & proyeksi "achieve target" ──
const STATUS_STRONG = /achieve|achiev|on.?track|bakal|prediksi|proyeksi|perkiraan|forecast|estimasi|kira.?kira|kira2|lolos target/;
const STATUS_WEAK = /(sudah|udah|telah) (capai|tercapai|mencapai)|capai (atau|apa)|tercapai (atau|apa)|(akan|bisa|mampu) (capai|mencapai)/;
function isStatusIntent(p: Parsed): boolean {
  return STATUS_STRONG.test(p.q) || (STATUS_WEAK.test(p.q) && !p.count);
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${BULAN[m - 1]} ${y}`; };

// Posisi periode berjalan, dibaca dari tanggal terakhir di data: hari ke-berapa dari berapa hari sebulan.
function periodInfo(ds: Dataset): { elapsed: number; total: number; remaining: number; frac: number; text: string; partialStart: boolean } | null {
  if (!ds.period) return null;
  const [y, m, d] = ds.period.max.split("-").map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const elapsed = Math.min(d, total);
  const startsLate = ds.period.min.slice(0, 7) === ds.period.max.slice(0, 7) && Number(ds.period.min.slice(8, 10)) > 3;
  return { elapsed, total, remaining: total - elapsed, frac: elapsed / total, partialStart: startsLate,
    text: `data ${tgl(ds.period.min)} – ${tgl(ds.period.max)} (hari ke-${elapsed} dari ${total} di ${BULAN[m - 1]} ${y})` };
}

type Ach = { n: number; rated: number; nca: number; tgt: number; ach: number | null; capai: number; proj: number | null; projPct: number | null };
function achOf(people: Person[], frac: number | null): Ach {
  const rated = people.filter((x) => x.hasPenc && x.target != null);
  const nca = rated.reduce((a, x) => a + x.nca, 0);
  const tgt = rated.reduce((a, x) => a + (x.target as number), 0);
  const proj = frac && frac > 0 ? nca / frac : null;
  return { n: people.length, rated: rated.length, nca, tgt, ach: tgt ? (nca / tgt) * 100 : null, capai: rated.filter((x) => x.nca >= (x.target as number)).length,
    proj, projPct: proj != null && tgt ? (proj / tgt) * 100 : null };
}
function verdict(a: Ach, done: boolean): string {
  if (a.ach == null) return "-";
  if (a.ach >= 100) return "Sudah achieve";
  if (done) return "Belum achieve";
  return a.projPct != null && a.projPct >= 100 ? "Diperkirakan achieve" : "Diperkirakan belum";
}

function statusAnswer(p: Parsed, people: Person[], ds: Dataset, scopeNote: string): Answer {
  if (!ds.hasPenc) return { text: NO_PENC };
  const per = periodInfo(ds);
  const done = !!per && per.remaining === 0;
  const frac = per ? per.frac : null;
  const a = achOf(people, frac);
  if (!a.rated) return { text: "Belum ada promotor dengan data NCA dan masa kerja yang bisa dibandingkan dengan target." };
  const name = p.cluster ? `Cluster ${p.cluster}` : p.region ? `Region ${p.region}` : p.tipe ? tipeLabel(p.tipe) : p.player || "Nasional";
  const gap = Math.max(0, a.tgt - a.nca);
  const v = verdict(a, done);

  const lines: string[] = [];
  lines.push(`${name}: ${v.toUpperCase()}. NCA ${fmt(a.nca)} dari target ${fmt(a.tgt)} (${pct(a.ach)}); ${fmt(a.capai)} dari ${fmt(a.rated)} promotor sudah capai target masing-masing.`);
  if (per && !done) {
    const proj = a.proj as number;
    if ((a.ach as number) >= 100) lines.push(`Target sudah terlewati. Dengan laju sekarang, akhir bulan diperkirakan sekitar ${fmt(proj)} NCA (${pct(a.projPct)}).`);
    else lines.push(`Kurang ${fmt(gap)} NCA lagi (butuh ± ${fmt1(gap / per.remaining)} NCA/hari selama ${per.remaining} hari tersisa). Dengan laju sekarang (± ${fmt1(a.nca / per.elapsed)} NCA/hari), akhir bulan diperkirakan sekitar ${fmt(proj)} NCA (${pct(a.projPct)} dari target) → ${(a.projPct as number) >= 100 ? "diperkirakan achieve" : "diperkirakan belum achieve"}.`);
  } else if (per && done && gap > 0) lines.push(`Periode sudah lengkap (sampai ${tgl(ds.period!.max)}); kurang ${fmt(gap)} NCA dari target.`);

  // Pertanyaan "region/cluster mana yang achieve?" → buka dengan daftar, bukan angka nasional.
  const listMode = !p.region && !p.cluster && !p.tipe && !p.player && p.dims.some((d) => d === "region" || d === "cluster");
  if (listMode) {
    const d: Dim = p.dims.includes("cluster") && !p.dims.includes("region") ? "cluster" : "region";
    const gs = groupBy(people, d).map((g) => ({ g, x: achOf(g.people, frac) })).filter((r) => r.x.rated);
    const ok = gs.filter((r) => (r.x.ach as number) >= 100), no = gs.filter((r) => (r.x.ach as number) < 100);
    const likely = no.filter((r) => !done && (r.x.projPct as number) >= 100);
    lines.length = 0;
    lines.push(`${ok.length} dari ${gs.length} ${d} sudah achieve: ${ok.map((r) => r.g.label).join(", ") || "-"}.`);
    if (no.length) lines.push(`Belum achieve: ${no.map((r) => `${r.g.label} (${pct(r.x.ach)})`).join(", ")}.`);
    if (likely.length) lines.push(`Dengan laju sekarang, yang diperkirakan masih bisa achieve di akhir bulan: ${likely.map((r) => r.g.label).join(", ")}.`);
  }

  // tabel pembanding: kalau 1 region → cluster-nya; kalau nasional/cluster → per region/cluster
  const sections: Section[] = [];
  const splitDim: "region" | "cluster" | null = p.cluster ? null : p.region ? "cluster" : p.dims.includes("cluster") && !p.dims.includes("region") ? "cluster" : "region";
  if (splitDim) {
    const gs = groupBy(people, splitDim).map((g) => ({ g, x: achOf(g.people, frac) })).filter((r) => r.x.rated).sort((m, n) => (n.x.ach as number) - (m.x.ach as number));
    if (gs.length > 1) sections.push({
      title: `Status per ${splitDim}`, head: [splitDim === "region" ? "Region" : "Cluster", "NCA", "Target", "Capai", ...(per && !done ? ["Proyeksi"] : []), "Status"],
      rows: gs.slice(0, 15).map(({ g, x }) => [g.label, fmt(x.nca), fmt(x.tgt), pct(x.ach), ...(per && !done ? [pct(x.projPct)] : []), verdict(x, done)]),
      chart: { kind: "column", labels: gs.slice(0, 15).map(({ g }) => g.label), series: [{ name: "NCA", values: gs.slice(0, 15).map(({ x }) => x.nca) }, { name: "Target", values: gs.slice(0, 15).map(({ x }) => x.tgt) }], fmt: "num" },
    });
  }
  const catatan = [
    "Target = jumlah target NCA tiap promotor menurut masa kerjanya (<1 bln 75, 1–<3 bln 120, ≥3 bln 150).",
    per && !done ? `Perkiraan kasar: NCA "bulan berjalan" dianggap kumulatif dari tanggal 1 dan laju harian dianggap tetap; hari libur/weekend tidak diperhitungkan. Periode dibaca dari file yang di-upload: ${per.text}.` : per ? `Periode dibaca dari file yang di-upload: ${per.text}.` : "Tanggal di data tidak terbaca, jadi proyeksi akhir bulan tidak dihitung.",
    per && per.partialStart ? "Data dimulai bukan dari awal bulan; proyeksi mengasumsikan NCA tetap dihitung sejak tanggal 1." : "",
  ].filter(Boolean).join(" ");
  return { text: lines.join("\n") + scopeNote, interpretasi: catatan, sections };
}

// ── tren harian (grafik garis) ──
const tglPendek = (d: string) => { const [, m, dd] = d.split("-").map(Number); return `${dd} ${BULAN[m - 1]}`; };
function dailyAnswer(p: Parsed, people: Person[], ds: Dataset, scopeNote: string): Answer {
  const per = new Map<string, { active: number; flagPeople: number; flagRows: number }>();
  for (const x of people) {
    for (const d of x.dayList) { const r = per.get(d) || { active: 0, flagPeople: 0, flagRows: 0 }; r.active++; per.set(d, r); }
    for (const d of Object.keys(x.dayFlag)) {
      const v = p.reason ? x.dayFlag[d][p.reason] || 0 : x.dayFlag[d]._all;
      if (v > 0) { const r = per.get(d) || { active: 0, flagPeople: 0, flagRows: 0 }; r.flagPeople++; r.flagRows += v; per.set(d, r); }
    }
  }
  const days = [...per.keys()].sort();
  if (!days.length) return { text: "Belum ada tanggal yang bisa dibaca dari data untuk membuat tren harian." };
  const rows = days.map((d) => ({ d, ...per.get(d)! }));
  const wantActive = /aktif|hadir|masuk kerja/.test(p.q) && !/anomal|janggal|bermasalah/.test(p.q);
  const wantPct = /persen|%|persentase|rasio/.test(p.q);
  const val = (r: (typeof rows)[number]) => (wantActive ? r.active : wantPct ? (r.active ? (r.flagPeople / r.active) * 100 : 0) : r.flagRows);
  const name = wantActive ? "Promotor aktif" : wantPct ? "% promotor beranomali" : "Kejadian anomali";
  const vals = rows.map((r) => Math.round(val(r) * 10) / 10);
  const hi = rows.reduce((a, r) => (val(r) > val(a) ? r : a), rows[0]);
  const lo = rows.reduce((a, r) => (val(r) < val(a) ? r : a), rows[0]);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const f = (n: number) => (wantPct ? pct(n) : fmt1(n));
  const rsn = p.reason ? ` (khusus: ${REASON_LABEL[p.reason]})` : "";
  return {
    text: `${name}${rsn} per hari, ${tgl(days[0])} – ${tgl(days[days.length - 1])}: rata-rata ${f(avg)}/hari. Tertinggi ${tgl(hi.d)} (${f(val(hi))}), terendah ${tgl(lo.d)} (${f(val(lo))}).${scopeNote}`,
    sections: [{
      title: `${name} per hari`, head: ["Tanggal", "Promotor aktif", "Beranomali", "Kejadian", "% beranomali"],
      rows: rows.map((r) => [tglPendek(r.d), fmt(r.active), fmt(r.flagPeople), fmt(r.flagRows), pct(r.active ? (r.flagPeople / r.active) * 100 : null)]),
      chart: { kind: "line", labels: rows.map((r) => tglPendek(r.d)), series: [{ name, values: vals }], fmt: wantPct ? "pct" : "num" },
    }],
  };
}

// ── komposisi anomali per jenis (pie) ──
function reasonBreakdownAnswer(p: Parsed, people: Person[], scopeNote: string): Answer {
  const keys = Object.keys(REASON_LABEL);
  const rows = keys.map((k) => ({ k, orang: people.filter((x) => (x.reasonRows[k] || 0) > 0).length, kej: people.reduce((a, x) => a + (x.reasonRows[k] || 0), 0) })).filter((r) => r.kej > 0).sort((a, b) => b.kej - a.kej);
  if (!rows.length) return { text: `Tidak ada anomali yang tercatat${scopeNote}.` };
  const tot = rows.reduce((a, r) => a + r.kej, 0);
  const ag = aggregate(people, null);
  return {
    text: `${pct(ag.pctAnomali)} promotor beranomali (${fmt(ag.anomaliPeople)} dari ${fmt(ag.n)}). Total ${fmt(tot)} kejadian anomali, terbanyak: ${REASON_LABEL[rows[0].k]} (${fmt(rows[0].kej)}, ${pct((rows[0].kej / tot) * 100)}).${scopeNote}`,
    interpretasi: "Satu promotor bisa punya beberapa jenis anomali, jadi kolom Promotor tidak dijumlahkan. \"GPS Toko N/A\" adalah kekurangan data toko, bukan pelanggaran promotor.",
    sections: [{
      title: "Komposisi anomali per jenis", head: ["Jenis anomali", "Promotor", "Kejadian", "% kejadian"],
      rows: rows.map((r) => [REASON_LABEL[r.k], fmt(r.orang), fmt(r.kej), pct((r.kej / tot) * 100)]),
      chart: { kind: "pie", labels: rows.map((r) => REASON_LABEL[r.k]), series: [{ name: "Kejadian", values: rows.map((r) => r.kej) }], fmt: "num" },
    }],
  };
}

function topAnomaliRegions(p: Parsed, people: Person[], ds: Dataset, scopeNote: string): Answer {
  const n = Math.max(1, Math.min(p.topN as number, 50));
  const dim: Dim = p.dims.includes("cluster") && !p.dims.includes("region") ? "cluster" : "region";
  const offenders = [...people].filter((x) => (p.reason ? (x.reasonRows[p.reason] || 0) : x.flagRows) > 0)
    .sort((a, b) => (p.reason ? (b.reasonRows[p.reason] || 0) - (a.reasonRows[p.reason] || 0) : b.flagRows - a.flagRows) || a.name.localeCompare(b.name));
  const cut = offenders.slice(0, n);
  const key = (x: Person) => (dim === "region" ? x.region : `${x.cluster} (${x.region})`);
  const uniq = [...new Set(cut.map(key))];
  const val = (x: Person) => (p.reason ? x.reasonRows[p.reason] || 0 : x.flagRows);
  const tie = offenders.length > n && val(offenders[n]) === val(offenders[n - 1]);
  const ranked = rankingSection(`${DIM_LABEL[dim]} dengan promotor beranomali terbanyak`, dim, groupBy(people, dim), "anomali", p, "desc", Math.min(n, 10));
  const rsn = p.reason ? ` (khusus: ${REASON_LABEL[p.reason]})` : "";
  return {
    text: `${uniq.length} ${dim} masuk dalam ${n} promotor dengan anomali terbanyak${rsn}: ${uniq.join(", ") || "-"}.${tie ? " Catatan: ada promotor lain dengan jumlah anomali sama persis di batas peringkat." : ""}${scopeNote}`,
    interpretasi: `Aku artikan "top ${n} anomali" = ${n} promotor dengan jumlah hari/kejadian anomali terbanyak. Kalau maksudmu ${n} ${dim} dengan promotor beranomali terbanyak, lihat tabel kedua.`,
    sections: [
      { title: `Top ${n} promotor beranomali`, head: ["#", "Promotor", dim === "region" ? "Region" : "Cluster", "Kejadian anomali"], rows: cut.map((x, i) => [String(i + 1), x.name, dim === "region" ? x.region : `${x.cluster} (${x.region})`, fmt(val(x))]), chart: cut.length ? { kind: "bar", labels: cut.map((x) => x.name), series: [{ name: "Kejadian anomali", values: cut.map(val) }], fmt: "num" } : undefined },
      ranked.sec,
    ],
  };
}

function countTotalAnswer(p: Parsed, people: Person[], ds: Dataset, scopeNote: string, primary: MetricKey | null): Answer {
  const where = scopeText(p);
  const w = where ? ` (${where})` : "";
  let pool = people;
  const conds: string[] = [];
  const metricForCmp: MetricKey = primary === "nca" ? "nca" : "gar";

  if (p.belumCapai || (p.count && (primary === "capai" || primary === "pctCapai") && /belum|tidak|gagal|di bawah/.test(p.q))) {
    if (!ds.hasPenc) return { text: NO_PENC };
    const rated = pool.filter((x) => x.hasPenc && x.target != null);
    const miss = rated.filter((x) => x.nca < (x.target as number));
    return { text: `${fmt(miss.length)} dari ${fmt(rated.length)} promotor${w} belum capai target NCA (${pct(rated.length ? (miss.length / rated.length) * 100 : null)}).${scopeNote}`,
      sections: [{ title: "Capaian target NCA per promotor", head: ["Status", "Promotor", "%"], rows: [["Sudah capai", fmt(rated.length - miss.length), pct(rated.length ? ((rated.length - miss.length) / rated.length) * 100 : null)], ["Belum capai", fmt(miss.length), pct(rated.length ? (miss.length / rated.length) * 100 : null)]],
        chart: { kind: "donut", labels: ["Sudah capai", "Belum capai"], series: [{ name: "Promotor", values: [rated.length - miss.length, miss.length] }], fmt: "num" } }],
      interpretasi: "Target NCA per masa kerja: <1 bln = 75, 1–<3 bln = 120, ≥3 bln = 150. Hanya promotor yang punya data NCA & masa kerja yang dihitung." };
  }
  if (p.cmp) {
    if (!ds.hasPenc) return { text: NO_PENC };
    const f = (x: Person) => (metricForCmp === "nca" ? x.nca : x.gar);
    pool = pool.filter((x) => x.hasPenc && (p.cmp!.op === ">" ? f(x) > p.cmp!.v : f(x) < p.cmp!.v));
    conds.push(`${METRICS[metricForCmp].label} ${p.cmp.op === ">" ? "di atas" : "di bawah"} ${fmt(p.cmp.v)}`);
  }
  if (p.reason && !conds.length) {
    const hit = pool.filter((x) => (x.reasonRows[p.reason!] || 0) > 0);
    const rows = pool.reduce((a, x) => a + (x.reasonRows[p.reason!] || 0), 0);
    return { text: `${fmt(hit.length)} dari ${fmt(pool.length)} promotor${w} punya anomali "${REASON_LABEL[p.reason]}" (${fmt(rows)} kejadian).${scopeNote}` };
  }
  if (conds.length) {
    return { text: `${fmt(pool.length)} promotor${w} dengan ${conds.join(" dan ")}.${scopeNote}` };
  }

  const a = aggregate(pool, p.reason);
  const dimsSplit = /in.?store.*out.?store|out.?store.*in.?store/.test(p.q) && !p.tipe;
  if (dimsSplit) {
    const g = groupBy(pool, "tipe");
    return { text: `Total ${fmt(pool.length)} promotor${w}.${scopeNote}`, sections: [{ head: ["Tipe", "Promotor", "Beranomali"], rows: g.map((x) => { const ag = aggregate(x.people, null); return [x.label, fmt(ag.n), fmt(ag.anomaliPeople)]; }), chart: { kind: "column", labels: g.map((x) => x.label), series: [{ name: "Promotor", values: g.map((x) => x.people.length) }, { name: "Beranomali", values: g.map((x) => aggregate(x.people, null).anomaliPeople) }], fmt: "num" } }] };
  }
  const list = (p.metrics.length ? p.metrics : (["promotor"] as MetricKey[]));
  const parts = list.map((mk) => `${METRICS[mk].label}${p.avg && (mk === "gar" || mk === "nca") ? " rata-rata per promotor" : ""}: ${METRICS[mk].f(METRICS[mk].get(a, p.avg))}`);
  const sections: Section[] = [{ head: ["Ringkasan", "Nilai"], rows: [
    ["Promotor", fmt(a.n)], ["Promotor beranomali", `${fmt(a.anomaliPeople)} (${pct(a.pctAnomali)})`],
    ...(ds.hasPenc ? [["GAR (total)", fmt(a.gar)], ["NCA (total)", fmt(a.nca)], ["Capai target NCA", `${fmt(a.capai)} (${pct(a.pctCapai)})`]] : []),
  ] }];
  return { text: `${parts.join(" · ")}${w}.${scopeNote}`, sections };
}

function findPerson(q: string, ds: Dataset): Person | null {
  const idm = q.match(/\b(trad\d{6,}|[a-z]{2}-?\d{3,})\b/);
  if (idm) { const id = idm[1]; const hit = ds.people.find((x) => norm(x.id) === id); if (hit) return hit; }
  let best: Person | null = null;
  for (const x of ds.people) {
    const n = norm(x.name);
    if (n.length < 5 || !x.name || x.name === x.id) continue;
    if (new RegExp("(^|\\s)" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)").test(q) && (!best || n.length > norm(best.name).length)) best = x;
  }
  return best;
}

const STOP = new Set(["berapa", "gar", "nca", "dan", "yang", "di", "ke", "dari", "si", "promotor", "punya", "nya", "itu", "ini", "apa", "siapa", "adalah", "data", "tolong", "kasih", "tahu", "lihat", "profil", "capaian", "target", "anomali", "saja"]);
function findPersonLoose(q: string, ds: Dataset): Person[] | null {
  const toks = q.split(" ").filter((t) => t.length >= 4 && !STOP.has(t));
  if (!toks.length) return null;
  const hits = ds.people.filter((x) => { const n = norm(x.name); return toks.every((t) => n.includes(t)); });
  return hits.length ? hits : null;
}

function profileAnswer(x: Person): Answer {
  const rows: string[][] = [
    ["Wilayah", `${x.cluster} · ${x.region}`], ["Tipe", tipeLabel(x.tipe) + (x.player ? ` · ${x.player}` : "")],
    ["Masa kerja", x.tenure == null ? "-" : x.tenure < 1 ? "< 1 bulan" : `${Math.floor(x.tenure)} bulan`],
  ];
  if (x.hasPenc) {
    rows.push(["GAR", `${fmt(x.gar)}${x.target ? ` / target ${x.target}` : ""}`], ["NCA", `${fmt(x.nca)}${x.target ? ` / target ${x.target}` : ""}`],
      ["Fresh · Good · Bad · Unident.", `${fmt(x.fresh)} · ${fmt(x.good)} · ${fmt(x.bad)} · ${fmt(x.unid)}`]);
  } else rows.push(["GAR / NCA", "belum ada di data"]);
  rows.push(["Hari aktif", `${fmt(x.days)} hari`]);
  const why = Object.entries(x.reasonRows).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${REASON_LABEL[k] || k} (${fmt(v)}x)`);
  rows.push(["Anomali", x.flagRows ? `${fmt(x.flagRows)} kejadian — ${why.join(", ")}` : "tidak ada"]);
  const capai = x.hasPenc && x.target != null ? (x.nca >= x.target ? "sudah capai target NCA" : "belum capai target NCA") : null;
  return { text: `${x.name}${capai ? ` — ${capai}` : ""}.`, sections: [{ head: ["Info", "Nilai"], rows }] };
}

// ── saran arti lain saat jawaban dinilai kurang tepat ──
export function alternatives(raw: string, ds: Dataset): Alt[] {
  const q = norm(raw);
  const out: Alt[] = [];
  const rep = (w: string, to: string) => q.replace(new RegExp("(^|\\s)" + escRe(w) + "(?=\\s|$)", "g"), "$1" + to).replace(/\b(region|cluster) \1\b/g, "$1");
  const words = q.split(" ").filter((w) => w.length >= 4 && !NOT_NAME.has(w) && !STOP.has(w));
  for (const w of words) {
    const has = (n: string) => !n.startsWith("Tanpa ") && norm(n).split(/[\s-]+/).includes(w);
    const cl = ds.clusters.filter(has);
    const rg = ds.regions.filter(has);
    const parents = [...new Set(cl.map((c) => ds.people.find((x) => x.cluster === c)?.region).filter(Boolean) as string[])];
    const regs = [...new Set([...rg, ...parents])].slice(0, 3);
    if (!regs.length && !cl.length) continue;
    for (const r of regs) out.push({ label: `Region ${r} (seluruh cluster di dalamnya)`, question: rep(w, "region " + norm(r)), lesson: { from: w, to: "region " + norm(r) } });
    for (const c of cl.slice(0, 3)) out.push({ label: `Cluster ${c} saja`, question: rep(w, "cluster " + norm(c)), lesson: { from: w, to: "cluster " + norm(c) } });
    break;
  }
  if (/anomali/.test(q) && !/per jenis/.test(q)) out.push({ label: "Rincian jenis anomali (penyebabnya apa saja)", question: q + " per jenis anomali" });
  if (/anomali/.test(q) && !/promotor (dengan|yang)|siapa/.test(q)) out.push({ label: "Promotor dengan anomali terbanyak", question: "siapa promotor dengan anomali terbanyak" + (words.length ? "" : "") });
  return out.slice(0, 6);
}

// kemiripan kata (Jaccard) untuk menebak maksud dari pertanyaan yang pernah dinilai tepat
export function similarQuestions(raw: string, pool: string[], n = 3): string[] {
  const tok = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length >= 3 && !NOT_NAME.has(w)));
  const a = tok(raw);
  if (!a.size) return [];
  const seen = new Set<string>();
  return pool.map((c) => { const b = tok(c); let i = 0; a.forEach((w) => { if (b.has(w)) i++; }); return { c, sc: i / (a.size + b.size - i || 1) }; })
    .filter((x) => x.sc >= 0.34 && !seen.has(x.c) && seen.add(x.c))
    .sort((x, y) => y.sc - x.sc).slice(0, n).map((x) => x.c);
}
