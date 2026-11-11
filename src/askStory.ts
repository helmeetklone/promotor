// Ringkasan bercerita (storytelling singkat) dari tabel jawaban Tanya Data — murni aturan lokal, tanpa AI.
// Semua angka diambil dari tabel yang sedang tampil, jadi cerita selalu konsisten dengan tabelnya.
import type { Answer, Section } from "./askEngine";

const f1 = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
function num(s: string): number | null {
  const t = String(s ?? "").trim().split(/\s+/)[0].replace(/[^0-9,.\-]/g, "");
  if (!/\d/.test(t)) return null;
  const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " dan " + xs[xs.length - 1]);

type Row = { label: string; v: number };
function rowsOf(sec: Section, j: number, li: number): Row[] {
  return sec.rows.map((r) => ({ label: r[li], v: num(r[j]) as number })).filter((x) => x.label && x.v != null);
}
function numericCol(sec: Section, from: number): number {
  const cols: number[] = [];
  for (let j = from; j < sec.head.length; j++) {
    const ok = sec.rows.filter((r) => num(r[j]) != null).length;
    if (sec.rows.length && ok / sec.rows.length >= 0.8) cols.push(j);
  }
  if (!cols.length) return -1;
  // utamakan kolom yang namanya disebut di judul tabel (mis. "Kejadian anomali per hari" → kolom "Kejadian")
  const title = (sec.title || "").toLowerCase();
  const byTitle = cols.find((j) => { const h = sec.head[j].toLowerCase().replace(/\s*\(.*\)/, "").replace(/%/g, "").trim(); return h.length >= 4 && title.includes(h); });
  return byTitle ?? cols[0];
}

// Komposisi (kolom "% kejadian"): ceritakan porsi tiap jenis, urut sesuai tabel.
function compositionStory(sec: Section): string | null {
  const ki = sec.head.findIndex((h) => /^kejadian$/i.test(h)), pi = sec.head.findIndex((h) => /% kejadian/i.test(h));
  if (ki < 0 || pi < 0 || sec.rows.length < 2) return null;
  const rs = sec.rows.map((r) => ({ label: r[0], k: num(r[ki]) as number, p: r[pi] })).filter((x) => x.k != null);
  const total = rs.reduce((a, x) => a + x.k, 0);
  let t = `Dari ${f1(total)} kejadian anomali, yang terbesar adalah ${rs[0].label} (${rs[0].p}), disusul ${join(rs.slice(1, 3).map((x) => `${x.label} (${x.p})`))}.`;
  if (rs.length > 3) t += ` Sisanya ${rs.length - 3} jenis lain dengan porsi lebih kecil.`;
  if (/gps toko n\/a/i.test(rs[0].label)) t += " Catatan: \"GPS Toko N/A\" adalah kekurangan data toko, bukan pelanggaran promotor — jadi sebagian besar anomali ini mencerminkan data yang belum lengkap, bukan perilaku di lapangan.";
  return t;
}

