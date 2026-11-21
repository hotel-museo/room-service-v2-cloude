import type { Lang } from './types';

/**
 * 주문 거절 사유. 관리자는 한국어로 고르고, 손님 화면에는 손님 언어로 번역돼 보여요.
 * 직접 입력한 사유는 번역 없이 그대로 보여요.
 */
export const REJECT_REASONS: Record<Lang, string>[] = [
  { ko: '주문하신 메뉴 중 품절된 메뉴가 있어요', en: 'Some items in your order are sold out.', ja: 'ご注文のメニューの一部が品切れです。', zh: '您点的部分菜品已售罄。' },
  { ko: '주방 마감 시간이에요', en: 'The kitchen has closed for today.', ja: '本日のキッチン営業は終了しました。', zh: '厨房今天已结束营业。' },
  { ko: '주문이 많아 지금은 어려워요', en: 'We are too busy to take this order right now.', ja: 'ただいまご注文が混み合っております。', zh: '目前订单较多，暂时无法接单。' },
  { ko: '객실 번호를 확인할 수 없어요', en: 'We could not verify your room number.', ja: '客室番号を確認できませんでした。', zh: '无法确认您的房间号。' },
];

// 예전에 쓰던 문구도 번역되게
const LEGACY: Record<string, number> = { '재료가 모두 소진됐어요': 0 };

/** 프리셋 사유면 손님 언어로, 직접 입력이면 null */
export function translateReason(reason: string, lang: Lang): string | null {
  const t = reason.trim();
  const i = REJECT_REASONS.findIndex((r) => r.ko === t);
  const idx = i >= 0 ? i : LEGACY[t];
  return idx === undefined ? null : REJECT_REASONS[idx][lang];
}
