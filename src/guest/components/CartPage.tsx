import { useState } from 'react';
import { won } from '../../lib/menu';
import type { Lang, PaymentMethod } from '../../lib/types';
import type { StringKey } from '../../i18n/strings';
import type { ResolvedLine } from '../cart';
import { Back, Check, Plus } from './Icons';
import { Stepper } from './Stepper';

export interface CheckoutForm {
  room: string;
  guestName: string;
  phone: string;
  note: string;
  hasAllergy: boolean;
  allergy: string;
  cutlery: number;
  payment: PaymentMethod;
}

interface Props {
  lang: Lang;
  t: (k: StringKey, v?: Record<string, string | number>) => string;
  lines: ResolvedLine[];
  form: CheckoutForm;
  setForm: (f: CheckoutForm) => void;
  canOrder: boolean;
  submitting: boolean;
  error: string | null;
  onQty: (key: string, qty: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function CartPage({ t, lines, form, setForm, canOrder, submitting, error, onQty, onBack, onSubmit }: Props) {
  const [touched, setTouched] = useState(false);
  const total = lines.reduce((a, l) => a + l.total, 0);
  const roomMissing = !form.room.trim();
  const nameMissing = form.payment === 'checkout' && !form.guestName.trim();
  const invalid = lines.some((l) => !l.valid);
  const allergyMissing = form.hasAllergy && !form.allergy.trim();

  const submit = () => {
    setTouched(true);
    if (roomMissing || nameMissing || allergyMissing || !lines.length || invalid) return;
    onSubmit();
  };

  const set = <K extends keyof CheckoutForm>(k: K, v: CheckoutForm[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="page">
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label={t('backToMenu')} onClick={onBack}><Back /></button>
        <h1 className="topbar-title">{t('yourOrder')}</h1>
      </header>

      <div className="page-body">
        <section className="card">
          <label htmlFor="room" className="label">{t('roomLabel')}</label>
          <div className="room-row">
            <input
              id="room"
              className={`room-input${touched && roomMissing ? ' is-error' : ''}`}
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('roomPlaceholder')}
              value={form.room}
              maxLength={6}
              onChange={(e) => set('room', e.target.value.replace(/[^0-9A-Za-z-]/g, ''))}
            />
            {t('roomSuffix') && <span className="room-suffix">{t('roomSuffix')}</span>}
          </div>
          <p className={`help${touched && roomMissing ? ' is-error' : ''}`}>{touched && roomMissing ? t('errRoom') : t('roomHelp')}</p>
        </section>

        <section className="card card--list">
          {lines.length === 0 && <p className="empty">{t('emptyCart')}</p>}
          {lines.map((l) => (
            <div className={`cline${l.valid ? '' : ' is-invalid'}`} key={l.line.key}>
              {l.image ? <img src={l.image} alt="" /> : <span className="cline-noimg" />}
              <div className="cline-text">
                <div className="cline-name">{l.name}</div>
                {l.detail && <div className="cline-detail">{l.detail}</div>}
                {!l.valid && <div className="cline-bad">{t('invalidLine')}</div>}
                <div className="cline-price">{won(l.total)}</div>
              </div>
              <Stepper value={l.line.qty} min={0} onChange={(v) => onQty(l.line.key, v)} />
            </div>
          ))}
          <button type="button" className="link-btn" onClick={onBack}><Plus size={16} /> {t('addMore')}</button>
        </section>

        <section className="card">
          <div className="label">{t('payment')}</div>
          {(['checkout', 'card'] as PaymentMethod[]).map((p) => (
            <button
              type="button"
              key={p}
              className={`payopt${form.payment === p ? ' is-on' : ''}`}
              aria-pressed={form.payment === p}
              onClick={() => set('payment', p)}
            >
              <span className="radio" />
              <span className="payopt-text">
                <span className="payopt-title">{p === 'checkout' ? t('payCheckout') : t('payCard')}</span>
                <span className="payopt-sub">{p === 'checkout' ? t('payCheckoutSub') : t('payCardSub')}</span>
              </span>
            </button>
          ))}
          {form.payment === 'checkout' && (
            <div className="field">
              <label htmlFor="guest" className="label">{t('guestName')}</label>
              <input id="guest" className={`input${touched && nameMissing ? ' is-error' : ''}`} placeholder={t('guestNamePlaceholder')} value={form.guestName} onChange={(e) => set('guestName', e.target.value)} />
              {touched && nameMissing && <p className="help is-error">{t('errName')}</p>}
            </div>
          )}
        </section>

        <section className="card">
          <div className="cutlery-row">
            <div>
              <div className="row-title">{t('cutlery')}</div>
              <div className="help">{t('cutlerySub')}</div>
            </div>
            <Stepper value={form.cutlery} min={0} max={10} onChange={(v) => set('cutlery', v)} />
          </div>
          <button
            type="button"
            role="checkbox"
            aria-checked={form.hasAllergy}
            className={`allergy-toggle${form.hasAllergy ? ' is-on' : ''}`}
            onClick={() => setForm({ ...form, hasAllergy: !form.hasAllergy, allergy: form.hasAllergy ? '' : form.allergy })}
          >
            <span className="box">{form.hasAllergy && <Check />}</span>
            <span className="row-title">{t('hasAllergy')}</span>
          </button>
          {form.hasAllergy && (
            <div className="field">
              <label htmlFor="allergy" className="label">{t('allergyLabel')}</label>
              <textarea
                id="allergy"
                className={`input${touched && allergyMissing ? ' is-error' : ''}`}
                rows={2}
                autoFocus
                placeholder={t('allergyPlaceholder')}
                value={form.allergy}
                onChange={(e) => set('allergy', e.target.value)}
              />
              <p className={`help${touched && allergyMissing ? ' is-error' : ''}`}>{touched && allergyMissing ? t('errAllergy') : t('allergyHelp')}</p>
            </div>
          )}
          <div className="field">
            <label htmlFor="note" className="label">{t('request')}</label>
            <textarea id="note" className="input" rows={3} placeholder={t('requestPlaceholder')} value={form.note} onChange={(e) => set('note', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="phone" className="label">{t('phone')}</label>
            <input id="phone" className="input" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
        </section>

        <section className="totals">
          <div><span>{t('subtotal')}</span><span>{won(total)}</span></div>
          <div><span>{t('delivery')}</span><span>{t('free')}</span></div>
          <div className="totals-sum"><span>{t('total')}</span><span>{won(total)}</span></div>
        </section>

        {error && <p className="alert" role="alert">{error}</p>}
      </div>

      <div className="bottom-bar">
        <button type="button" className="btn-primary block" disabled={!lines.length || submitting || !canOrder} onClick={submit}>
          {submitting ? t('placing') : t('placeOrder', { price: won(total) })}
        </button>
      </div>
    </div>
  );
}
