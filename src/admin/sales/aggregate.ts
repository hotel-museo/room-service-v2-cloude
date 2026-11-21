import type { Menu, Order, SetMenu } from '../../lib/types';

export const KST = 9 * 3600_000;

/** 'YYYY-MM-DD'(한국 날짜) → 그날 0시의 UTC 시각 */
export function kstDayStart(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - KST);
}

export function kstYmd(date: Date): string {
  const k = new Date(date.getTime() + KST);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(ymd: string, n: number): string {
  return kstYmd(new Date(kstDayStart(ymd).getTime() + n * 86400_000));
}

export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom';

export function presetRange(p: Preset, now = new Date()): { from: string; to: string } {
  const today = kstYmd(now);
  const [y, m] = today.split('-').map(Number);
  const firstOf = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  switch (p) {
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'week': return { from: addDays(today, -6), to: today };
    case 'month': return { from: firstOf(y, m), to: today };
    case 'lastMonth': {
      const ly = m === 1 ? y - 1 : y, lm = m === 1 ? 12 : m - 1;
      return { from: firstOf(ly, lm), to: addDays(firstOf(y, m), -1) };
    }
    default: return { from: today, to: today };
  }
}

export interface RankRow {
  key: string;
  name: string;
  kind: 'menu' | 'set';
  category: string;
  soloQty: number; // 단품으로 팔린 수량 (세트는 세트 수량)
  inSetQty: number; // 세트 구성으로 골라진 수량
  revenue: number; // 단품(또는 세트) 매출
  orders: number; // 들어간 주문 건수
}

export interface SalesSummary {
  completed: Order[];
  revenue: number;
  avg: number;
  roomRevenue: number;
  cardRevenue: number;
  rejected: Order[];
  inProgress: Order[];
  ranking: RankRow[];
  byHour: { hour: number; orders: number; revenue: number }[];
  byDay: { day: string; orders: number; revenue: number }[];
}

export function summarize(orders: Order[], menus: Menu[], sets: SetMenu[], from: string, to: string): SalesSummary {
  const completed = orders.filter((o) => o.status === 'completed');
  const rejected = orders.filter((o) => o.status === 'rejected');
  const inProgress = orders.filter((o) => o.status === 'pending' || o.status === 'cooking' || !o.status);
  const sum = (list: Order[]) => list.reduce((a, o) => a + (o.total_amount ?? 0), 0);
  const revenue = sum(completed);

  const menuById = new Map(menus.map((m) => [m.id, m]));
  const setById = new Map(sets.map((s) => [s.id, s]));
  const rows = new Map<string, RankRow>();
  const row = (key: string, init: () => RankRow) => {
    if (!rows.has(key)) rows.set(key, init());
    return rows.get(key)!;
  };

  for (const o of completed) {
    const seen = new Set<string>();
    for (const it of o.order_items ?? []) {
      if (it.is_set) {
        const sid = Number(it.set_menu_id);
        const key = `set:${sid}`;
        const r = row(key, () => ({ key, name: setById.get(sid)?.name ?? it.name, kind: 'set', category: 'SET', soloQty: 0, inSetQty: 0, revenue: 0, orders: 0 }));
        r.soloQty += it.quantity;
        r.revenue += it.price * it.quantity;
        if (!seen.has(key)) { r.orders += 1; seen.add(key); }
        for (const c of it.set_components ?? []) {
          for (const ch of c.items) {
            const mk = `menu:${ch.id}`;
            const m = menuById.get(ch.id);
            const mr = row(mk, () => ({ key: mk, name: m?.name ?? ch.name, kind: 'menu', category: m?.category ?? '', soloQty: 0, inSetQty: 0, revenue: 0, orders: 0 }));
            mr.inSetQty += it.quantity;
            if (!seen.has(mk)) { mr.orders += 1; seen.add(mk); }
          }
        }
      } else {
        const id = Number(it.menu_id ?? it.id);
        const key = `menu:${id}`;
        const m = menuById.get(id);
        const r = row(key, () => ({ key, name: m?.name ?? it.name, kind: 'menu', category: m?.category ?? '', soloQty: 0, inSetQty: 0, revenue: 0, orders: 0 }));
        r.soloQty += it.quantity;
        r.revenue += it.price * it.quantity;
        if (!seen.has(key)) { r.orders += 1; seen.add(key); }
      }
    }
  }

  const hourMap = new Map<number, { orders: number; revenue: number }>();
  const dayMap = new Map<string, { orders: number; revenue: number }>();
  for (const o of completed) {
    const t = new Date(o.ordered_at || o.created_at);
    const h = new Date(t.getTime() + KST).getUTCHours();
    const d = kstYmd(t);
    const hv = hourMap.get(h) ?? { orders: 0, revenue: 0 };
    hv.orders += 1; hv.revenue += o.total_amount ?? 0; hourMap.set(h, hv);
    const dv = dayMap.get(d) ?? { orders: 0, revenue: 0 };
    dv.orders += 1; dv.revenue += o.total_amount ?? 0; dayMap.set(d, dv);
  }
  // 영업시간대(11~21시)는 주문이 없어도 칸을 보여줌
  const hours = new Set<number>([...hourMap.keys(), ...Array.from({ length: 11 }, (_, i) => 11 + i)]);
  const byHour = [...hours].sort((a, b) => a - b).map((hour) => ({ hour, ...(hourMap.get(hour) ?? { orders: 0, revenue: 0 }) }));
  const byDay: SalesSummary['byDay'] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) byDay.push({ day: d, ...(dayMap.get(d) ?? { orders: 0, revenue: 0 }) });

  return {
    completed,
    revenue,
    avg: completed.length ? Math.round(revenue / completed.length) : 0,
    roomRevenue: sum(completed.filter((o) => o.payment_method === 'checkout')),
    cardRevenue: sum(completed.filter((o) => o.payment_method !== 'checkout')),
    rejected,
    inProgress,
    ranking: [...rows.values()],
    byHour,
    byDay,
  };
}

/** 엑셀에서 한글이 깨지지 않는 CSV 다운로드 */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function itemSummary(o: Order): string {
  return (o.order_items ?? [])
    .map((it) => {
      const sub = it.is_set ? ` (${(it.set_components ?? []).flatMap((c) => c.items.map((i) => i.name)).join(', ')})` : '';
      return `${it.name}${sub} ×${it.quantity}`;
    })
    .join(' / ');
}
