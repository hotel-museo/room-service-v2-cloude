/** 운영시간 (site_settings.business_hours) — 서버의 is_order_time_open / is_menu_cut_off 와 같은 규칙 */
export interface BusinessHours {
  tz: string;
  slots: [string, string][];
  warnMinutes?: number;
  categoryCutoffs?: Record<string, string>;
}

export const DEFAULT_HOURS: BusinessHours = { tz: 'Asia/Seoul', slots: [], warnMinutes: 30, categoryCutoffs: {} };

const GRACE_MIN = 2;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 한국 시간 기준 하루 중 분 */
export function nowMinutes(now = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

export interface HoursState {
  open: boolean;
  /** 마감까지 남은 분 (열려 있을 때) */
  minutesToClose: number | null;
  /** 다음 주문 시작 시각 "17:30" (닫혀 있을 때) */
  nextOpen: string | null;
  warn: boolean;
}

export function hoursState(h: BusinessHours, now = new Date()): HoursState {
  if (!h.slots.length) return { open: true, minutesToClose: null, nextOpen: null, warn: false };
  const n = nowMinutes(now);
  for (const [a, b] of h.slots) {
    if (n >= toMin(a) && n < toMin(b) + GRACE_MIN) {
      const left = Math.max(0, toMin(b) - n);
      return { open: true, minutesToClose: left, nextOpen: null, warn: left <= (h.warnMinutes ?? 30) };
    }
  }
  const later = h.slots.map(([a]) => a).find((a) => toMin(a) > n);
  return { open: false, minutesToClose: null, nextOpen: later ?? h.slots[0][0], warn: false };
}

/** 카테고리 마감 시각이 지났으면 그 시각("20:00")을, 아니면 null */
export function cutoffFor(h: BusinessHours, category: string, now = new Date()): string | null {
  const cut = h.categoryCutoffs?.[category];
  if (!cut) return null;
  return nowMinutes(now) >= toMin(cut) ? cut : null;
}

export function hoursText(h: BusinessHours): string {
  return h.slots.map(([a, b]) => `${a}–${b}`).join(' · ');
}
