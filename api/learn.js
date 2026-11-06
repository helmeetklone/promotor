// Vercel Serverless Function — penyimpanan "hasil belajar" Tanya Data (dipakai bersama semua pengguna).
// Data disimpan di Vercel Blob (satu file JSON kecil: tanya-data/knowledge.json), BUKAN di GitHub.
//   GET  /api/learn                         → { lessons: [{from,to}], questions: [string] }
//   POST /api/learn {op:"lesson",from,to}   → tambah/ubah pelajaran kata → frasa baku
//   POST /api/learn {op:"fav",q}            → catat pertanyaan yang dinilai tepat
//   POST /api/learn {op:"remove",from}      → hapus satu pelajaran
// Syarat: di Vercel → Storage → buat Blob store (privat) lalu hubungkan ke project ini (otomatis menambah BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN).
// Tanpa itu endpoint membalas 503 dan dashboard tetap jalan (belajar hanya tersimpan di browser).
import { get, put } from "@vercel/blob";

const PATH = "tanya-data/knowledge.json";
const RE_FROM = /^[a-z0-9][a-z0-9 .\-]{1,39}$/;
const RE_TO = /^((region|cluster) [a-z0-9][a-z0-9 .\-]{1,60}|[a-z][a-z0-9\-]{2,24})$/;   // "region x" / "cluster y" atau satu kata baku (mis. omset → nca)
const MAX_LESSONS = 300;
const MAX_QUESTIONS = 200;

export const empty = () => ({ lessons: [], questions: [] });

// Rapikan & batasi isi supaya input sembarangan tidak merusak data.
export function sanitize(s) {
  const out = empty();
  const seen = new Set();
  for (const l of Array.isArray(s?.lessons) ? s.lessons : []) {
    if (l && RE_FROM.test(l.from) && RE_TO.test(l.to) && !seen.has(l.from)) { seen.add(l.from); out.lessons.push({ from: l.from, to: l.to }); }
  }
  const qs = new Set();
  for (const q of Array.isArray(s?.questions) ? s.questions : []) {
    if (typeof q === "string") { const t = q.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200); if (t.length >= 3) qs.add(t); }
  }
  out.lessons = out.lessons.slice(-MAX_LESSONS);
  out.questions = [...qs].slice(-MAX_QUESTIONS);
  return out;
}

export function applyOp(state, body) {
  const s = sanitize(state);
  const op = body?.op;
  if (op === "lesson") {
    const from = String(body.from || "").toLowerCase().trim(), to = String(body.to || "").toLowerCase().trim();
    if (!RE_FROM.test(from) || !RE_TO.test(to)) return { error: "pelajaran tidak valid" };
    s.lessons = [...s.lessons.filter((x) => x.from !== from), { from, to }].slice(-MAX_LESSONS);
  } else if (op === "fav") {
    const q = String(body.q || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    if (q.length < 3) return { error: "pertanyaan tidak valid" };
    s.questions = [...s.questions.filter((x) => x !== q), q].slice(-MAX_QUESTIONS);
  } else if (op === "remove") {
    const from = String(body.from || "").toLowerCase().trim();
    s.lessons = s.lessons.filter((x) => x.from !== from);
  } else return { error: "op tidak dikenal" };
  return { state: s };
}

async function load() {
  const r = await get(PATH, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return empty();
  try { return sanitize(JSON.parse(await new Response(r.stream).text())); } catch { return empty(); }
}
async function save(state) {
  await put(PATH, JSON.stringify(state), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return res.status(503).json({ error: "storage_not_configured" });
  try {
    if (req.method === "GET") return res.status(200).json(await load());
    if (req.method === "POST") {
      const r = applyOp(await load(), typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body);
      if (r.error) return res.status(400).json({ error: r.error });
      await save(r.state);
      return res.status(200).json(r.state);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    return res.status(500).json({ error: "server_error", detail: String(e?.message || e).slice(0, 200) });
  }
}
