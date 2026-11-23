/**
 * 관리자 화면 오른쪽의 '손님 화면 미리보기'.
 * - 손님 화면을 ?preview=1 로 열면 미리보기 모드: 주문은 들어가지 않습니다.
 * - 관리자가 메뉴·카테고리·영업 상태를 바꾸면 notifyPreview()로 알려서 미리보기가 바로 새로 불러옵니다.
 */
const CHANNEL = 'ph-preview-v1';

export const isPreview = typeof location !== 'undefined' && new URLSearchParams(location.search).get('preview') === '1';

/** 관리자 → 미리보기: "데이터 바뀌었습니다" */
export function notifyPreview() {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage('reload');
    ch.close();
  } catch {
    /* 지원 안 하는 브라우저면 미리보기의 주기적 새로고침에 맡깁니다 */
  }
}

/** 미리보기 쪽: 알림을 받으면 cb 실행. 해제 함수를 돌려줍니다. */
export function onPreviewChange(cb: () => void): () => void {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => cb();
    return () => ch.close();
  } catch {
    return () => undefined;
  }
}
