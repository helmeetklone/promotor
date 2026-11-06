// AskBot.tsx — v139. Panel chat "Tanya Data" (melayang di pojok kanan bawah). Tanpa AI/API key:
// semua jawaban dihitung lokal di browser oleh askEngine.ts dari data yang sedang tampil di dashboard.
// Bisa menampilkan grafik di chat dan membuat PPT (askPpt.ts) dari jawaban-jawaban yang diminta.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Send, X, Sparkles, BarChart3, FilePlus2, Download, Check, ThumbsUp, ThumbsDown, Brain, Trash2 } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LabelList, ResponsiveContainer,
} from "recharts";
import { buildDataset, answerQuestion, alternatives, similarQuestions, pptRequest, periodText, SUGGESTIONS, PPT_PRESET, CHART_KIND_LABEL, validKinds, effectiveKind, setChartKind, pieSlices, type Answer, type Chart, type ChartKind, type Lesson, type Alt } from "./askEngine";
import { narrate, isStoryRequest, stripStoryWords } from "./askStory";
import { loadLessons, saveLessons, addLesson, loadFavs, addFav, clearLearning, BUILTIN_LESSONS, BUILTIN_QUESTIONS, mergedLessons, fetchShared, pushShared } from "./askLearn";
import { buildDeck, type DeckItem } from "./askPpt";

type Msg = { from: "user" | "bot"; text: string; answer?: Answer; question?: string; alts?: Alt[] };
// Koreksi dari pengguna ("beda donk", "bukan itu", "maksudku …") → tawarkan arti lain untuk pertanyaan sebelumnya
const CORRECTION = /^\s*(beda|bukan|salah|maksud(ku|nya| saya)?|koreksi|harusnya|seharusnya|kok (beda|salah)|kurang tepat|tidak tepat|ga tepat|gak tepat|nggak tepat)\b/i;

