import { useEffect, useMemo, useRef, useState } from 'react';
import { descOf, isSoldOut, nameOf, subNameOf, visibleMenus, visibleSets, won } from '../../lib/menu';
import type { CategoryLabels, Lang, Menu, ServiceStatus, SetMenu } from '../../lib/types';
import type { StringKey } from '../../i18n/strings';
import { Globe } from './Icons';

/** 셰프 추천에 띄울 메뉴 (없거나 숨김이면 사진 있는 메뉴로 채움) */
const PICK_IDS = [117, 102, 124, 107, 114, 109];

interface Props {
  lang: Lang;
  t: (k: StringKey, v?: Record<string, string | number>) => string;
  menus: Menu[];
  sets: SetMenu[];
  labels: CategoryLabels;
  service: ServiceStatus;
  qtyByMenu: Map<number, number>;
  onOpenMenu: (id: number) => void;
  onOpenSet: (id: number) => void;
  onOpenLang: () => void;
}

export function MenuPage({ lang, t, menus, sets, labels, service, qtyByMenu, onOpenMenu, onOpenSet, onOpenLang }: Props) {
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
    return order.map((cat) => ({ cat, items: map.get(cat)! }));
  }, [list]);

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
    const btn = navRef.current?.querySelector<HTMLElement>(`[data-target="${active}"]`);
    btn?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const canOrder = service === 'open' || service === 'busy';
  let secNo = 0;

  return (
    <main>
      <section className="hero">
        <div className="hero-brand" role="img" aria-label="PASTA HOUSE by BOTTEGA">
          <div className="hero-rule" />
          <div className="hero-word">PASTA</div>
          <div className="hero-word">HOUSE</div>
          <div className="hero-by">BY BOTTEGA</div>
          <div className="hero-rule" />
        </div>
        <div className="hero-top">
          <div className={`pill pill--${canOrder ? 'on' : 'off'}`}>
            <span className="dot" />
            {t(`status_${service}` as StringKey)}
          </div>
          <button type="button" className="pill pill--btn" onClick={onOpenLang} aria-label="Language">
            <Globe /> {t('langName')}
          </button>
        </div>
        <div className="hero-copy">
          <div className="eyebrow">{t('inRoomDining')}</div>
          <h1 className="tagline">
            {t('tagline1')}
            <br />
            <em>{t('tagline2')}</em>
          </h1>
          <p className="subline">{t('subline')}</p>
        </div>
      </section>

      {!canOrder && <div className="notice">{t('closedNotice')}</div>}

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
          {setList.map((s) => (
            <button type="button" key={s.id} className="mrow" onClick={() => onOpenSet(s.id)}>
              {s.image_url && <img className="mrow-img" src={s.image_url} alt="" loading="lazy" />}
              <span className="mrow-text">
                <span className="mrow-name">{nameOf(s, lang)}</span>
                <span className="mrow-desc">{descOf(s, lang) || s.description}</span>
              </span>
              <span className="mrow-side">
                <span className="mrow-price">{won(s.price)}</span>
              </span>
            </button>
          ))}
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
            const so = isSoldOut(m);
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
                  {so ? <span className="soldout-tag">{t('soldOut')}</span> : <span className="mrow-price">{won(m.price)}</span>}
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
