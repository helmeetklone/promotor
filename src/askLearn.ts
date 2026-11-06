// Penyimpanan "belajar" Tanya Data — murni lokal di browser ini (localStorage), tanpa server dan tanpa AI.
// Isinya: (1) pelajaran kata→arti hasil koreksi pengguna, (2) pertanyaan yang pernah dinilai tepat (👍).
import type { Lesson } from "./askEngine";
import knowledge from "./askKnowledge.json";

const KL = "xlsmart-askbot-lessons-v1";
const KF = "xlsmart-askbot-favs-v1";

function read<T>(k: string): T[] {
  try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage penuh/diblokir: abaikan */ } }

export const loadLessons = (): Lesson[] => read<Lesson>(KL).filter((l) => l && typeof l.from === "string" && typeof l.to === "string");
export function saveLessons(l: Lesson[]) { write(KL, l); }
export function addLesson(list: Lesson[], l: Lesson): Lesson[] {
  const next = [...list.filter((x) => x.from !== l.from), l].slice(-100);
  saveLessons(next);
  return next;
}
export const loadFavs = (): string[] => read<string>(KF).filter((x) => typeof x === "string");
export function addFav(list: string[], q: string): string[] {
  const next = [...list.filter((x) => x !== q), q].slice(-60);
  write(KF, next);
  return next;
}
export function clearLearning() { try { localStorage.removeItem(KL); localStorage.removeItem(KF); } catch { /* abaikan */ } }

// Pengetahuan bawaan dari GitHub (src/askKnowledge.json) — berlaku untuk semua pengguna, tidak bisa dihapus dari browser.
export const BUILTIN_LESSONS: Lesson[] = ((knowledge as any).lessons || []).filter((l: any) => l && l.from && l.to);
export const BUILTIN_QUESTIONS: string[] = ((knowledge as any).questions || []).filter((x: any) => typeof x === "string");

// Gabungan bawaan + lokal; pelajaran lokal menimpa bawaan untuk kata yang sama.
export function mergedLessons(local: Lesson[]): Lesson[] {
  const m = new Map<string, Lesson>();
  [...BUILTIN_LESSONS, ...local].forEach((l) => m.set(l.from, l));
  return [...m.values()];
}
export function exportLearning(local: Lesson[], favs: string[]): string {
  return JSON.stringify({ lessons: mergedLessons(local), questions: [...new Set([...BUILTIN_QUESTIONS, ...favs])] }, null, 2);
}
