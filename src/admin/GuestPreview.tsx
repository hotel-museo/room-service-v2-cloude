import { useState } from 'react';
import type { Lang } from '../lib/types';

/**
 * 관리자 화면 오른쪽에 띄우는 '손님 화면 미리보기'.
 * 실제 손님 화면을 휴대폰 크기로 보여줘요. 미리보기에서는 주문이 들어가지 않아요.
 * 메뉴·카테고리·품절·영업 상태를 바꾸면 미리보기가 바로 새로 불러와요 (lib/preview.ts).
 */
const LANGS: [Lang, string][] = [['ko', '한'], ['en', 'EN'], ['ja', '日'], ['zh', '中']];
const VIEWS: [string, string][] = [['menu', '메뉴'], ['home', '첫 화면']];

export function GuestPreview({ onClose }: { onClose: () => void }) {
  const [lang, setLang] = useState<Lang>('ko');
  const [view, setView] = useState('menu');
  const [n, setN] = useState(0); // 바꾸면 iframe을 처음부터 다시 불러와요

  const src = `../?preview=1&lang=${lang}${view === 'menu' ? '&view=menu' : ''}`;

  return (
    <aside className="gpv" aria-label="손님 화면 미리보기">
      <div className="gpv-head">
        <strong>손님 화면</strong>
        <span className="meta">미리보기 · 주문 안 됨</span>
        <span className="grow" />
        <button type="button" className="gpv-icon" onClick={onClose} aria-label="미리보기 닫기" title="닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="gpv-bar">
        <div className="seg seg--sm" role="group" aria-label="화면">
          {VIEWS.map(([k, label]) => (
            <button type="button" key={k} className={view === k ? 'is-on is-open' : ''} aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
        <div className="seg seg--sm" role="group" aria-label="언어">
          {LANGS.map(([k, label]) => (
            <button type="button" key={k} className={lang === k ? 'is-on is-open' : ''} aria-pressed={lang === k} onClick={() => setLang(k)}>{label}</button>
          ))}
        </div>
        <span className="grow" />
        <button type="button" className="gpv-icon" onClick={() => setN((x) => x + 1)} aria-label="새로고침" title="처음부터 다시 불러오기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg>
        </button>
        <a className="gpv-icon" href={src} target="_blank" rel="noopener" aria-label="새 창으로 열기" title="새 창으로 크게 보기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
        </a>
      </div>
      <div className="gpv-phone">
        <iframe key={`${src}#${n}`} src={src} title="손님 주문 화면 미리보기" />
      </div>
    </aside>
  );
}
