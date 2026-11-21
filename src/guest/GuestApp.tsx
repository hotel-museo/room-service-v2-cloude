import { useCallback, useEffect, useMemo, useState } from 'react';
import { LANGS, translate, type StringKey } from '../i18n/strings';
import { won } from '../lib/menu';
import type { Lang } from '../lib/types';
import { resolveLines, toOrderItems, useCart } from './cart';
import { CartPage, type CheckoutForm } from './components/CartPage';
import { Chevron } from './components/Icons';
import { MenuPage } from './components/MenuPage';
import { MenuSheet } from './components/MenuSheet';
import { SetSheet } from './components/SetSheet';
import { Sheet } from './components/Sheet';
import { StatusPage } from './components/StatusPage';
import { loadTracked, placeOrder, saveTracked, type TrackedOrder } from './orders';
import { useGuestData } from './useGuestData';

type View = 'menu' | 'cart' | 'status';

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
  const [tracked, setTracked] = useState<TrackedOrder | null>(loadTracked);
  const [view, setView] = useState<View>(() => (loadTracked() ? 'status' : 'menu'));
  const [menuId, setMenuId] = useState<number | null>(null);
  const [setId, setSetId] = useState<number | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CheckoutForm>({ room: initialRoom(), guestName: '', phone: '', note: '', hasAllergy: false, allergy: '', cutlery: 1, payment: 'checkout' });

  const t = useCallback((k: StringKey, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('ph-lang', l); } catch { /* 무시 */ }
  };

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  const lines = useMemo(() => resolveLines(cart.lines, data.menus, data.sets, data.options, lang), [cart.lines, data.menus, data.sets, data.options, lang]);
  const count = cart.lines.reduce((a, l) => a + l.qty, 0);
  const total = lines.reduce((a, l) => a + l.total, 0);
  const qtyByMenu = useMemo(() => {
    const m = new Map<number, number>();
    cart.lines.forEach((l) => l.kind === 'menu' && m.set(l.id, (m.get(l.id) ?? 0) + l.qty));
    return m;
  }, [cart.lines]);
  const canOrder = data.service === 'open' || data.service === 'busy';

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const items = toOrderItems(cart.lines, data.menus, data.sets, data.options);
    const res = await placeOrder({ ...form, allergy: form.hasAllergy ? form.allergy : '', items });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.reason === 'price' ? t('errPrice') : t('errGeneric'));
      if (res.reason === 'price') void data.reload();
      return;
    }
    const tr: TrackedOrder = {
      token: res.token,
      placedAt: new Date().toISOString(),
      room: form.room,
      total,
      payment: form.payment,
      lines: lines.map((l) => ({ name: l.name, detail: l.detail, qty: l.line.qty, total: l.total })),
    };
    saveTracked(tr);
    setTracked(tr);
    cart.clear();
    setForm((f) => ({ ...f, note: '' }));
    setView('status');
  };

  if (view === 'status' && tracked) {
    return (
      <StatusPage
        lang={lang}
        t={t}
        order={tracked}
        onMenu={() => setView('menu')}
        onNewOrder={() => { saveTracked(null); setTracked(null); setView('menu'); }}
      />
    );
  }

  if (view === 'cart') {
    return (
      <CartPage
        lang={lang}
        t={t}
        lines={lines}
        form={form}
        setForm={setForm}
        canOrder={canOrder}
        submitting={submitting}
        error={error}
        onQty={cart.setQty}
        onBack={() => setView('menu')}
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
          lang={lang}
          t={t}
          menus={data.menus}
          sets={data.sets}
          labels={data.labels}
          service={data.service}
          qtyByMenu={qtyByMenu}
          onOpenMenu={setMenuId}
          onOpenSet={setSetId}
          onOpenLang={() => setLangOpen(true)}
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

      <MenuSheet menu={menu} links={data.options} lang={lang} canOrder={canOrder} t={t} onClose={() => setMenuId(null)} onAdd={cart.addMenu} />
      <SetSheet set={set} menus={data.menus} links={data.options} labels={data.labels} lang={lang} canOrder={canOrder} t={t} onClose={() => setSetId(null)} onAdd={cart.addSet} />

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
    </>
  );
}