// Status achieve target: siapa paling jauh di depan / paling tertinggal, dari kolom "Capai".
function statusStory(sec: Section): string | null {
  const ci = sec.head.findIndex((h) => /^capai$/i.test(h));
  if (ci < 0 || sec.rows.length < 2) return null;
  const rs = sec.rows.map((r) => ({ label: r[0], v: num(r[ci]) as number, c: r[ci] })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
  if (rs.length < 2) return null;
  const ok = rs.filter((x) => x.v >= 100).length, best = rs[0], worst = rs[rs.length - 1];
  return `${ok} dari ${rs.length} sudah berada di atas 100% target. ${best.label} paling jauh di depan (${best.c}), sedangkan ${worst.label} paling tertinggal (${worst.c})${worst.v < 100 ? ` — masih kurang sekitar ${f1(100 - worst.v)} poin dari target` : ""}.`;
}

function keyValueStory(sec: Section, scope: string): string | null {
  const kv: Record<string, string> = {};
  sec.rows.forEach((r) => { kv[r[0].toLowerCase()] = r[1]; });
  const n = kv["promotor"], an = kv["promotor beranomali"], cap = kv["capai target nca"];
  if (!n || !an) return null;
  const parts = [`Di ${scope || "Nasional"} ada ${n} promotor.`];
  parts.push(`Sebanyak ${an.replace(/\s*\(/, " (").replace(/\)$/, ")")} tercatat beranomali`);
  let s = parts.join(" ");
  if (cap) s += `, dan ${cap.replace(/\s*\(/, " (")} sudah mencapai target NCA`;
  s += ".";
  if (kv["gar (total)"] && kv["nca (total)"]) s += ` Secara total, GAR-nya ${kv["gar (total)"]} dan NCA-nya ${kv["nca (total)"]}.`;
  return s;
}

function dailyStory(sec: Section, j: number, li: number): string | null {
  const rs = rowsOf(sec, j, li);
  if (rs.length < 4) return null;
  const avg = rs.reduce((a, x) => a + x.v, 0) / rs.length;
  const peak = rs.reduce((a, x) => (x.v > a.v ? x : a));
  const low = rs.reduce((a, x) => (x.v < a.v ? x : a));
  const h = Math.floor(rs.length / 2);
  const a1 = rs.slice(0, h).reduce((a, x) => a + x.v, 0) / h, a2 = rs.slice(h).reduce((a, x) => a + x.v, 0) / (rs.length - h);
  const trend = a1 > 0 && Math.abs(a2 - a1) / a1 >= 0.1 ? (a2 > a1 ? `Tren cenderung naik: paruh akhir rata-rata ${f1(a2)} vs ${f1(a1)} di paruh awal.` : `Tren cenderung turun: paruh akhir rata-rata ${f1(a2)} vs ${f1(a1)} di paruh awal.`) : "Trennya relatif datar sepanjang periode.";
  return `Selama ${rs.length} hari, ${sec.head[j].toLowerCase()} rata-rata ${f1(avg)} per hari. Puncaknya ${peak.label} (${f1(peak.v)}), terendah ${low.label} (${f1(low.v)}). ${trend}`;
}

function rankStory(sec: Section, j: number, li: number, long: boolean): string | null {
  const rs = rowsOf(sec, j, li);
  if (rs.length < 2) return null;
  const metric = sec.head[j].replace(/\s*\(.*\)/, "");
  const isPct = /%/.test(sec.head[j]) || /%/.test(sec.rows[0][j] || "");
  const additive = !isPct && !/rata|avg|per promotor/i.test(sec.head[j]);
  const s = [...rs].sort((a, b) => b.v - a.v);
  const top = s[0], second = s[1], last = s[s.length - 1];
  const out: string[] = [];
  const gap = isPct ? `${f1(top.v - second.v)} poin` : f1(top.v - second.v);
  out.push(`${top.label} ada di posisi teratas untuk ${metric} dengan ${f1(top.v)}${isPct ? "%" : ""}, unggul ${gap} dari ${second.label} (${f1(second.v)}${isPct ? "%" : ""}).`);
  if (additive && s.length >= 4) {
    const sum = s.reduce((a, x) => a + x.v, 0);
    if (sum > 0) out.push(`Tiga teratas (${join(s.slice(0, 3).map((x) => x.label))}) menyumbang ${f1((s.slice(0, 3).reduce((a, x) => a + x.v, 0) / sum) * 100)}% dari total ${f1(sum)} (jumlah ${s.length} baris pada tabel ini).`);
  }
  if (s.length >= 3) out.push(`Yang terendah di tabel ini: ${last.label} (${f1(last.v)}${isPct ? "%" : ""})${top.v > 0 && last.v > 0 && !isPct ? `, sekitar ${f1(top.v / last.v)}× lebih kecil dari yang teratas` : ""}.`);
  if (long && s.length >= 4) {
    const avg = s.reduce((a, x) => a + x.v, 0) / s.length;
    out.push(`${s.filter((x) => x.v > avg).length} dari ${s.length} berada di atas rata-rata (${f1(avg)}${isPct ? "%" : ""}).`);
  }
  if (/% kejadian/i.test(sec.head.join(" ")) && /gps toko n\/a/i.test(top.label)) out.push("Catatan: \"GPS Toko N/A\" adalah kekurangan data toko, bukan pelanggaran promotor — jadi angka anomali sebagian besar mencerminkan data, bukan perilaku.");
  return out.join(" ");
}

// Cerita singkat dari bagian tabel pertama yang bisa diceritakan; null kalau tidak ada yang cocok.
export function narrate(a: Answer, scope0: string, long = false): string | null {
  if (!a.sections?.length || a.unknown) return null;
  if (a.cerita) return a.cerita;   // jawaban level nama sudah membawa ceritanya sendiri
  if (a.sections[0].title === "Profil" || a.sections[0].head[0] === "") return null;
  // kalau jawabannya untuk region/cluster tertentu (mis. "(region SOUTHERN SUMATRA)"), pakai itu sebagai lingkup, bukan filter dashboard
  const m = a.text.match(/\((region|cluster) ([^)]+)\)/);
  const scope = m ? `${m[1]} ${m[2]}` : scope0;
  for (const sec of a.sections) {
    if (!sec.rows.length) continue;
    if (/^ringkasan$/i.test(sec.head[0]) && sec.head.length === 2) { const k = keyValueStory(sec, scope); if (k) return k; continue; }
    if (/% kejadian/i.test(sec.head.join(" "))) { const c = compositionStory(sec); if (c) return c; }
    if (/^status$/i.test(sec.head[sec.head.length - 1])) { const c = statusStory(sec); if (c) return c; continue; }
    const li = sec.head[0] === "#" ? 1 : 0;
    const j = numericCol(sec, li + 1);
    if (j < 0) continue;
    const t = /tanggal|hari/i.test(sec.head[li]) ? dailyStory(sec, j, li) : rankStory(sec, j, li, long);
    if (t) return t;
  }
  return null;
}

// Permintaan "pakai storytelling / ceritakan / jelaskan dengan narasi" terhadap jawaban sebelumnya.
const STORY_WORDS = /\b(storytelling|story\s*telling|bercerita|ceritakan|cerita|narasi|naratif|dongeng|jelaskan( dong| donk)?( dengan| secara)?( singkat| sederhana)?|bahasa (awam|sederhana|manusia)|biar enak (dibaca|jawabnya|dimengerti))\b/;
export const isStoryRequest = (raw: string) => STORY_WORDS.test(String(raw || "").toLowerCase());
export function stripStoryWords(raw: string): string {
  return String(raw || "").toLowerCase().replace(new RegExp(STORY_WORDS.source, "g"), " ")
    .replace(/\b(bisa|ga|gak|nggak|tidak|kamu|kasih|berikan|dengan|secara|singkat|short|dong|donk|ya|itu|kan|tolong|jawabannya|jawaban|biar|enak|gt|gitu|saya|aku|iya|maaf|yang|typo|berdasarkan|table|tabel)\b/g, " ")
    .replace(/[^a-z0-9%\s]/g, " ").replace(/\s+/g, " ").trim();
}
