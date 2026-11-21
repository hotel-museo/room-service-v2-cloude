import type { Menu } from './types';

/**
 * 카테고리 순서: site_settings.category_order 의 순서를 따르고,
 * 목록에 없는 카테고리(메뉴에만 있는 것)는 메뉴 순서대로 뒤에 붙입니다.
 */
export function orderedCategories(order: string[], menus: Menu[]): string[] {
  const out = [...order];
  [...menus]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .forEach((m) => {
      if (!out.includes(m.category)) out.push(m.category);
    });
  return out;
}
