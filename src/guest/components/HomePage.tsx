import { useEffect, useState } from 'react';
import type { StringKey } from '../../i18n/strings';
import type { Lang } from '../../lib/types';
import { supabase } from '../../lib/supabase';

/**
 * 호텔 뮤제오 첫 화면 (QR로 들어오면 처음 보는 곳).
 * 사진이 천천히 넘어가고, 그 위에 에디토리얼 스타일 서비스 목록이 있어요.
 * 사진은 site_settings 'hotel_portal' { photos: [{ url, caption }] } 에서 읽고, 없으면 임시 화면.
 */
interface Photo { url?: string; caption: string; tone: string }

const PLACEHOLDER: Photo[] = [
  { caption: 'Lobby', tone: 'radial-gradient(120% 80% at 70% 20%, #2c5a45 0%, #143a2a 45%, #08190f 100%)' },
  { caption: 'Guest Room', tone: 'radial-gradient(120% 80% at 30% 25%, #6e5b46 0%, #3d3226 50%, #17120c 100%)' },
  { caption: 'Bottega', tone: 'radial-gradient(120% 80% at 60% 20%, #9a4a2c 0%, #5c2814 50%, #1d0c05 100%)' },
];
const SLIDE_MS = 6000;
const LANG_SHORT: Record<Lang, string> = { ko: 'KO', en: 'EN', ja: 'JA', zh: 'ZH' };

function greetingKey(): StringKey {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false })) % 24;
  return h >= 5 && h < 12 ? 'home_gm' : h >= 12 && h < 18 ? 'home_ga' : 'home_ge';
}

export function HomePage({ lang, t, room, hasOrder, onRoomService, onMyOrder, onOpenLang }: {
  lang: Lang;
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
    const id = window.setInterval(() => setIdx((i) => (i + 1) % photos.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [photos.length]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 1600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const soon = (label: string) => setToast(`${label} · ${t('home_soon')}`);
  const items: { no: string; label: string; en: string; onClick: () => void; soon?: boolean }[] = [
    { no: '02', label: t('home_eat'), en: 'Dining Nearby', onClick: () => soon(t('home_eat')), soon: true },
    { no: '03', label: t('home_play'), en: 'Things to Do', onClick: () => soon(t('home_play')), soon: true },
    { no: '04', label: t('home_house'), en: 'Housekeeping', onClick: () => soon(t('home_house')), soon: true },
  ];
  const pad2 = (n: number) => String(n).padStart(2, '0');

  return (
    <main className="home">
      <div className="home-slides" aria-hidden="true">
        {photos.map((p, i) => (
          <div key={i} className={`home-slide${i === idx ? ' is-on' : ''}`} style={{ background: p.tone }}>
            {p.url && <img src={p.url} alt="" />}
          </div>
        ))}
      </div>
      <div className="home-shade" />

      <header className="home-top">
        <span className="home-mark">HOTEL MUSEO</span>
        <div className="home-top-r">
          {room && <span className="home-room">ROOM {room}</span>}
          <button type="button" className="home-lang" onClick={onOpenLang} aria-label="Language">{LANG_SHORT[lang]}</button>
        </div>
      </header>

      <section className="home-hero">
        <p className="home-greet">{t(greetingKey())}</p>
        <h1 className="home-title">
          <span>HOTEL</span>
          <span>MUSEO</span>
        </h1>
        <div className="home-rule" />
        <p className="home-tag">{t('home_tag')}</p>
      </section>


      <nav className="home-list" aria-label="Services">
        <div className="home-caption" aria-hidden="true">
          <span className="home-cap-no">{pad2(idx + 1)}</span>
          <span className="home-cap-bar"><i key={idx} style={{ animationDuration: `${SLIDE_MS}ms` }} /></span>
          <span className="home-cap-no home-cap-no--dim">{pad2(photos.length)}</span>
          <span className="home-cap-txt">{photos[idx]?.caption}</span>
        </div>
        <button type="button" className="home-row home-row--main" onClick={onRoomService}>
          <span className="home-no">01</span>
          <span className="home-lbl">
            <span className="home-lbl-main">{t('home_rs')}</span>
            <span className="home-lbl-sub">{t('home_rs_sub')}</span>
          </span>
          <span className="home-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 12h15M14 7l5 5-5 5" /></svg>
          </span>
        </button>
        {hasOrder && (
          <button type="button" className="home-order" onClick={onMyOrder}>
            <span className="home-dot" />{t('myOrder')}
          </button>
        )}
        {items.map((it) => (
          <button type="button" key={it.no} className="home-row" onClick={it.onClick}>
            <span className="home-no">{it.no}</span>
            <span className="home-lbl">
              <span className="home-lbl-main">{it.label}</span>
              {lang !== 'en' && <span className="home-lbl-en">{it.en}</span>}
            </span>
            <span className="home-soon">{t('home_soon')}</span>
          </button>
        ))}
      </nav>

      {toast && <div className="home-toast" role="status">{toast}</div>}
    </main>
  );
}
