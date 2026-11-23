/**
 * 손님 첫 화면 '문의하기' 연락처. site_settings 'contacts'에 저장, 보테가 관리자 설정에서 바꿉니다.
 * 번호가 비어 있는 곳은 손님 화면에 안 나옵니다.
 */
export interface Contacts {
  front: string;
  bottega: string;
  lounge: string;
}
export const EMPTY_CONTACTS: Contacts = { front: '', bottega: '', lounge: '' };
export const CONTACT_KEYS: (keyof Contacts)[] = ['front', 'bottega', 'lounge'];
export const CONTACT_LABEL_KO: Record<keyof Contacts, string> = { front: '프런트', bottega: '보테가', lounge: '아메리카노 라운지' };
/** 전화 걸기 주소: 숫자·+만 남깁니다 (예: 02-123-4567 → tel:021234567) */
export const telHref = (n: string) => 'tel:' + n.replace(/[^0-9+]/g, '');
