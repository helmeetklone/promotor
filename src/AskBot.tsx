// AskBot.tsx — v139. Panel chat "Tanya Data" (melayang di pojok kanan bawah). Tanpa AI/API key:
// semua jawaban dihitung lokal di browser oleh askEngine.ts dari data yang sedang tampil di dashboard.
// Bisa menampilkan grafik di chat dan membuat PPT (askPpt.ts) dari jawaban-jawaban yang diminta.
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X, Sparkles, BarChart3, FilePlus2, Download, Check } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LabelList, ResponsiveContainer } from "recharts";
import { buildDataset, answerQuestion, pptRequest, periodText, SUGGESTIONS, PPT_PRESET, type Answer, type Chart } from "./askEngine";
import { buildDeck, type DeckItem } from "./askPpt";

type Msg = { from: "user" | "bot"; text: string; answer?: Answer; question?: string };

const COLORS = ["#2316AA", "#EA3363", "#0D9488"];
const nf = (v: number, f: "num" | "pct") => (f === "pct" ? v.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%" : Math.round(v).toLocaleString("id-ID"));
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function MiniChart({ chart }: { chart: Chart }) {
  const data = chart.labels.map((l, i) => {
    const row: any = { name: l };
    chart.series.forEach((s, k) => { row["s" + k] = s.values[i]; });
    return row;
  });
  const h = Math.max(150, chart.labels.length * (chart.series.length > 1 ? 46 : 28) + 40);
  return (
    <div style={{ width: "100%", height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 10 }} tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)} interval={0} />
          <Tooltip formatter={(v: any) => nf(Number(v), chart.fmt)} />
          {chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {chart.series.map((s, k) => (
            <Bar key={k} dataKey={"s" + k} name={s.name} fill={COLORS[k % COLORS.length]} radius={[0, 3, 3, 0]}>
              <LabelList dataKey={"s" + k} position="right" fontSize={10} formatter={(v: any) => nf(Number(v), chart.fmt)} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
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
  const endRef = useRef<HTMLDivElement>(null);

  // Dataset baru dibangun saat panel pertama kali dibuka (dan ikut berubah kalau filter/ambang di dashboard berubah).
  const ds = useMemo(
    () => (open ? buildDataset(timestampResult?.all || [], absensiResult?.all || [], getTarget) : null),
    [open, timestampResult, absensiResult, getTarget]
  );

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, open]);

  const safeAnswer = (q: string): Answer => {
    try { return answerQuestion(q, ds!, scope); }
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
        botSay(`Aku belum bisa menentukan isi PPT dari "${pr.topic}". Sebutkan topiknya seperti pertanyaan biasa, misalnya:`, { answer: { text: "", chips: ["Buat PPT status achieve per region", "Buat PPT anomali per region", "Buat PPT GAR tertinggi per cluster"] } });
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

  const ask = async (qRaw: string) => {
    const q = qRaw.trim();
    if (!q || !ds || busy) return;
    setMsgs((m) => [...m, { from: "user", text: q }]);
    setInput("");
    const pr = pptRequest(q);
    if (pr) { await handlePpt(pr); return; }
    const a = safeAnswer(q);
    setMsgs((m) => [...m, { from: "bot", text: a.text, answer: a, question: q }]);
  };

  const addToDeck = (question: string, answer: Answer) => setDeck((d) => (d.some((x) => x.answer === answer) ? d : [...d, { question, answer }]));
  const chartShown = (key: string, a: Answer) => (key in chartOverride ? chartOverride[key] : !!a.wantChart);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full shadow-lg px-4 py-3">
        <MessageCircle className="w-4 h-4" /> Tanya Data
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(94vw,460px)] h-[min(84vh,660px)] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="w-4 h-4" /> Tanya Data</div>
        <div className="flex items-center gap-1">
          {deck.length > 0 && (
            <>
              <button type="button" disabled={busy} onClick={() => makeDeck(deck, "Ringkasan Data Promotor")}
                className="flex items-center gap-1 text-[11px] bg-white/20 hover:bg-white/30 disabled:opacity-60 rounded px-2 py-1"><Download className="w-3 h-3" /> PPT ({deck.length})</button>
              <button type="button" onClick={() => setDeck([])} className="text-[11px] hover:bg-indigo-500 rounded px-1.5 py-1" title="Kosongkan daftar PPT">Kosongkan</button>
            </>
          )}
          <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="hover:bg-indigo-500 rounded p-1"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50 border-b border-gray-100">
        Jawaban dihitung dari data yang sedang tampil{scope && scope !== "Nasional" ? ` (${scope})` : " (nasional)"}.
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {msgs.length === 0 && (
          <div>
            <div className="text-gray-700 mb-2">Halo! Tanya soal GAR, NCA, target, jumlah promotor, atau anomali. Bisa juga minta grafik atau PPT. Misalnya:</div>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
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
            <div key={i} className="flex justify-start">
              <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[96%] min-w-0">
                {m.text && <div className="whitespace-pre-line">{m.text}</div>}
                {m.answer?.interpretasi && <div className="mt-1.5 text-[11px] text-gray-500 italic">{m.answer.interpretasi}</div>}
                {m.answer?.sections?.map((sec, k) => {
                  const key = `${i}-${k}`;
                  const show = !!sec.chart && chartShown(key, m.answer!);
                  return (
                    <div key={k} className="mt-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-2 py-1 bg-gray-50 border-b border-gray-200">
                        <div className="text-[11px] font-semibold text-gray-600">{sec.title || "Rincian"}</div>
                        {sec.chart && (
                          <button type="button" onClick={() => setChartOverride((o) => ({ ...o, [key]: !show }))}
                            className="flex items-center gap-1 text-[11px] text-indigo-700 hover:underline"><BarChart3 className="w-3 h-3" /> {show ? "Sembunyikan grafik" : "Grafik"}</button>
                        )}
                      </div>
                      {show && sec.chart && <div className="px-1 pt-2"><MiniChart chart={sec.chart} /></div>}
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
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
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><Check className="w-3 h-3" /> Ada di daftar PPT</span>
                    ) : (
                      <button type="button" onClick={() => addToDeck(m.question!, m.answer!)}
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-700 hover:underline"><FilePlus2 className="w-3 h-3" /> + PPT</button>
                    )}
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
        <div ref={endRef} />
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
