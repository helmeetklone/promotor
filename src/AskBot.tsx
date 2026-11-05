// AskBot.tsx — v139. Panel chat "Tanya Data" (melayang di pojok kanan bawah). Tanpa AI/API key:
// semua jawaban dihitung lokal di browser oleh askBot.ts dari data yang sedang tampil di dashboard.
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X, Sparkles } from "lucide-react";
import { buildDataset, answerQuestion, SUGGESTIONS, type Answer } from "./askBot";

type Msg = { from: "user" | "bot"; text: string; answer?: Answer };

export default function AskBot({ timestampResult, absensiResult, getTarget, scope }: {
  timestampResult: any; absensiResult: any; getTarget: (tenure: number) => number | null; scope: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  // Dataset baru dibangun saat panel pertama kali dibuka (dan ikut berubah kalau filter/ambang di dashboard berubah).
  const ds = useMemo(
    () => (open ? buildDataset(timestampResult?.all || [], absensiResult?.all || [], getTarget) : null),
    [open, timestampResult, absensiResult, getTarget]
  );

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, open]);

  const ask = (qRaw: string) => {
    const q = qRaw.trim();
    if (!q || !ds) return;
    let a: Answer;
    try { a = answerQuestion(q, ds, scope); }
    catch (e) { a = { text: "Maaf, ada error saat menghitung jawabannya. Coba ubah kalimat pertanyaannya." }; }
    setMsgs((m) => [...m, { from: "user", text: q }, { from: "bot", text: a.text, answer: a }]);
    setInput("");
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full shadow-lg px-4 py-3">
        <MessageCircle className="w-4 h-4" /> Tanya Data
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(94vw,440px)] h-[min(82vh,620px)] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="w-4 h-4" /> Tanya Data</div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="hover:bg-indigo-500 rounded p-1"><X className="w-4 h-4" /></button>
      </div>
      <div className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50 border-b border-gray-100">
        Jawaban dihitung dari data yang sedang tampil{scope && scope !== "Nasional" ? ` (${scope})` : " (nasional)"}.
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {msgs.length === 0 && (
          <div>
            <div className="text-gray-700 mb-2">Halo! Tanya soal GAR, NCA, target, jumlah promotor, atau anomali. Misalnya:</div>
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
              <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm px-3 py-2 max-w-[95%] min-w-0">
                <div className="whitespace-pre-line">{m.text}</div>
                {m.answer?.interpretasi && <div className="mt-1.5 text-[11px] text-gray-500 italic">{m.answer.interpretasi}</div>}
                {m.answer?.sections?.map((sec, k) => (
                  <div key={k} className="mt-2 bg-white border border-gray-200 rounded-lg overflow-x-auto">
                    {sec.title && <div className="px-2 py-1 text-[11px] font-semibold text-gray-600 bg-gray-50 border-b border-gray-200">{sec.title}</div>}
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-left text-gray-500">{sec.head.map((h, j) => <th key={j} className="px-2 py-1 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
                      <tbody>{sec.rows.map((r, j) => (
                        <tr key={j} className="border-t border-gray-100">{r.map((c, l) => <td key={l} className="px-2 py-1 align-top">{c}</td>)}</tr>
                      ))}</tbody>
                    </table>
                  </div>
                ))}
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
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex items-center gap-2 p-3 border-t border-gray-200">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tulis pertanyaan…"
          className="flex-1 min-w-0 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <button type="submit" disabled={!input.trim()} aria-label="Kirim"
          className="bg-indigo-600 disabled:bg-gray-300 hover:bg-indigo-700 text-white rounded-lg p-2.5"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}
