// askPpt.ts — v139. Membuat PPT dari jawaban-jawaban "Tanya Data". Isi slide mengikuti pertanyaan yang diminta:
// tiap jawaban jadi slide temuan + (kalau ada) slide grafik asli (bisa diedit di PowerPoint) + slide tabel,
// ditutup slide catatan/definisi. Gaya (palet, font, logo) sama dengan "Export ke PPT" di dashboard.
import pptxgen from "pptxgenjs";
import type { Answer, Section } from "./askEngine";

export type DeckItem = { question: string; answer: Answer };
export type DeckMeta = { scope: string; period: string | null; title?: string; logos?: { dark: string; light: string } };

const NAVY = "2316AA", PINK = "EA3363", ICE = "D8D2F5", WHITE = "FFFFFF", INK = "1F2937", MUTED = "6B7280", TEAL = "0D9488";
const CARD = "F7F9FC", LINE = "E2E8F0";
const HEAD = "Cambria", BODY = "Calibri";
const W = 13.33, H = 7.5;
const ROWS_PER_SLIDE = 10;

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export async function buildDeck(items: DeckItem[], meta: DeckMeta): Promise<{ slides: number; fileName: string; outline: string[] }> {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  const today = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  const outline: string[] = [];
  let n = 0;

  const newSlide = (dark: boolean) => { const s = pres.addSlide(); s.background = { color: dark ? NAVY : WHITE }; n++; return s; };
  const logo = (s: any, dark: boolean) => {
    const b64 = meta.logos && (dark ? meta.logos.dark : meta.logos.light);
    if (b64) s.addImage({ data: `data:image/png;base64,${b64}`, x: W - 2.25, y: 0.42, w: 1.75, h: 0.32 });
  };
  const kicker = (s: any, t: string) => s.addText(t.toUpperCase(), { x: 0.7, y: 0.55, w: 8, h: 0.35, fontFace: BODY, fontSize: 12, bold: true, color: PINK, charSpacing: 2, margin: 0 });
  const title = (s: any, t: string) => s.addText(cut(t, 90), { x: 0.7, y: 0.9, w: 10.4, h: 0.9, fontFace: HEAD, fontSize: 26, bold: true, color: NAVY, margin: 0, valign: "top" });
  const footer = (s: any) => {
    s.addText(`Sumber: data yang di-upload ke dashboard  •  ${meta.scope}${meta.period ? "  •  " + meta.period : ""}`, { x: 0.7, y: H - 0.55, w: 10, h: 0.3, fontFace: BODY, fontSize: 9, color: "9CA3AF", margin: 0 });
    s.addText(String(n).padStart(2, "0"), { x: W - 0.9, y: H - 0.55, w: 0.6, h: 0.3, fontFace: BODY, fontSize: 10, color: "9CA3AF", align: "right", margin: 0 });
  };

  // 1) Judul
  {
    const s = newSlide(true);
    s.addShape("ellipse", { x: 9.9, y: -2.0, w: 6.2, h: 6.2, fill: { color: "3B2CC4" }, line: { type: "none" } });
    s.addShape("ellipse", { x: 11.6, y: -0.6, w: 3.4, h: 3.4, fill: { color: PINK }, line: { type: "none" } });
    s.addText("TANYA DATA", { x: 0.9, y: 2.5, w: 10, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: ICE, charSpacing: 3, margin: 0 });
    s.addText(meta.title || "Ringkasan Data Promotor", { x: 0.9, y: 2.95, w: 11, h: 1.3, fontFace: HEAD, fontSize: 34, bold: true, color: WHITE, margin: 0 });
    s.addText(`${meta.scope}${meta.period ? "  •  " + meta.period : ""}  •  dibuat ${today}`, { x: 0.9, y: 4.2, w: 11, h: 0.5, fontFace: BODY, fontSize: 14, italic: true, color: ICE, margin: 0 });
    logo(s, true);
  }

  const tableSlides = (sec: Section, heading: string) => {
    const head = sec.head, rows = sec.rows;
    if (!rows.length) return;
    const weights = head.map((h, i) => (i === 0 && h === "#" ? 0.5 : i === 1 || (i === 0 && h !== "#") ? 3 : 1.4));
    const tot = weights.reduce((a, b) => a + b, 0);
    const colW = weights.map((w) => (w / tot) * 11.9);
    const pages = Math.ceil(rows.length / ROWS_PER_SLIDE);
    for (let pg = 0; pg < pages; pg++) {
      const s = newSlide(false);
      kicker(s, "Rincian");
      title(s, heading + (pages > 1 ? ` (${pg + 1}/${pages})` : ""));
      const hdr = head.map((h) => ({ text: h, options: { bold: true, color: WHITE, fill: { color: NAVY }, fontFace: BODY, fontSize: 12 } }));
      const body = rows.slice(pg * ROWS_PER_SLIDE, (pg + 1) * ROWS_PER_SLIDE).map((r, ri) =>
        r.map((c) => ({ text: c, options: { color: INK, fontFace: BODY, fontSize: 12, fill: { color: ri % 2 ? CARD : WHITE } } })));
      s.addTable([hdr, ...body] as any, { x: 0.7, y: 1.95, w: 11.9, colW, rowH: 0.42, border: { type: "solid", color: LINE, pt: 0.75 }, valign: "middle" });
      logo(s, false); footer(s);
    }
  };

  // 2) Per jawaban
  items.forEach((it, idx) => {
    const q = cap(it.question.trim().replace(/\?+$/, ""));
    outline.push(q);
    const a = it.answer;
    {
      const s = newSlide(false);
      kicker(s, `Temuan ${idx + 1}`);
      title(s, q);
      const lines = a.text.split("\n").map((l) => l.trim()).filter(Boolean);
      const cardH = Math.min(a.interpretasi ? 3.3 : 4.4, 0.9 + lines.reduce((t, l) => t + Math.ceil(l.length / 95), 0) * 0.62);
      s.addShape("roundRect", { x: 0.7, y: 1.95, w: 11.9, h: cardH, rectRadius: 0.08, fill: { color: CARD }, line: { color: LINE, width: 1 } });
      s.addText(lines.map((l) => ({ text: l, options: { bullet: lines.length > 1, breakLine: true, paraSpaceAfter: 10 } })) as any, {
        x: 1.0, y: 2.1, w: 11.3, h: a.interpretasi ? 3.0 : 4.1, fontFace: BODY, fontSize: lines.join(" ").length > 400 ? 15 : 19, color: INK, valign: "top", margin: 0, lineSpacingMultiple: 1.15,
      });
      if (a.interpretasi) s.addText(cut(a.interpretasi, 520), { x: 0.7, y: 1.95 + cardH + 0.2, w: 11.9, h: 1.4, fontFace: BODY, fontSize: 11, italic: true, color: MUTED, valign: "top", margin: 0, lineSpacingMultiple: 1.2 });
      logo(s, false); footer(s);
    }
    (a.sections || []).forEach((sec) => {
      const heading = sec.title || q;
      if (sec.chart && sec.chart.labels.length) {
        const c = sec.chart;
        const s = newSlide(false);
        kicker(s, "Grafik");
        title(s, heading);
        const horizontal = c.labels.length > 6;
        const code = c.fmt === "pct" ? '0.0"%"' : "#,##0";
        s.addChart(pres.ChartType.bar, c.series.map((sr) => ({ name: sr.name, labels: c.labels, values: sr.values })), {
          x: 0.7, y: 1.9, w: 11.9, h: 4.85, barDir: horizontal ? "bar" : "col", barGrouping: "clustered",
          chartColors: c.series.length > 1 ? [NAVY, PINK, TEAL] : [NAVY], showLegend: c.series.length > 1, legendPos: "b", legendFontSize: 11, legendFontFace: BODY,
          showValue: true, dataLabelFontSize: 10, dataLabelFormatCode: code, valAxisLabelFormatCode: code, valAxisHidden: true,
          catAxisLabelFontSize: 10, catAxisLabelFontFace: BODY, catAxisOrientation: horizontal ? "maxMin" : "minMax",
          valGridLine: { style: "none" }, catGridLine: { style: "none" },
        } as any);
        logo(s, false); footer(s);
        outline.push("   ↳ grafik: " + heading);
      }
      tableSlides(sec, heading);
    });
  });

  // 3) Catatan & definisi
  {
    const s = newSlide(false);
    kicker(s, "Catatan");
    title(s, "Catatan & Definisi");
    const notes = [
      `Seluruh angka dihitung dari data yang di-upload ke dashboard${meta.period ? ` (${meta.period})` : ""}; cakupan: ${meta.scope}.`,
      "Target NCA per promotor menurut masa kerja: < 1 bulan = 75, 1 – < 3 bulan = 120, ≥ 3 bulan = 150. Target region/cluster = jumlah target promotor di dalamnya.",
      "Anomali = promotor dengan minimal satu kejadian yang ditandai dashboard (GPS, zona absen, status, durasi). \"GPS Toko N/A\" ikut dihitung dan merupakan kekurangan data toko, bukan pelanggaran promotor.",
      "Kalau ada \"perkiraan akhir bulan\": itu proyeksi kasar dari laju harian yang dianggap tetap, tanpa memperhitungkan hari libur.",
      "Dashboard ini titik awal investigasi, bukan bukti final — kroscek manual dianjurkan sebelum dipakai untuk keputusan.",
    ];
    s.addText(notes.map((t) => ({ text: t, options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } })) as any, { x: 0.7, y: 1.95, w: 11.9, h: 4.6, fontFace: BODY, fontSize: 15, color: INK, valign: "top", margin: 0, lineSpacingMultiple: 1.15 });
    logo(s, false); footer(s);
  }

  const fileName = `Tanya-Data-${new Date().toISOString().slice(0, 10)}.pptx`;
  await pres.writeFile({ fileName });
  return { slides: n, fileName, outline };
}
