import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LANGS, translate, type StringKey } from '../i18n/strings';
import { cutoffFor, hoursState } from '../lib/hours';
import { won } from '../lib/menu';
import type { Lang, Menu } from '../lib/types';
import { resolveLines, toOrderItems, useCart } from './cart';
import { CartPage, type CheckoutForm } from './components/CartPage';
import { Chevron } from './components/Icons';
import { MenuPage } from './components/MenuPage';
import { HomePage } from './components/HomePage';
import { MenuSheet } from './components/MenuSheet';
import { SetSheet } from './components/SetSheet';
import { Sheet } from './components/Sheet';
import { StatusPage } from './components/StatusPage';
import { fetchOrderStatus, loadTracked, placeOrder, saveTracked, type TrackedOrder } from './orders';
import { useGuestData } from './useGuestData';
import { isPreview } from '../lib/preview';

type View = 'home' | 'menu' | 'cart' | 'status';

function initialLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && (LANGS as string[]).includes(q)) return q as Lang;
  try {
    const saved = localStorage.getItem('ph-lang');
    if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
  } catch { /* 무시 */ }
  const nav = navigator.language.slice(0, 2);
  return (['en', 'ja', 'zh'] as string[]).includes(nav) ? (nav as Lang) : 'ko';
}

function initialRoom(): string {
  return (new URLSearchParams(location.search).get('room') ?? '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 6);
}

export function GuestApp() {
  const data = useGuestData();
  const cart = useCart();
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [tracked, setTracked] = useState<TrackedOrder | null>(() => (isPreview ? null : loadTracked()));
  // 이 휴대폰에 기억된 주문이 이제 없으면(삭제된 테스트 주문 등) '주문 현황 보기'를 지웁니다
  useEffect(() => {
    if (!tracked) return;
    void fetchOrderStatus(tracked.token).then((r) => {
      if (r === 'gone') { saveTracked(null); setTracked(null); }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState<View>(() => (new URLSearchParams(location.search).get('view') === 'menu' ? 'menu' : 'home'));
  // 메뉴로 갈 때 로고 인트로를 건너뛸지 (장바구니·주문 현황에서 돌아올 때만 건너뜀)
  const skipIntro = useRef(false);
  const goMenu = (fromInside: boolean) => { skipIntro.current = fromInside; setView('menu'); };
  const [menuId, setMenuId] = useState<number | null>(null);
  const [setId, setSetId] = useState<number | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CheckoutForm>({ room: initialRoom(), guestName: '', phone: '', note: '', hasAllergy: false, allergy: '', cutlery: 1, deliveryPref: 'knock', payment: 'checkout', consent: false });

  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const hours = useMemo(() => hoursState(data.hours, new Date(clock)), [data.hours, clock]);
  const isCut = useCallback((m: Menu) => !!cutoffFor(data.hours, m.category, new Date(clock)), [data.hours, clock]);

  const t = useCallback((k: StringKey, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('ph-lang', l); } catch { /* 무시 */ }
  };

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  const lines = useMemo(() => resolveLines(cart.lines, data.menus, data.sets, data.options, lang, isCut), [cart.lines, data.menus, data.sets, data.options, lang, isCut]);
  const count = cart.lines.reduce((a, l) => a + l.qty, 0);
  const total = lines.reduce((a, l) => a + l.total, 0);
  const qtyByMenu = useMemo(() => {
    const m = new Map<number, number>();
    cart.lines.forEach((l) => l.kind === 'menu' && m.set(l.id, (m.get(l.id) ?? 0) + l.qty));
    return m;
  }, [cart.lines]);
  const canOrder = (data.service === 'open' || data.service === 'busy') && hours.open;

  const submit = async () => {
    if (isPreview) {
      setError('미리보기 화면이라 주문이 들어가지 않습니다.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const items = toOrderItems(cart.lines, data.menus, data.sets, data.options);
    const orderTotal = items.reduce((a, i) => a + i.price * i.quantity, 0);
    const consentText = form.payment === 'checkout' ? t('consentText', { room: form.room.trim(), name: form.guestName.trim(), total: won(orderTotal) }) : undefined;
    const res = await placeOrder({ ...form, allergy: form.hasAllergy ? form.allergy : '', items, consentText });
    setSubmitting(false);
    if (!res.ok) {
      const key = res.reason === 'price' ? 'errPrice' : res.reason === 'closed' ? 'errClosed' : res.reason === 'cutoff' ? 'errCutoff' : res.reason === 'name' ? 'errName' : res.reason === 'consent' ? 'errConsent' : res.reason === 'room' ? 'errRoomUnknown' : 'errGeneric';
      setError(t(key));
      void data.reload();
      return;
    }
    const tr: TrackedOrder = {
      token: res.token,
      placedAt: new Date().toISOString(),
      room: form.room,
      total,
      payment: form.payment,
      deliveryPref: form.deliveryPref,
      lines: lines.map((l) => ({ name: l.name, detail: l.detail, qty: l.line.qty, total: l.total })),
    };
    saveTracked(tr);
    setTracked(tr);
    cart.clear();
    setForm((f) => ({ ...f, note: '' }));
    setView('status');
  };

  const langSheet = (
    <Sheet open={langOpen} onClose={() => setLangOpen(false)} label="Language" closeLabel={t('close')}>
      <div className="sheet-body">
        <div className="langlist">
          {LANGS.map((l) => (
            <button type="button" key={l} className={`langopt${l === lang ? ' is-on' : ''}`} aria-pressed={l === lang} onClick={() => { setLang(l); setLangOpen(false); }}>
              {translate(l, 'langName')}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );

  if (view === 'home') {
    return (
      <>
        <HomePage lang={lang} t={t} room={form.room} hasOrder={!!tracked} onRoomService={() => goMenu(false)} onMyOrder={() => setView('status')} onOpenLang={() => setLangOpen(true)} />
        {langSheet}
      </>
    );
  }

  if (view === 'status' && tracked) {
    return (
      <StatusPage
        lang={lang}
        t={t}
        order={tracked}
        onMenu={() => goMenu(true)}
        onNewOrder={() => { saveTracked(null); setTracked(null); goMenu(true); }}
        onGone={() => { saveTracked(null); setTracked(null); setView('home'); }}
      />
    );
  }

  if (view === 'cart') {
    return (
      <CartPage
        rooms={data.rooms}
        eta={data.service === 'busy' ? data.eta.busy : data.eta.open}
        lang={lang}
        t={t}
        lines={lines}
        form={form}
        setForm={setForm}
        canOrder={canOrder}
        submitting={submitting}
        error={error}
        onQty={cart.setQty}
        onBack={() => goMenu(true)}
        onSubmit={submit}
      />
    );
  }

  const menu = data.menus.find((m) => m.id === menuId) ?? null;
  const set = data.sets.find((s) => s.id === setId) ?? null;

  return (
    <>
      {data.loading ? (
        <div className="loading" aria-busy="true">PASTA HOUSE</div>
      ) : (
        <MenuPage
          skipIntro={skipIntro.current}
          lang={lang}
          t={t}
          menus={data.menus}
          sets={data.sets}
          labels={data.labels}
          service={data.service}
          hours={data.hours}
          catOrder={data.catOrder}
          hoursNow={hours}
          isCut={isCut}
          qtyByMenu={qtyByMenu}
          onOpenMenu={setMenuId}
          onOpenSet={setSetId}
          onOpenLang={() => setLangOpen(true)}
          onHome={() => setView('home')}
        />
      )}

      {tracked && count === 0 && (
        <button type="button" className="float-bar float-bar--ghost" onClick={() => setView('status')}>
          <span>{t('myOrder')}</span>
          <Chevron />
        </button>
      )}

      {count > 0 && (
        <button type="button" className="float-bar" onClick={() => { setError(null); setView('cart'); }}>
          <span className="float-total">{won(total)}<span className="float-count"> · {t('items', { n: count })}</span></span>
          <span className="float-cta">{t('viewOrder')} <Chevron /></span>
        </button>
      )}

      <MenuSheet menu={menu} links={data.options} lang={lang} canOrder={canOrder} cutAt={menu ? cutoffFor(data.hours, menu.category, new Date(clock)) : null} t={t} onClose={() => setMenuId(null)} onAdd={cart.addMenu} />
      <SetSheet set={set} menus={data.menus} links={data.options} labels={data.labels} lang={lang} canOrder={canOrder} isCut={isCut} t={t} onClose={() => setSetId(null)} onAdd={cart.addSet} />

      {langSheet}
    </>
  );
}
