import { autoTranslate } from './api';

/**
 * 메뉴·세트·카테고리 외국어(영어·일본어·중국어) 채우기 규칙.
 * - 번역 칸이 비어 있으면 → 자동 번역
 * - 한국어를 바꿨는데 번역은 직접 안 고쳤으면 → 바뀐 부분만 다시 자동 번역 (예전 번역이 남지 않게)
 * - 직원이 직접 고친 번역은 건드리지 않음
 * - force면 전부 다시 번역
 * 자동 번역은 틀릴 수 있어서(특히 메뉴 이름) 사람이 한 번 확인해야 합니다.
 */
export const TR_LANGS = ['en', 'ja', 'zh'] as const;
export type TrLang = (typeof TR_LANGS)[number];

/** 번역 칸에 한글이 남아 있는지 (자동 번역이 일부만 번역한 경우) */
export const hasHangul = (s?: string | null) => !!s && /[가-힣]/.test(s);

type Form = Record<string, string>;
type Orig = Record<string, unknown> | null | undefined;

const str = (v: unknown) => (typeof v === 'string' ? v : '').trim();

/** 한국어 칸(bases) 중 처음 값(orig)과 달라진 것 */
export function changedBases(form: Form, bases: string[], orig: Orig): string[] {
  if (!orig) return [];
  return bases.filter((b) => str(form[b]) !== str(orig[b]));
}

export async function fillTranslations<T extends Form>(
  form: T,
  bases: string[],
  opts: { orig?: Orig; touched: Set<string>; force?: boolean },
): Promise<{ next: T; failed: boolean; count: number }> {
  const next: Form = { ...form };
  const changed = new Set(changedBases(form, bases, opts.orig));
  let failed = false;
  let count = 0;
  for (const b of bases) {
    const src = str(form[b]);
    for (const l of TR_LANGS) {
      const key = `${b}_${l}`;
      if (!(key in next)) continue;
      if (!src) {
        // 한국어를 지웠으면 그 번역도 비워요 (직접 고친 경우 제외)
        if (changed.has(b) && !opts.touched.has(key)) next[key] = '';
        continue;
      }
      const need = opts.force || !str(next[key]) || (changed.has(b) && !opts.touched.has(key));
      if (!need) continue;
      try {
        next[key] = await autoTranslate(src, l);
        count++;
      } catch {
        failed = true;
      }
    }
  }
  return { next: next as T, failed, count };
}
