import type { ChosenOption, Lang, OptionGroup, OptionItem, OptionLinks, SetMenu } from './types';
import { supabase } from './supabase';

export const EMPTY_LINKS: OptionLinks = { groups: [], byMenu: {}, bySet: {} };

export async function loadOptionLinks(): Promise<OptionLinks> {
  const [g, mg, sg] = await Promise.all([
    supabase.from('option_groups').select('*, option_items(*)').eq('is_active', true).order('sort_order'),
    supabase.from('menu_option_groups').select('menu_id, group_id, sort_order').order('sort_order'),
    supabase.from('set_option_groups').select('set_menu_id, group_id, sort_order').order('sort_order'),
  ]);
  if (g.error || mg.error || sg.error) return EMPTY_LINKS;
  const groups = (g.data as OptionGroup[]).map((x) => ({
    ...x,
    option_items: [...(x.option_items ?? [])].filter((i) => i.is_available).sort((a, b) => a.sort_order - b.sort_order),
  }));
  const byMenu: Record<number, number[]> = {};
  for (const r of mg.data as { menu_id: number; group_id: number }[]) (byMenu[r.menu_id] ??= []).push(r.group_id);
  const bySet: Record<number, number[]> = {};
  for (const r of sg.data as { set_menu_id: number; group_id: number }[]) (bySet[r.set_menu_id] ??= []).push(r.group_id);
  return { groups, byMenu, bySet };
}

export function groupsFor(links: OptionLinks, kind: 'menu' | 'set', id: number): OptionGroup[] {
  const ids = (kind === 'menu' ? links.byMenu[id] : links.bySet[id]) ?? [];
  return ids.map((gid) => links.groups.find((g) => g.id === gid)).filter((g): g is OptionGroup => !!g && g.option_items.length > 0);
}

export function optName(x: { name: string; name_en: string | null; name_ja: string | null; name_zh: string | null }, lang: Lang): string {
  if (lang === 'en') return x.name_en || x.name;
  if (lang === 'ja') return x.name_ja || x.name_en || x.name;
  if (lang === 'zh') return x.name_zh || x.name_en || x.name;
  return x.name;
}

export function groupDesc(g: OptionGroup, lang: Lang): string {
  if (lang === 'en') return g.description_en || '';
  if (lang === 'ja') return g.description_ja || '';
  if (lang === 'zh') return g.description_zh || '';
  return g.description || '';
}

/** 필수 1개짜리 그룹은 첫 항목(대부분 "기본")을 미리 골라 둡니다 */
export function defaultSelection(groups: OptionGroup[]): number[] {
  return groups.filter((g) => g.min_select === 1 && g.max_select === 1).map((g) => g.option_items[0].id);
}

export function isSelectionValid(groups: OptionGroup[], selected: number[]): boolean {
  return groups.every((g) => {
    const n = g.option_items.filter((i) => selected.includes(i.id)).length;
    return n >= g.min_select && n <= g.max_select;
  });
}

/** 그룹 규칙에 맞게 한 항목을 켜고 끕니다 */
export function toggleOption(groups: OptionGroup[], selected: number[], item: OptionItem): number[] {
  const g = groups.find((x) => x.id === item.group_id);
  if (!g) return selected;
  const inGroup = g.option_items.map((i) => i.id);
  const mine = selected.filter((id) => inGroup.includes(id));
  if (selected.includes(item.id)) {
    if (g.max_select === 1 && g.min_select === 1) return selected; // 라디오는 끌 수 없음
    return selected.filter((id) => id !== item.id);
  }
  if (g.max_select === 1) return [...selected.filter((id) => !inGroup.includes(id)), item.id];
  if (mine.length >= g.max_select) return selected;
  return [...selected, item.id];
}

export function optionItemsById(links: OptionLinks): Map<number, OptionItem> {
  const m = new Map<number, OptionItem>();
  links.groups.forEach((g) => g.option_items.forEach((i) => m.set(i.id, i)));
  return m;
}

export function optionsPrice(links: OptionLinks, ids: number[]): number {
  const m = optionItemsById(links);
  return ids.reduce((a, id) => a + (m.get(id)?.price ?? 0), 0);
}

export function toChosen(links: OptionLinks, ids: number[]): ChosenOption[] {
  const m = optionItemsById(links);
  return ids.flatMap((id) => {
    const it = m.get(id);
    if (!it) return [];
    return [{ group_id: it.group_id, item_id: it.id, name: it.name, name_en: it.name_en || it.name, name_ja: it.name_ja || it.name, name_zh: it.name_zh || it.name, price: it.price }];
  });
}

/** 세트 구성에서 고급 메뉴 추가금 합계 */
export function setExtras(set: SetMenu, choices: { ids: number[] }[]): number {
  const comps = set.config?.components ?? [];
  return choices.reduce((a, c, i) => a + c.ids.reduce((b, id) => b + Number(comps[i]?.extras?.[String(id)] ?? 0), 0), 0);
}
