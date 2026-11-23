import type { Order } from './types';

/**
 * 여러 화면에서 같이 쓰는 표시 형식 (전부 한국 시간 기준).
 */
const KST = 'Asia/Seoul';

/** 주문번호 #0042 */
export const orderNo = (n: number) => '#' + String(n).padStart(4, '0');

/** 11. 24. 14:05 (없으면 빈 칸) */
export const kstDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

/** 14:05 (없으면 빈 칸) */
export const kstTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('ko-KR', { timeZone: KST, hour: '2-digit', minute: '2-digit', hour12: false }) : '';

/** 인쇄용 HTML에 넣을 글자 (특수문자 바꾸기) */
export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 짧은 메뉴 목록: "트러플 크림 파스타, 짬뽕 파스타 ×2" (세트 구성은 빼고) */
export const shortItems = (o: Order) => (o.order_items ?? []).map((it) => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');
