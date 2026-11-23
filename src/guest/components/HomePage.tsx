import { useEffect, useState } from 'react';
import type { StringKey } from '../../i18n/strings';
import type { Lang } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { CONTACT_KEYS, EMPTY_CONTACTS, telHref, type Contacts } from '../../lib/contacts';
import { Sheet } from './Sheet';

/**
 * 호텔 뮤제오 첫 화면 (QR로 들어오면 처음 보는 곳).
 * 사진이 천천히 넘어가고, 그 위에 에디토리얼 스타일 서비스 목록이 있어요.
 * 사진은 site_settings 'hotel_portal' { photos: [{ url, caption }] } 에서 읽고, 없으면 임시 화면.
 */
interface Photo { url?: string; caption: string; tone: string; pos?: string }

const PLACEHOLDER: Photo[] = [
  { caption: 'Lobby', tone: 'radial-gradient(120% 80% at 70% 20%, #2c5a45 0%, #143a2a 45%, #08190f 100%)' },
  { caption: 'Guest Room', tone: 'radial-gradient(120% 80% at 30% 25%, #6e5b46 0%, #3d3226 50%, #17120c 100%)' },
  { caption: 'Bottega', tone: 'radial-gradient(120% 80% at 60% 20%, #9a4a2c 0%, #5c2814 50%, #1d0c05 100%)' },
];
const SLIDE_MS = 6000;
const B = import.meta.env.BASE_URL;
// 호텔에서 받은 사진 (관리자에서 바꾸기 전 기본값)
const HOTEL_PHOTOS: Photo[] = [
  { url: `${B}hotel/entrance.jpg`, caption: 'Entrance', tone: PLACEHOLDER[1].tone, pos: '62% 50%' },
  { url: `${B}hotel/garden.jpg`, caption: 'Garden', tone: PLACEHOLDER[0].tone, pos: '52% 50%' },
  { url: `${B}hotel/passage.jpg`, caption: 'Passage', tone: PLACEHOLDER[0].tone, pos: '50% 50%' },
];
const LANG_SHORT: Record<Lang, string> = { ko: 'KO', en: 'EN', ja: 'JA', zh: 'ZH' };

const ICON = {
  dine: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 17.5h17M5.5 17.5a6.5 6.5 0 0 1 13 0M12 11V9.2M10.6 9.2h2.8M4 20.5h16" /></svg>,
  tour: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h3l1.5-2.5h8l1.5 2.5h3v11h-17z" /><circle cx="12" cy="12.8" r="3.4" /></svg>,
  phone: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.6l1.5 4-2 1.3a10.5 10.5 0 0 0 6.5 6.5l1.3-2 4 1.5v2.6a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z" /></svg>,
  house: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l8-6.5 8 6.5M6 11v8.5h12V11M10 19.5v-4.5h4v4.5" /></svg>,
};

export function HomePage({ lang, t, room, hasOrder, onRoomService, onMyOrder, onOpenLang }: {
  lang: Lang;
  t: (k: StringKey, v?: Record<string, string | number>) => string;
  room: string;
  hasOrder: boolean;
  onRoomService: () => void;
  onMyOrder: () => void;
  onOpenLang: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>(HOTEL_PHOTOS);
  const [idx, setIdx] = useState(0);
  const [toast, setToast] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [contacts, setContacts] = useState<Contacts>(EMPTY_CONTACTS);

  useEffect(() => {
    void supabase.from('site_settings').select('settings').eq('key', 'hotel_portal').maybeSingle().then(({ data }) => {
      const list = (data?.settings as { photos?: { url: string; caption?: string }[] } | null)?.photos ?? [];
      if (list.length) setPhotos(list.slice(0, 5).map((p, i) => ({ url: p.url, caption: p.caption ?? '', tone: PLACEHOLDER[i % 3].tone })));
    });
    void supabase.from('site_settings').select('settings').eq('key', 'contacts').maybeSingle().then(({ data }) => {
      if (data?.settings) setContacts({ ...EMPTY_CONTACTS, ...(data.settings as Partial<Contacts>) });
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
  const items: { no: string; label: string; icon: JSX.Element; onClick: () => void }[] = [
    { no: '02', label: t('home_tour'), icon: ICON.tour, onClick: () => setTourOpen(true) },
    { no: '03', label: t('home_contact'), icon: ICON.phone, onClick: () => setContactOpen(true) },
    { no: '04', label: t('home_house'), icon: ICON.house, onClick: () => soon(t('home_house')) },
  ];
  const pad2 = (n: number) => String(n).padStart(2, '0');

  return (
    <main className="home">
      <div className="home-slides" aria-hidden="true">
        {photos.map((p, i) => (
          <div key={i} className={`home-slide${i === idx ? ' is-on' : ''}`} style={{ background: p.tone }}>
            {p.url && <img src={p.url} alt="" style={p.pos ? { objectPosition: p.pos } : undefined} decoding="async" fetchPriority={i === 0 ? 'high' : 'low'} />}
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
        <div className="home-dock">
          <button type="button" className="home-tile home-tile--main" onClick={onRoomService}>
            <span className="home-tile-ico">{ICON.dine}</span>
            <span className="home-tile-lbl">{t('home_rs')}</span>
          </button>
          {items.map((it) => (
            <button type="button" key={it.no} className="home-tile" onClick={it.onClick}>
              <span className="home-tile-ico">{it.icon}</span>
              <span className="home-tile-lbl">{it.label}</span>
            </button>
          ))}
        </div>
        {hasOrder && (
          <button type="button" className="home-order" onClick={onMyOrder}>
            <span className="home-dot" />{t('myOrder')}
          </button>
        )}
      </nav>

      {toast && <div className="home-toast" role="status">{toast}</div>}

      {tourOpen && (
        <div className="tour" role="dialog" aria-modal="true" aria-label={t('home_tour')}>
          <header className="tour-top">
            <span className="home-mark">HOTEL MUSEO</span>
            <button type="button" className="tour-close" onClick={() => setTourOpen(false)} aria-label={t('close')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>
          <h2 className="tour-title">{t('home_tour')}</h2>
          <div className="tour-list">
            {photos.map((p, i) => (
              <figure key={i} className="tour-item" style={{ background: p.tone }}>
                {p.url && <img src={p.url} alt={p.caption} loading={i ? 'lazy' : 'eager'} decoding="async" />}
                <figcaption><span>{pad2(i + 1)}</span>{p.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      <Sheet open={contactOpen} onClose={() => setContactOpen(false)} label={t('home_contact')} closeLabel={t('close')}>
        <div className="sheet-body">
          <h2 className="contact-title">{t('home_contact')}</h2>
          {CONTACT_KEYS.some((k) => contacts[k].trim()) ? (
            <>
              <p className="contact-hint">{t('contact_hint')}</p>
              {CONTACT_KEYS.filter((k) => contacts[k].trim()).map((k) => (
                <a key={k} className="contact-row" href={telHref(contacts[k])}>
                  <span className="contact-ico">{ICON.phone}</span>
                  <span className="contact-txt">
                    <span className="contact-name">{t(`contact_${k}` as StringKey)}</span>
                    <span className="contact-num">{contacts[k]}</span>
                  </span>
                </a>
              ))}
            </>
          ) : (
            <p className="contact-hint">{t('contact_empty')}</p>
          )}
        </div>
      </Sheet>
    </main>
  );
}
