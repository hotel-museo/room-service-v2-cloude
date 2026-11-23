import { isPreview } from '../../lib/preview';
import { useEffect, useMemo, useRef, useState } from 'react';
import { descOf, isSoldOut, nameOf, subNameOf, visibleMenus, visibleSets, won } from '../../lib/menu';
import { cutoffFor, hoursText, type BusinessHours, type HoursState } from '../../lib/hours';
import { setComponents } from '../../lib/menu';
import type { CategoryLabels, Lang, Menu, ServiceStatus, SetMenu } from '../../lib/types';
import type { StringKey } from '../../i18n/strings';
import { Back, Globe } from './Icons';

/** 셰프 추천에 띄울 메뉴 (없거나 숨김이면 사진 있는 메뉴로 채움) */
const PICK_IDS = [117, 102, 124, 107, 114, 109];

interface Props {
  /** true면 로고 인트로를 건너뛰고 바로 메뉴 위치로 */
  skipIntro: boolean;
  lang: Lang;
  t: (k: StringKey, v?: Record<string, string | number>) => string;
  menus: Menu[];
  sets: SetMenu[];
  labels: CategoryLabels;
  service: ServiceStatus;
  hours: BusinessHours;
  catOrder: string[];
  hoursNow: HoursState;
  isCut: (m: Menu) => boolean;
  qtyByMenu: Map<number, number>;
  onOpenMenu: (id: number) => void;
  onOpenSet: (id: number) => void;
  onOpenLang: () => void;
  onHome: () => void;
}

