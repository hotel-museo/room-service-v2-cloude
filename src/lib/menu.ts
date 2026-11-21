import type { Lang, Menu, SetMenu } from './types';

type Named = {
  name: string;
  name_en: string | null;
  name_ja: string | null;
  name_zh: string | null;
  description: string | null;
  description_en: string | null;
  description_ja: string | null;
  description_zh: string | null;
};

export function nameOf(item: Named, lang: Lang): string {
  if (lang === 'en') return item.name_en || item.name;
  if (lang === 'ja') return item.name_ja || item.name_en || item.name;
  if (lang === 'zh') return item.name_zh || item.name_en || item.name;
  return item.name;
}

export function descOf(item: Named, lang: Lang): string {
  if (lang === 'en') return item.description_en || '';
  if (lang === 'ja') return item.description_ja || '';
  if (lang === 'zh') return item.description_zh || '';
  return item.description || '';
}

/** 한국어 화면에서는 영문명을, 외국어 화면에서는 한국어 원래 이름을 보조로 보여줍니다. */
export function subNameOf(item: Named, lang: Lang): string {
  return lang === 'ko' ? item.name_en || '' : item.name;
}

/**
 * 품절 판단 (기존 사이트와 같은 규칙)
 * - sold_out_until 이 미래면 품절
 * - is_available=false 이고 기한이 없으면 품절
 * - 기한이 지났으면 판매 중으로 봅니다 (자정 자동 해제)
 */
export function isSoldOut(menu: Pick<Menu, 'is_available' | 'sold_out_until'>, now = Date.now()): boolean {
  if (menu.sold_out_until) {
    const until = new Date(menu.sold_out_until).getTime();
    if (Number.isFinite(until)) return until > now;
  }
  return menu.is_available === false;
}

export function visibleMenus(menus: Menu[]): Menu[] {
  return menus.filter((m) => !m.is_hidden).sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.id - b.id);
}

export function visibleSets(sets: SetMenu[]): SetMenu[] {
  return sets.filter((s) => s.is_active && !s.is_hidden).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

export function setComponents(set: SetMenu) {
  return (set.config?.components ?? []).map((c) => ({
    category: c.category,
    count: Math.max(1, Number(c.count ?? c.quantity ?? 1)),
    menuIds: (c.menu_ids ?? []).map(Number),
    extras: c.extras ?? {},
  }));
}

/** 다음 한국 시간 자정 (품절 자동 해제 시각) */
export function nextKstMidnightIso(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const next = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) - 9 * 3600_000;
  return new Date(next).toISOString();
}

/** 오늘(한국 시간) 0시의 ISO 문자열 */
export function todayKstStartIso(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000).toISOString();
}

export const won = (n: number) => n.toLocaleString('ko-KR');
