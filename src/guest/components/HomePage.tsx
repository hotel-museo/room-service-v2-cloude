import { useEffect, useState } from 'react';
import type { StringKey } from '../../i18n/strings';
import { supabase } from '../../lib/supabase';
import { Chevron, Globe } from './Icons';

/**
 * 호텔 뮤제오 첫 화면 (QR로 들어오면 처음 보는 곳).
 * 사진 2~3장이 천천히 넘어가고, 그 위에 서비스 버튼이 있어요.
 * 사진은 site_settings 'hotel_portal' { photos: [{ url, caption }] } 에서 읽고, 없으면 임시 화면.
 */
interface Photo { url?: string; caption: string; tone: string }

const PLACEHOLDER: Photo[] = [
  { caption: 'LOBBY', tone: 'linear-gradient(160deg, #1f4a37 0%, #123828 55%, #0b241a 100%)' },
  { caption: 'ROOM', tone: 'linear-gradient(160deg, #6b5a45 0%, #4a3d2f 60%, #2e261d 100%)' },
  { caption: 'BOTTEGA', tone: 'linear-gradient(160deg, #a5492a 0%, #7d3519 60%, #4f220f 100%)' },
];

const I = {
  dine: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17h16M6 17a6 6 0 0 1 12 0M12 8V6.5M10.5 6.5h3M3 20h18" /></svg>
  ),
  eat: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M17 21V3c-2 1.5-3 4-3 7h3" /></svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></svg>
  ),
  house: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 15h18M3 18v2M21 18v2M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" /></svg>
  ),
};

export function HomePage({ t, room, hasOrder, onRoomService, onMyOrder, onOpenLang }: {
  t: (k: StringKey, v?: Record<string, string | number>) => string;
  room: string;
  hasOrder: boolean;
  onRoomService: () => void;
  onMyOrder: () => void;
  onOpenLang: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>(PLACEHOLDER);
  const [idx, setIdx] = useState(0);
  const [toast, setToast] = useState('');

  useEffect(() => {
    void supabase.from('site_settings').select('settings').eq('key', 'hotel_portal').maybeSingle().then(({ data }) => {
      const list = (data?.settings as { photos?: { url: string; caption?: string }[] } | null)?.photos ?? [];
      if (list.length) setPhotos(list.slice(0, 5).map((p, i) => ({ url: p.url, caption: p.caption ?? '', tone: PLACEHOLDER[i % 3].tone })));
    });
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % photos.length), 5500);
    return () => window.clearInterval(id);
  }, [photos.length]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const soon = () => setToast(t('home_soon'));

  return (
    <main className="home">
      <div className="home-slides" aria-hidden="true">
        {photos.map((p, i) => (
          <div key={i} className={`home-slide${i === idx ? ' is-on' : ''}`} style={{ background: p.tone }}>
            {p.url && <img src={p.url} alt="" />}
            {!p.url && <span className="home-ph">{p.caption}</span>}
          </div>
        ))}
      </div>
      <div className="home-shade" />

      <div className="home-top">
        {room ? <span className="home-room">ROOM {room}</span> : <span />}
        <button type="button" className="pill pill--btn" onClick={onOpenLang} aria-label="Language"><Globe /> {t('langName')}</button>
      </div>

      <div className="home-brand">
        <div className="home-word">HOTEL MUSEO</div>
        <div className="home-rule" />
        <p className="home-tag">{t('home_tag')}</p>
      </div>

      <div className="home-bottom">
        <div className="home-dots" aria-hidden="true">
          {photos.map((_, i) => <span key={i} className={i === idx ? 'is-on' : ''} />)}
        </div>
        <button type="button" className="home-main" onClick={onRoomService}>
          <span className="home-ico">{I.dine}</span>
          <span className="home-main-txt">
            <strong>{t('home_rs')}</strong>
            <small>{t('home_rs_sub')}</small>
          </span>
          <Chevron size={18} />
        </button>
        {hasOrder && (
          <button type="button" className="home-order" onClick={onMyOrder}>{t('myOrder')} <Chevron size={14} /></button>
        )}
        <div className="home-grid">
          <button type="button" className="home-sub" onClick={soon}><span className="home-ico">{I.eat}</span>{t('home_eat')}</button>
          <button type="button" className="home-sub" onClick={soon}><span className="home-ico">{I.play}</span>{t('home_play')}</button>
          <button type="button" className="home-sub" onClick={soon}><span className="home-ico">{I.house}</span>{t('home_house')}</button>
        </div>
      </div>

      {toast && <div className="home-toast" role="status">{toast}</div>}
    </main>
  );
}