export function MenuPage({ skipIntro, lang, t, menus, sets, labels, service, hours, catOrder, hoursNow, isCut, qtyByMenu, onOpenMenu, onOpenSet, onOpenLang, onHome }: Props) {
  const list = useMemo(() => visibleMenus(menus), [menus]);
  const setList = useMemo(() => visibleSets(sets), [sets]);

  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Menu[]>();
    for (const m of list) {
      if (!map.has(m.category)) {
        map.set(m.category, []);
        order.push(m.category);
      }
      map.get(m.category)!.push(m);
    }
    const rank = (c: string) => { const i = catOrder.indexOf(c); return i < 0 ? 999 + order.indexOf(c) : i; };
    return [...order].sort((a, b) => rank(a) - rank(b)).map((cat) => ({ cat, items: map.get(cat)! }));
  }, [list, catOrder]);

  const picks = useMemo(() => {
    const byId = new Map(list.map((m) => [m.id, m]));
    const chosen = PICK_IDS.map((id) => byId.get(id)).filter((m): m is Menu => !!m && !!m.image_url);
    for (const m of list) {
      if (chosen.length >= 6) break;
      if (m.image_url && !chosen.includes(m)) chosen.push(m);
    }
    return chosen;
  }, [list]);

  const catLabel = (cat: string, l: Lang = lang) => labels[cat]?.[l] || labels[cat]?.ko || cat;

  const tabs = [
    ...(setList.length ? [{ id: 'sec-sets', label: t('sets'), en: 'Set Menu' }] : []),
    ...sections.map((s) => ({ id: `sec-${s.cat}`, label: catLabel(s.cat), en: catLabel(s.cat, 'en') })),
  ];

  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const navRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  // 처음 들어왔을 때만 로고 인트로를 보여주고, 장바구니 등에서 돌아오면 바로 메뉴 위치로
  // 관리자 미리보기는 인트로를 건너뛰고 바로 메뉴부터
  // 첫 화면에서 '룸서비스'를 누르면 항상 로고 인트로부터, 장바구니·주문 현황에서 돌아올 때만 바로 메뉴로 (관리자 미리보기도 바로 메뉴)
  const [introSeen] = useState(() => isPreview || skipIntro);

  useEffect(() => {
    if (introSeen && brandRef.current) {
      const h = brandRef.current.offsetHeight;
      requestAnimationFrame(() => window.scrollTo(0, h));
    }
    // 스크롤하면 로고가 천천히 올라가며 흐려지는 효과
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = logoRef.current, box = brandRef.current;
        if (!el || !box) return;
        const h = box.offsetHeight || 1;
        const y = Math.min(window.scrollY, h);
        const p = y / h;
        box.style.setProperty('--intro-p', String(p));
        if (!reduce) el.style.transform = `translate3d(0, ${y * 0.45}px, 0) scale(${1 - p * 0.06})`;
        el.style.opacity = String(Math.max(0, 1 - p * 1.4));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToMenu = () => { const h = brandRef.current?.offsetHeight ?? 0; window.scrollTo({ top: h, behavior: 'smooth' }); };
  const letters = (w: string, start: number) => [...w].map((ch, i) => <span key={i} style={{ animationDelay: `${start + i * 70}ms` }}>{ch}</span>);

  useEffect(() => {
    const els = tabs.map((tb) => document.getElementById(tb.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map((x) => x.id).join('|')]);

  useEffect(() => {
    // 카테고리 줄만 가로로 움직입니다 (scrollIntoView는 페이지 전체를 움직여서 쓰지 않음)
    const nav = navRef.current;
    const btn = nav?.querySelector<HTMLElement>(`[data-target="${active}"]`);
    if (nav && btn) nav.scrollTo({ left: btn.offsetLeft - nav.clientWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' });
  }, [active]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const serviceOk = service === 'open' || service === 'busy';
  const canOrder = serviceOk && hoursNow.open;
  const statusText = !serviceOk ? t(`status_${service}` as StringKey) : !hoursNow.open ? t('closedNow') : t(`status_${service}` as StringKey);
  const byId = new Map(menus.map((m) => [m.id, m]));
  /** 구성 중 하나라도 '모든 후보가 마감'이면 세트도 마감 */
  const setCutAt = (s: SetMenu): string | null => {
    for (const c of setComponents(s)) {
      const ms = c.menuIds.map((id) => byId.get(id)).filter((m): m is Menu => !!m && !m.is_hidden);
      if (ms.length && ms.every(isCut)) return cutoffFor(hours, ms[0].category);
    }
    return null;
  };
  const cutLabel = (m: Menu) => { const at = cutoffFor(hours, m.category); return at ? t('cutoffLabel', { time: at }) : ''; };
  let secNo = 0;

  return (
    <main>
      <section className="hero">
        <div className={`hero-brand${introSeen ? ' is-seen' : ''}`} ref={brandRef}>
          <div className="hero-light" aria-hidden="true"><i /><i /><b /></div>
          <div className="hero-logo" ref={logoRef} role="img" aria-label="PASTA HOUSE by BOTTEGA">
            <div className="hero-rule" />
            <div className="hero-word" aria-hidden="true">{letters('PASTA', 250)}</div>
            <div className="hero-word" aria-hidden="true">{letters('HOUSE', 600)}</div>
            <div className="hero-by" aria-hidden="true">BY BOTTEGA</div>
            <div className="hero-rule" />
          </div>
          <button type="button" className="hero-cue" onClick={scrollToMenu} aria-label="Menu">
            <span>MENU</span>
            <i />
          </button>
        </div>
        <div className="hero-top">
          <div className="hero-top-l">
          <button type="button" className="pill pill--btn pill--icon" onClick={onHome} aria-label={t('home_back')}><Back size={18} /></button>
          <div className={`pill pill--${canOrder ? 'on' : 'off'}`}>
            <span className="dot" />
            {statusText}
          </div>
          </div>
          <button type="button" className="pill pill--btn" onClick={onOpenLang} aria-label="Language">
            <Globe /> {t('langName')}
          </button>
        </div>
        <div className="hero-copy">
          <div className="eyebrow">{t('inRoomDining')}</div>
        </div>
      </section>

      {!canOrder && (
        <div className="notice">
          {serviceOk && hoursNow.nextOpen ? t('nextOpen', { time: hoursNow.nextOpen }) : t('closedNotice')}
        </div>
      )}
      {canOrder && hoursNow.warn && hoursNow.minutesToClose !== null && (
        <div className="notice notice--soft">{t('lastOrder', { n: hoursNow.minutesToClose })}</div>
      )}
      {hours.slots.length > 0 && (
        <p className="hours-line">{t('hoursLabel')} {hoursText(hours)}</p>
      )}

      {picks.length > 0 && (
        <section className="picks" aria-label={t('chefsPicks')}>
          <div className="row-head">
            <h2>{t('chefsPicks')}</h2>
            <span className="serif-it">Chef&apos;s picks</span>
          </div>
          <div className="picks-scroll">
            {picks.map((m) => {
              const so = isSoldOut(m);
              return (
                <button type="button" key={m.id} className={`pick${so ? ' is-soldout' : ''}`} onClick={() => onOpenMenu(m.id)}>
                  <span className="pick-img">
                    <img src={m.image_url!} alt="" loading="lazy" />
                    {so && <span className="soldout-badge">{t('soldOut')}</span>}
                  </span>
                  <span className="pick-name">{nameOf(m, lang)}</span>
                  <span className="pick-price">{won(m.price)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <nav className="catnav" aria-label="menu categories" ref={navRef}>
        {tabs.map((tb) => (
          <button type="button" key={tb.id} data-target={tb.id} className={active === tb.id ? 'is-active' : ''} onClick={() => jump(tb.id)}>
            {tb.label}
          </button>
        ))}
      </nav>

      {setList.length > 0 && (
        <section className="msec" id="sec-sets">
          <div className="msec-head">
            <span className="msec-no">{String(++secNo).padStart(2, '0')}</span>
            <h2>{t('sets')}</h2>
            <span className="serif-it">Set Menu</span>
          </div>
          {setList.map((s) => { const cut = setCutAt(s); return (
            <button type="button" key={s.id} className={`mrow${cut ? ' is-soldout' : ''}`} onClick={() => onOpenSet(s.id)}>
              {s.image_url && <img className="mrow-img" src={s.image_url} alt="" loading="lazy" />}
              <span className="mrow-text">
                <span className="mrow-name">{nameOf(s, lang)}</span>
                <span className="mrow-desc">{descOf(s, lang) || s.description}</span>
              </span>
              <span className="mrow-side">
                {cut ? <span className="soldout-tag">{t('cutoffLabel', { time: cut })}</span> : <span className="mrow-price">{won(s.price)}</span>}
              </span>
            </button>
          ); })}
        </section>
      )}

      {sections.map((sec) => (
        <section className="msec" id={`sec-${sec.cat}`} key={sec.cat}>
          <div className="msec-head">
            <span className="msec-no">{String(++secNo).padStart(2, '0')}</span>
            <h2>{catLabel(sec.cat)}</h2>
            {lang === 'ko' && <span className="serif-it">{catLabel(sec.cat, 'en')}</span>}
          </div>
          {sec.items.map((m) => {
            const cl = cutLabel(m);
            const so = isSoldOut(m) || !!cl;
            const q = qtyByMenu.get(m.id) ?? 0;
            const desc = descOf(m, lang);
            const sub = subNameOf(m, lang);
            return (
              <button type="button" key={m.id} className={`mrow${so ? ' is-soldout' : ''}`} onClick={() => onOpenMenu(m.id)}>
                {m.image_url && <img className="mrow-img" src={m.image_url} alt="" loading="lazy" />}
                <span className="mrow-text">
                  <span className="mrow-name">{nameOf(m, lang)}</span>
                  {sub && <span className="mrow-sub">{sub}</span>}
                  {desc && <span className="mrow-desc">{desc}</span>}
                </span>
                <span className="mrow-side">
                  {so ? <span className="soldout-tag">{cl || t('soldOut')}</span> : <span className="mrow-price">{won(m.price)}</span>}
                  {q > 0 && <span className="qty-badge">{q}</span>}
                </span>
              </button>
            );
          })}
        </section>
      ))}

      <p className="footnote">{t('allergyNote')}</p>
    </main>
  );
}