const COLORS = ["#2316AA", "#EA3363", "#0D9488"];
const PIE_COLORS = ["#2316AA", "#EA3363", "#0D9488", "#D97706", "#7C3AED", "#0EA5E9", "#65A30D", "#DB2777", "#475569", "#F59E0B", "#94A3B8"];
const nf = (v: number, f: "num" | "pct") => (f === "pct" ? v.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%" : Math.round(v).toLocaleString("id-ID"));
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function MiniChart({ chart, kind }: { chart: Chart; kind: ChartKind }) {
  const n = chart.labels.length;
  const data = chart.labels.map((l, i) => {
    const row: any = { name: l };
    chart.series.forEach((s, k) => { row["s" + k] = s.values[i]; });
    return row;
  });
  const f = (v: any) => nf(Number(v), chart.fmt);
  const many = chart.series.length > 1;
  const short = (v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v);
  const box = (h: number, el: any) => <div style={{ width: "100%", height: h }}><ResponsiveContainer>{el}</ResponsiveContainer></div>;
  const legend = many ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null;
  const xStep = n > 10 ? Math.ceil(n / 8) - 1 : 0;

  if (kind === "bar" || kind === "stacked") {
    return box(Math.max(150, n * (many && kind === "bar" ? 46 : 28) + 40),
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 10 }} tickFormatter={short} interval={0} />
        <Tooltip formatter={f} />{legend}
        {chart.series.map((s, k) => (
          <Bar key={k} dataKey={"s" + k} name={s.name} fill={COLORS[k % COLORS.length]} stackId={kind === "stacked" ? "a" : undefined} radius={kind === "stacked" ? 0 : [0, 3, 3, 0]}>
            <LabelList dataKey={"s" + k} position={kind === "stacked" ? "center" : "right"} fontSize={10} fill={kind === "stacked" ? "#fff" : "#374151"} formatter={f} />
          </Bar>
        ))}
      </BarChart>);
  }
  if (kind === "column") {
    return box(260,
      <BarChart data={data} margin={{ top: 16, right: 8, bottom: n > 4 ? 36 : 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} tickFormatter={short} interval={xStep} angle={n > 4 ? -30 : 0} textAnchor={n > 4 ? "end" : "middle"} height={n > 4 ? 56 : 24} />
        <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={f} />
        <Tooltip formatter={f} />{legend}
        {chart.series.map((s, k) => (
          <Bar key={k} dataKey={"s" + k} name={s.name} fill={COLORS[k % COLORS.length]} radius={[3, 3, 0, 0]}>
            {n <= 8 && <LabelList dataKey={"s" + k} position="top" fontSize={9} formatter={f} />}
          </Bar>
        ))}
      </BarChart>);
  }
  if (kind === "line" || kind === "area") {
    const Chart_: any = kind === "line" ? LineChart : AreaChart;
    return box(250,
      <Chart_ data={data} margin={{ top: 16, right: 12, bottom: 28, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} tickFormatter={short} interval={xStep} angle={n > 6 ? -30 : 0} textAnchor={n > 6 ? "end" : "middle"} height={n > 6 ? 48 : 24} />
        <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={f} />
        <Tooltip formatter={f} />{legend}
        {chart.series.map((s, k) => kind === "line"
          ? <Line key={k} type="monotone" dataKey={"s" + k} name={s.name} stroke={COLORS[k % COLORS.length]} strokeWidth={2} dot={n <= 20}>{n <= 12 && <LabelList dataKey={"s" + k} position="top" fontSize={9} formatter={f} />}</Line>
          : <Area key={k} type="monotone" dataKey={"s" + k} name={s.name} stroke={COLORS[k % COLORS.length]} fill={COLORS[k % COLORS.length]} fillOpacity={0.25} />)}
      </Chart_>);
  }
  if (kind === "pie" || kind === "donut") {
    const sl = pieSlices(chart);
    const total = sl.reduce((a, b) => a + b.value, 0) || 1;
    return box(270,
      <PieChart>
        <Pie data={sl} dataKey="value" nameKey="name" innerRadius={kind === "donut" ? 48 : 0} outerRadius={84} paddingAngle={1}
          label={(e: any) => `${((e.value / total) * 100).toLocaleString("id-ID", { maximumFractionDigits: 0 })}%`} labelLine={false} fontSize={10}>
          {sl.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: any) => `${f(v)} (${((Number(v) / total) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%)`} />
        <Legend wrapperStyle={{ fontSize: 10 }} formatter={short} />
      </PieChart>);
  }
  if (kind === "radar") {
    return box(280,
      <RadarChart data={data} outerRadius={70} margin={{ top: 16, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid />
        <PolarAngleAxis dataKey="name" tick={{ fontSize: 9 }} tickFormatter={short} />
        <PolarRadiusAxis tick={{ fontSize: 9 }} tickFormatter={f} />
        <Tooltip formatter={f} />{legend}
        {chart.series.map((s, k) => <Radar key={k} dataKey={"s" + k} name={s.name} stroke={COLORS[k % COLORS.length]} fill={COLORS[k % COLORS.length]} fillOpacity={0.25} />)}
      </RadarChart>);
  }
  // scatter: seri 1 = sumbu X, seri 2 = sumbu Y, tiap titik = satu label
  const pts = chart.labels.map((l, i) => ({ name: l, x: chart.series[0].values[i], y: chart.series[1].values[i] }));
  return box(280,
    <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis type="number" dataKey="x" name={chart.series[0].name} tick={{ fontSize: 10 }} tickFormatter={f} label={{ value: chart.series[0].name, position: "insideBottom", offset: -12, fontSize: 10 }} />
      <YAxis type="number" dataKey="y" name={chart.series[1].name} tick={{ fontSize: 10 }} width={48} tickFormatter={f} />
      <Tooltip formatter={f} cursor={{ strokeDasharray: "3 3" }} />
      <Scatter data={pts} fill={COLORS[0]}><LabelList dataKey="name" position="top" fontSize={9} formatter={short} /></Scatter>
    </ScatterChart>);
}

export default function AskBot({ timestampResult, absensiResult, getTarget, scope, logos }: {
  timestampResult: any; absensiResult: any; getTarget: (tenure: number) => number | null; scope: string;
  logos?: { dark: string; light: string };
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [deck, setDeck] = useState<DeckItem[]>([]);
  const [chartOverride, setChartOverride] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>(() => loadLessons());
  const [favs, setFavs] = useState<string[]>(() => loadFavs());
  const [fb, setFb] = useState<Record<number, "up" | "down">>({});
  const [showLearn, setShowLearn] = useState(false);
  const [sync, setSync] = useState<"?" | "ok" | "off">("?"); // tersambung ke penyimpanan bersama di Vercel?
  const lastQ = useRef<string>("");
  const lastA = useRef<Answer | null>(null);
  const [, bumpKind] = useState(0); // render ulang setelah ganti jenis grafik
  const lastRef = useRef<HTMLDivElement>(null); // awal jawaban terakhir — dibuka dari atas, bukan dari bawah

  // Muat hasil belajar bersama dari Vercel (sekali). Yang baru ada di browser ini ikut diunggah.
  useEffect(() => {
    let alive = true;
    (async () => {
      const sh = await fetchShared();
      if (!alive) return;
      if (!sh) { setSync("off"); return; }
      setSync("ok");
      const local = loadLessons(), lf = loadFavs();
      const shL = new Set(sh.lessons.map((l) => l.from)), shQ = new Set(sh.questions);
      const mergedL = [...sh.lessons, ...local.filter((l) => !shL.has(l.from))];
      const mergedF = [...sh.questions, ...lf.filter((q) => !shQ.has(q))];
      setLessons(mergedL); saveLessons(mergedL); setFavs(mergedF);
      try { localStorage.setItem("xlsmart-askbot-favs-v1", JSON.stringify(mergedF)); } catch { /* abaikan */ }
      local.filter((l) => !shL.has(l.from)).forEach((l) => void pushShared({ op: "lesson", from: l.from, to: l.to }));
      lf.filter((q) => !shQ.has(q)).forEach((q) => void pushShared({ op: "fav", q }));
    })();
    return () => { alive = false; };
  }, []);

  // Dataset baru dibangun saat panel pertama kali dibuka (dan ikut berubah kalau filter/ambang di dashboard berubah).
  const ds = useMemo(
    () => (open ? buildDataset(timestampResult?.all || [], absensiResult?.all || [], getTarget) : null),
    [open, timestampResult, absensiResult, getTarget]
  );

  useEffect(() => { lastRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [msgs, open]);

  const safeAnswer = (q: string): Answer => {
    try { return answerQuestion(q, ds!, scope, mergedLessons(lessons)); }
    catch (e) { return { text: "Maaf, ada error saat menghitung jawabannya. Coba ubah kalimat pertanyaannya.", unknown: true }; }
  };
  const botSay = (text: string, extra?: Partial<Msg>) => setMsgs((m) => [...m, { from: "bot", text, ...extra }]);

  // Susun & unduh PPT dari daftar jawaban; hasilnya dilaporkan di chat (judul tiap bagian + nama file).
  const makeDeck = async (items: DeckItem[], title: string) => {
    setBusy(true);
    try {
      const r = await buildDeck(items, { scope, period: ds ? periodText(ds) : null, title, logos });
      botSay(`PPT sudah terunduh: ${r.fileName} (${r.slides} slide).\nIsinya:\n` + r.outline.map((o) => (o.startsWith("   ") ? o : "• " + o)).join("\n") + "\n\nMau tambah atau ubah isi? Tanya lagi lalu klik \"+ PPT\", atau tulis permintaan baru, mis. \"buat ppt anomali per region\".");
    } catch (e: any) {
      botSay("Maaf, PPT gagal dibuat" + (e?.message ? ` (${e.message})` : "") + ". Coba lagi, atau kurangi jumlah jawaban yang dimasukkan.");
    } finally { setBusy(false); }
  };

  const handlePpt = async (pr: { topic: string; addLast: boolean }) => {
    if (pr.addLast && !pr.topic) {
      const last = [...msgs].reverse().find((m) => m.from === "bot" && m.answer && !m.answer.unknown && m.question);
      if (!last) { botSay("Belum ada jawaban yang bisa dimasukkan. Tanya dulu, lalu klik \"+ PPT\" di bawah jawabannya."); return; }
      addToDeck(last.question!, last.answer!);
      botSay(`Jawaban "${cap(last.question!)}" ditambahkan ke PPT. Ketik "buat ppt" kapan saja untuk mengunduh.`);
      return;
    }
    if (pr.topic) {
      // Beberapa topik dalam satu permintaan ("status achieve per region dan anomali per region") → jawab satu-satu,
      // asal SEMUA bagiannya dipahami sendiri-sendiri. Kalau tidak (mis. "region dan cluster mana GAR tertinggi"), anggap satu pertanyaan utuh.
      const parts = pr.topic.split(/\bdan\b|,|\+|\bserta\b|\blalu\b/).map((t) => t.trim()).filter((t) => t.length >= 3);
      const tried = parts.map((t) => ({ question: t, answer: safeAnswer(t) }));
      let items: DeckItem[] = [];
      let skipped: string[] = [];
      if (parts.length > 1 && tried.every((x) => !x.answer.unknown)) items = tried;
      else {
        const whole = safeAnswer(pr.topic);
        if (!whole.unknown) items = [{ question: pr.topic, answer: whole }];
        else { items = tried.filter((x) => !x.answer.unknown); skipped = tried.filter((x) => x.answer.unknown).map((x) => x.question); }
      }
      if (!items.length) {
        // Topik tidak dikenali → jangan menyerah: buat ringkasan umum (PPT tetap jadi), lalu beri contoh permintaan yang lebih spesifik.
        const fb = PPT_PRESET.map((q) => ({ question: q, answer: safeAnswer(q) })).filter((x) => !x.answer.unknown);
        if (fb.length) {
          botSay(`Topik "${pr.topic}" belum kupahami, jadi kubuatkan PPT ringkasan umum dulu. Untuk isi yang spesifik, coba misalnya:`, { answer: { text: "", chips: ["Buat PPT status achieve per region", "Buat PPT anomali per region", "Buat PPT GAR tertinggi per cluster"] } });
          await makeDeck(fb, "Ringkasan Data Promotor");
          return;
        }
        botSay("Datanya belum cukup untuk membuat PPT.");
        return;
      }
      if (skipped.length) botSay(`Bagian ini belum bisa kupahami dan dilewati: ${skipped.map((x) => `"${x}"`).join(", ")}.`);
      await makeDeck(items, cap(pr.topic));
      return;
    }
    if (deck.length) { await makeDeck(deck, "Ringkasan Data Promotor"); return; }
    const items = PPT_PRESET.map((q) => ({ question: q, answer: safeAnswer(q) })).filter((x) => !x.answer.unknown);
    if (!items.length) { botSay("Datanya belum cukup untuk membuat ringkasan."); return; }
    await makeDeck(items, "Ringkasan Data Promotor");
  };

  // Tawarkan arti lain untuk pertanyaan sebelumnya; pilihan pengguna dipelajari (disimpan di browser ini).
  const reask = (q: string) => {
    if (!q) { botSay("Tulis dulu pertanyaannya, nanti bisa kukoreksi kalau kurang tepat."); return; }
    const alts = alternatives(q, ds!);
    if (alts.length) botSay("Maaf, kurang tepat ya. Maksudmu yang mana? Pilihanmu akan kuingat untuk pertanyaan berikutnya.", { alts });
    else botSay("Maaf, kurang tepat. Coba tulis ulang dengan lebih spesifik — sebut region/cluster dan angka yang dicari (GAR, NCA, anomali, dst.), atau pilih salah satu contoh:", { answer: { text: "", chips: SUGGESTIONS.slice(0, 4) } });
  };
  const pickAlt = (a: Alt) => {
    if (a.lesson) {
      setLessons((l) => addLesson(l, a.lesson!));
      void pushShared({ op: "lesson", from: a.lesson.from, to: a.lesson.to }).then((ok) => setSync(ok ? "ok" : "off"));
      botSay(`Oke, kuingat: "${a.lesson.from}" = ${a.lesson.to}. Berikut jawabannya:`);
    }
    void ask(a.question, a.label);
  };
  const rate = (i: number, m: Msg, up: boolean) => {
    setFb((f) => ({ ...f, [i]: up ? "up" : "down" }));
    if (up) { setFavs((f) => addFav(f, m.question!)); void pushShared({ op: "fav", q: m.question! }); botSay("Siap, kuingat pertanyaan ini sebagai contoh yang tepat."); }
    else reask(m.question!);
  };
  const resetLearning = () => { clearLearning(); setLessons([]); setFavs([]); };
  const removeLesson = (from: string) => { setLessons((l) => { const n = l.filter((x) => x.from !== from); saveLessons(n); return n; }); void pushShared({ op: "remove", from }); };

  const ask = async (qRaw: string, display?: string) => {
    const q = qRaw.trim();
    if (!q || !ds || busy) return;
    setMsgs((m) => [...m, { from: "user", text: display || q }]);
    setInput("");
    if (CORRECTION.test(q) && lastQ.current) { reask(lastQ.current); return; }
    // "kasih jawaban dengan storytelling" → ceritakan jawaban yang barusan (atau topik yang disebut bersamaan)
    if (isStoryRequest(q)) {
      const topic = stripStoryWords(q);
      let target: Answer | null = null, tq = lastQ.current;
      if (topic.length >= 3) { const t = safeAnswer(topic); if (!t.unknown) { target = t; tq = topic; } }
      if (!target && lastA.current) target = lastA.current;
      const story = target ? narrate(target, scope, true) : null;
      if (target && story) {
        if (tq && target !== lastA.current) { lastA.current = target; lastQ.current = tq; }
        setMsgs((m) => [...m, { from: "bot", text: "📖 " + story }]);
      } else botSay(target ? "Jawaban ini berupa daftar/rincian yang belum bisa kuceritakan, tapi tabel di atas sudah lengkap. Mau kubuatkan grafiknya?" : "Cerita tentang apa? Tanya dulu datanya, misalnya \"GAR tertinggi per region\", lalu minta \"ceritakan dengan storytelling\".", target ? undefined : { answer: { text: "", chips: SUGGESTIONS.slice(0, 3) } });
      return;
    }
    const pr = pptRequest(q);
    if (pr) { await handlePpt(pr); return; }
    const a = safeAnswer(q);
    if (a.clarify) { setMsgs((m) => [...m, { from: "bot", text: a.text, alts: a.alts }]); return; }
    if (a.unknown) {
      // belum paham → tebak dari pertanyaan yang pernah dinilai tepat (👍) dan contoh bawaan
      const sims = similarQuestions(q, [...favs, ...BUILTIN_QUESTIONS].reverse().concat(SUGGESTIONS), 3);
      if (sims.length) { a.text = "Aku belum yakin maksudnya. Apakah salah satu ini?"; a.chips = [...sims, ...SUGGESTIONS.filter((x) => !sims.includes(x)).slice(0, 3)]; }
    } else { lastQ.current = q; lastA.current = a; a.cerita = narrate(a, scope) || undefined; }
    setMsgs((m) => [...m, { from: "bot", text: a.text, answer: a, question: q }]);
  };

  const addToDeck = (question: string, answer: Answer) => setDeck((d) => (d.some((x) => x.answer === answer) ? d : [...d, { question, answer }]));
  const chartShown = (key: string, a: Answer) => (key in chartOverride ? chartOverride[key] : !!a.wantChart);

  if (!open) {
    // Dua pintu masuk: tombol di baris Overview/Detail (selalu terlihat, ikut scroll) + tombol melayang di pojok kanan bawah
    // (lewat portal ke <body> supaya tidak terpengaruh container induk).
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow px-3 py-1.5">
          <MessageCircle className="w-4 h-4" /> Tanya Data
        </button>
        {typeof document !== "undefined" && createPortal(
          <button type="button" onClick={() => setOpen(true)} aria-label="Buka Tanya Data"
            style={{ position: "fixed", right: 16, bottom: 16, zIndex: 2147483000 }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full shadow-lg px-4 py-3">
            <MessageCircle className="w-4 h-4" /> Tanya Data
          </button>, document.body)}
      </>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(94vw,28.75rem)] h-[min(84vh,41.25rem)] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="w-4 h-4" /> Tanya Data</div>
        <div className="flex items-center gap-1">
          {deck.length > 0 && (
            <>
              <button type="button" disabled={busy} onClick={() => makeDeck(deck, "Ringkasan Data Promotor")}
                className="flex items-center gap-1 text-[0.6875rem] bg-white/20 hover:bg-white/30 disabled:opacity-60 rounded px-2 py-1"><Download className="w-3 h-3" /> PPT ({deck.length})</button>
              <button type="button" onClick={() => setDeck([])} className="text-[0.6875rem] hover:bg-indigo-500 rounded px-1.5 py-1" title="Kosongkan daftar PPT">Kosongkan</button>
            </>
          )}
          <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="hover:bg-indigo-500 rounded p-1"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="px-4 py-2 text-[0.6875rem] text-gray-500 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center justify-between gap-2">
          <span>Jawaban dihitung dari data yang sedang tampil{scope && scope !== "Nasional" ? ` (${scope})` : " (nasional)"}.</span>
          <button type="button" onClick={() => setShowLearn((v) => !v)} title="Hal yang sudah dipelajari dari koreksimu"
            className="shrink-0 inline-flex items-center gap-1 text-indigo-700 hover:underline"><Brain className="w-3 h-3" /> Dipelajari ({lessons.length + favs.length + BUILTIN_LESSONS.length})</button>
        </div>
        {showLearn && (
          <div className="mt-2 bg-white border border-gray-200 rounded-lg p-2 text-gray-700 space-y-1">
            <div className="text-gray-500">{sync === "ok" ? "Tersimpan di server dashboard (Vercel) — permanen dan dipakai semua pengguna. Ini aturan sederhana, bukan AI." : sync === "off" ? "Penyimpanan bersama di Vercel belum tersambung, jadi hasil belajar sementara hanya di browser ini. Setelah tersambung, otomatis ikut terunggah." : "Menghubungkan ke penyimpanan…"}</div>
            {BUILTIN_LESSONS.map((l) => <div key={"b" + l.from} className="text-gray-600">📌 "{l.from}" → {l.to} <span className="text-gray-400">(bawaan GitHub)</span></div>)}
            {lessons.length === 0 && favs.length === 0 && <div>Belum ada. Kalau jawabanku kurang tepat, klik 👎 atau ketik "bukan itu" — pilihanmu kuingat.</div>}
            {lessons.map((l) => (
              <div key={l.from} className="flex items-center justify-between gap-2"><span>"{l.from}" → {l.to}</span>
                <button type="button" onClick={() => removeLesson(l.from)} aria-label="Hapus" className="text-gray-400 hover:text-red-600"><X className="w-3 h-3" /></button></div>
            ))}
            {favs.length > 0 && <div className="text-gray-500">{favs.length} pertanyaan ditandai tepat (👍) — dipakai untuk menebak maksud.</div>}
            {sync !== "ok" && (lessons.length > 0 || favs.length > 0) && (
              <button type="button" onClick={resetLearning} className="inline-flex items-center gap-1 text-red-600 hover:underline"><Trash2 className="w-3 h-3" /> Hapus semua dari browser ini</button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {msgs.length === 0 && (
          <div>
            <div className="text-gray-700 mb-2">Halo! Tanya soal GAR, NCA, target, jumlah promotor, atau anomali. Bisa juga minta grafik atau PPT. Misalnya:</div>
            <div className="flex flex-col gap-1.5">
              {[...[...favs].reverse().slice(0, 3), ...SUGGESTIONS].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 10).map((s) => (
                <button key={s} type="button" onClick={() => ask(s)}
                  className="text-left text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-lg px-3 py-2">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.from === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]">{m.text}</div>
            </div>
          ) : (
            <div key={i} ref={i === msgs.length - 1 ? lastRef : undefined} className="flex justify-start scroll-mt-1">
              <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[96%] min-w-0">
                {m.text && <div className="whitespace-pre-line">{m.text}</div>}
                {m.answer?.cerita && <div className="mt-1.5 text-[0.8125rem] text-gray-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">📖 {m.answer.cerita}</div>}
                {m.answer?.interpretasi && <div className="mt-1.5 text-[0.6875rem] text-gray-500 italic">{m.answer.interpretasi}</div>}
                {m.answer?.sections?.map((sec, k) => {
                  const key = `${i}-${k}`;
                  const show = !!sec.chart && chartShown(key, m.answer!);
                  return (
                    <div key={k} className="mt-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-2 py-1 bg-gray-50 border-b border-gray-200">
                        <div className="text-[0.6875rem] font-semibold text-gray-600">{sec.title || "Rincian"}</div>
                        {sec.chart && (
                          <button type="button" onClick={() => setChartOverride((o) => ({ ...o, [key]: !show }))}
                            className="flex items-center gap-1 text-[0.6875rem] text-indigo-700 hover:underline"><BarChart3 className="w-3 h-3" /> {show ? "Sembunyikan grafik" : "Grafik"}</button>
                        )}
                      </div>
                      {show && sec.chart && (() => {
                        const kind = effectiveKind(sec.chart, m.answer!.chartKind);
                        return (
                          <div className="px-1 pt-2">
                            <div className="flex items-center gap-1.5 px-1 pb-1 text-[0.6875rem] text-gray-500">
                              Jenis:
                              <select value={kind} onChange={(e) => { setChartKind(sec.chart!, e.target.value as ChartKind); bumpKind((x) => x + 1); }}
                                className="border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-800">
                                {validKinds(sec.chart).map((k) => <option key={k} value={k}>{CHART_KIND_LABEL[k]}</option>)}
                              </select>
                            </div>
                            <MiniChart chart={sec.chart} kind={kind} />
                          </div>
                        );
                      })()}
                      <div className="overflow-x-auto">
                        <table className="w-full text-[0.6875rem]">
                          <thead><tr className="text-left text-gray-500">{sec.head.map((h, j) => <th key={j} className="px-2 py-1 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
                          <tbody>{sec.rows.map((r, j) => (
                            <tr key={j} className="border-t border-gray-100">{r.map((c, l) => <td key={l} className={`px-2 py-1 align-top ${c.length <= 20 ? "whitespace-nowrap" : ""}`}>{c}</td>)}</tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {m.answer && !m.answer.unknown && m.question && m.answer.text && (
                  <div className="mt-2">
                    {deck.some((d) => d.answer === m.answer) ? (
                      <span className="inline-flex items-center gap-1 text-[0.6875rem] text-emerald-700"><Check className="w-3 h-3" /> Ada di daftar PPT</span>
                    ) : (
                      <button type="button" onClick={() => addToDeck(m.question!, m.answer!)}
                        className="inline-flex items-center gap-1 text-[0.6875rem] text-indigo-700 hover:underline"><FilePlus2 className="w-3 h-3" /> + PPT</button>
                    )}
                  </div>
                )}
                {m.answer && !m.answer.unknown && m.question && m.answer.text && (
                  <div className="mt-1.5 flex items-center gap-2 text-[0.6875rem] text-gray-500">
                    {fb[i] ? <span>{fb[i] === "up" ? "Terima kasih 👍" : "Dicatat, kucoba lagi 👎"}</span> : (
                      <>
                        <span>Jawabannya tepat?</span>
                        <button type="button" onClick={() => rate(i, m, true)} className="inline-flex items-center gap-1 hover:text-emerald-700"><ThumbsUp className="w-3 h-3" /> Ya</button>
                        <button type="button" onClick={() => rate(i, m, false)} className="inline-flex items-center gap-1 hover:text-red-600"><ThumbsDown className="w-3 h-3" /> Kurang</button>
                      </>
                    )}
                  </div>
                )}
                {m.alts && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {m.alts.map((a) => (
                      <button key={a.label} type="button" onClick={() => pickAlt(a)} className="text-left text-xs bg-white hover:bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-lg px-2.5 py-1.5">{a.label}</button>
                    ))}
                  </div>
                )}
                {m.answer?.chips && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {m.answer.chips.map((s) => (
                      <button key={s} type="button" onClick={() => ask(s)} className="text-left text-xs bg-white hover:bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-lg px-2.5 py-1.5">{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {busy && <div className="text-xs text-gray-500">⏳ Membuat PPT…</div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex items-center gap-2 p-3 border-t border-gray-200">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tulis pertanyaan, atau 'buat ppt …'"
          className="flex-1 min-w-0 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <button type="submit" disabled={!input.trim() || busy} aria-label="Kirim"
          className="bg-indigo-600 disabled:bg-gray-300 hover:bg-indigo-700 text-white rounded-lg p-2.5"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}
