// askBot.ts — v139. Mesin "Tanya Data" tanpa AI/API key: membaca pertanyaan bahasa Indonesia santai,
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
};
export type Dataset = { people: Person[]; regions: string[]; clusters: string[]; hasPenc: boolean; nRows: number; nTs: number; nAb: number };
export type Section = { title?: string; head: string[]; rows: string[][] };
export type Answer = { text: string; interpretasi?: string; sections?: Section[]; chips?: string[] };

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

export function buildDataset(tsAll: any[], abAll: any[], getTarget: (tenure: number) => number | null): Dataset {
  const map = new Map<string, Person>();
  const days = new Map<string, Set<string>>();
  const rows = [...(tsAll || []), ...(abAll || [])];
  for (const r of rows) {
    if (!r.employee_id || r.employee_id === "-") continue;
    let p = map.get(r.employee_id);
    if (!p) {
      p = { id: r.employee_id, name: "", region: "", cluster: "", tipe: "", player: "", tenure: null, target: null, hasPenc: false, gar: 0, nca: 0, fresh: 0, good: 0, bad: 0, unid: 0, days: 0, rows: 0, flagRows: 0, reasonRows: {} };
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
    if (r.date) days.get(r.employee_id)!.add(String(r.date).slice(0, 10));
    p.rows++;
    const why = rowReasons(r);
    if (why.length) { p.flagRows++; why.forEach((k) => { p.reasonRows[k] = (p.reasonRows[k] || 0) + 1; }); }
  }
  const people = [...map.values()];
  for (const p of people) {
    p.days = days.get(p.id)!.size;
    p.target = p.tenure != null ? getTarget(p.tenure) : null;
    if (!p.name) p.name = p.id;
    if (!p.region) p.region = "Tanpa Region";
    if (!p.cluster) p.cluster = "Tanpa Cluster";
  }
  return {
    people, nRows: rows.length, nTs: (tsAll || []).length, nAb: (abAll || []).length, hasPenc: people.some((p) => p.hasPenc),
    regions: [...new Set(people.map((p) => p.region))], clusters: [...new Set(people.map((p) => p.cluster))],
  };
}

// ── helper format ──
const fmt = (n: number | null | undefined) => (n == null || !isFinite(n) ? "-" : Math.round(n).toLocaleString("id-ID"));
const fmt1 = (n: number | null | undefined) => (n == null || !isFinite(n) ? "-" : n.toLocaleString("id-ID", { maximumFractionDigits: 1 }));
const pct = (n: number | null | undefined) => (n == null || !isFinite(n) ? "-" : fmt1(n) + "%");
const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9%<>\s./-]/g, " ").replace(/\s+/g, " ").trim();
const hasWord = (q: string, re: RegExp) => re.test(q);
const tipeLabel = (t: string) => (t === "In Store Promotor" ? "In Store" : t === "Out Store Promotor" ? "Out Store" : t || "-");

// ── agregat per grup ──
type Group = { key: string; label: string; people: Person[] };
type Agg = {
  n: number; nData: number; gar: number; nca: number; fresh: number; good: number; bad: number; unid: number;
  capai: number; pctCapai: number | null; ach: number | null; anomaliPeople: number; kejadian: number; pctAnomali: number | null; hari: number | null;
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
    capai, pctCapai: nRated.length ? (capai / nRated.length) * 100 : null,
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
  cmp: { op: ">" | "<"; v: number } | null; belumCapai: boolean; masukTop: boolean; note?: string;
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

function parseQuestion(raw: string, ds: Dataset): Parsed {
  const q = norm(raw);
  const p: Parsed = { q, metrics: detectMetrics(q), dims: [], order: null, topN: null, avg: false, count: false, ask: null, reason: null, tipe: null, player: null, region: null, cluster: null, cmp: null, belumCapai: false, masukTop: false };

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
  "Berapa promotor yang belum capai target NCA?",
  "Siapa 5 promotor dengan GAR tertinggi?",
  "Berapa total promotor In Store dan Out Store?",
];

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
  };
  return { sec, top: sorted };
}

export function answerQuestion(raw: string, ds: Dataset, scope?: string): Answer {
  const a = answerCore(raw, ds, scope);
  const note = ds.people.length && String(raw || "").trim() ? parseQuestion(raw, ds).note : undefined;
  if (note) a.interpretasi = a.interpretasi ? note + " " + a.interpretasi : note;
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

  // 2) "berapa region yang masuk top N anomali"
  if (p.masukTop && p.topN && p.dims.some((d) => d === "region" || d === "cluster") && (primary === "anomali" || primary === "kejadian" || primary === "pctAnomali" || !primary)) {
    return topAnomaliRegions(p, people, ds, scopeNote);
  }

  // 3) ranking per dimensi
  const dims = p.dims.length ? p.dims : [];
  const wantsRank = dims.length > 0 && (p.order !== null || p.topN !== null || /mana|manakah|siapa|urut|ranking|peringkat/.test(q)) && !(p.count && !p.order && !p.topN && !/mana|manakah/.test(q));
  if (wantsRank && primary) {
    const order = p.order || (METRICS[primary].good === "low" && /parah|buruk/.test(q) ? "desc" : "desc");
    const limit = Math.max(1, Math.min(p.topN || (dims.includes("promotor") ? 5 : 5), 20));
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

  return { text: "Maaf, aku belum paham pertanyaan itu. Aku bisa jawab soal GAR, NCA, target, jumlah promotor, dan anomali — per region, cluster, tipe, atau per promotor. Coba salah satu contoh ini:", chips: SUGGESTIONS };
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
      { title: `Top ${n} promotor beranomali`, head: ["#", "Promotor", dim === "region" ? "Region" : "Cluster", "Kejadian anomali"], rows: cut.map((x, i) => [String(i + 1), x.name, dim === "region" ? x.region : `${x.cluster} (${x.region})`, fmt(val(x))]) },
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
    return { text: `${fmt(miss.length)} dari ${fmt(rated.length)} promotor${w} belum capai target NCA (${pct(rated.length ? (miss.length / rated.length) * 100 : null)}).${scopeNote}`, interpretasi: "Target NCA per masa kerja: <1 bln = 75, 1–<3 bln = 120, ≥3 bln = 150. Hanya promotor yang punya data NCA & masa kerja yang dihitung." };
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
    return { text: `Total ${fmt(pool.length)} promotor${w}.${scopeNote}`, sections: [{ head: ["Tipe", "Promotor", "Beranomali"], rows: g.map((x) => { const ag = aggregate(x.people, null); return [x.label, fmt(ag.n), fmt(ag.anomaliPeople)]; }) }] };
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
