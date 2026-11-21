import { useEffect, useState } from 'react';
import { nameOf } from '../lib/menu';
import type { Lang, Menu, OrderItem, SetMenu } from '../lib/types';

export interface CartLine {
  key: string;
  kind: 'menu' | 'set';
  id: number; // menu id 또는 set id
  qty: number;
  /** 세트 구성: 컴포넌트 순서대로 고른 메뉴 id 목록 */
  choices?: { category: string; ids: number[] }[];
}

const STORAGE_KEY = 'ph-cart-v1';

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* 저장 불가 환경은 무시 */
    }
  }, [lines]);

  const addMenu = (id: number, qty: number) =>
    setLines((prev) => {
      const found = prev.find((l) => l.kind === 'menu' && l.id === id);
      if (found) return prev.map((l) => (l === found ? { ...l, qty: Math.min(99, l.qty + qty) } : l));
      return [...prev, { key: `m${id}-${Date.now()}`, kind: 'menu', id, qty }];
    });

  const addSet = (id: number, choices: { category: string; ids: number[] }[]) =>
    setLines((prev) => [...prev, { key: `s${id}-${Date.now()}`, kind: 'set', id, qty: 1, choices }]);

  const setQty = (key: string, qty: number) =>
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty: Math.min(99, qty) } : l))));

  const clear = () => setLines([]);

  return { lines, addMenu, addSet, setQty, clear };
}

export interface ResolvedLine {
  line: CartLine;
  name: string;
  detail: string;
  image: string | null;
  unitPrice: number;
  total: number;
  valid: boolean;
}

/** 장바구니 줄을 현재 메뉴 데이터 기준으로 풀어냅니다. 사라진 메뉴는 valid=false */
export function resolveLines(lines: CartLine[], menus: Menu[], sets: SetMenu[], lang: Lang): ResolvedLine[] {
  const byId = new Map(menus.map((m) => [m.id, m]));
  const setById = new Map(sets.map((s) => [s.id, s]));
  return lines.map((line) => {
    if (line.kind === 'menu') {
      const m = byId.get(line.id);
      const unit = m?.price ?? 0;
      return { line, name: m ? nameOf(m, lang) : '—', detail: '', image: m?.image_url ?? null, unitPrice: unit, total: unit * line.qty, valid: !!m && !m.is_hidden };
    }
    const s = setById.get(line.id);
    const picked = (line.choices ?? []).flatMap((c) => c.ids.map((id) => byId.get(id)).filter(Boolean) as Menu[]);
    const unit = s?.price ?? 0;
    return {
      line,
      name: s ? nameOf(s, lang) : '—',
      detail: picked.map((m) => nameOf(m, lang)).join(' · '),
      image: s?.image_url ?? null,
      unitPrice: unit,
      total: unit * line.qty,
      valid: !!s && s.is_active && !s.is_hidden,
    };
  });
}

/** 주문 저장 형식 (기존 사이트·관리자 화면과 호환) */
export function toOrderItems(lines: CartLine[], menus: Menu[], sets: SetMenu[]): OrderItem[] {
  const byId = new Map(menus.map((m) => [m.id, m]));
  const setById = new Map(sets.map((s) => [s.id, s]));
  return lines.flatMap<OrderItem>((line) => {
    if (line.kind === 'menu') {
      const m = byId.get(line.id);
      if (!m) return [];
      return [{
        id: m.id, menu_id: m.id, name: m.name, name_en: m.name_en || m.name, name_ja: m.name_ja || m.name, name_zh: m.name_zh || m.name,
        price: m.price, quantity: line.qty, subtotal: m.price * line.qty,
        is_set: false, set_menu_id: null, set_components: null, set_component_text: '',
      }];
    }
    const s = setById.get(line.id);
    if (!s) return [];
    const components = (line.choices ?? []).map((c) => ({
      category: c.category,
      quantity: c.ids.length,
      items: c.ids.map((id) => {
        const m = byId.get(id);
        return { id, name: m?.name ?? '', name_en: m?.name_en ?? '', name_ja: m?.name_ja ?? '', name_zh: m?.name_zh ?? '' };
      }),
    }));
    return [{
      id: -s.id, name: s.name, name_en: s.name_en || s.name, name_ja: s.name_ja || s.name, name_zh: s.name_zh || s.name,
      price: s.price, quantity: line.qty, subtotal: s.price * line.qty,
      is_set: true, set_menu_id: s.id, set_components: components,
      set_component_text: components.flatMap((c) => c.items.map((i) => i.name)).join(', '),
    }];
  });
}
