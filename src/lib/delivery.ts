/**
 * 손님 주문서의 '배달 방법'과 '예상 도착 시간'.
 * - 배달 방법은 orders.delivery_pref (knock 직접 전달 / door 벨(노크) 후 문 앞)
 * - 예상 도착 시간은 site_settings 'eta' — 보테가 관리자 설정에서 바꿔요. '바쁨'이면 busy 시간으로 보여요.
 */
export type DeliveryPref = 'knock' | 'door';
export const DELIVERY_PREFS: DeliveryPref[] = ['knock', 'door'];
/** 주문판·주방 영수증에 찍히는 한국어 */
export const DELIVERY_KO: Record<DeliveryPref, string> = {
  knock: '직접 전달',
  door: '벨(노크) 후 문 앞에 두기',
};

export interface EtaSettings {
  /** 평소 [최소, 최대] 분 */
  open: [number, number];
  /** '바쁨'일 때 [최소, 최대] 분 */
  busy: [number, number];
}
export const DEFAULT_ETA: EtaSettings = { open: [20, 30], busy: [40, 50] };
