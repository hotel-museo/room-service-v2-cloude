import { roomAllowed, roomComplete } from '../../lib/rooms';
import { DELIVERY_PREFS, type DeliveryPref } from '../../lib/delivery';
import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
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
  deliveryPref: DeliveryPref;
  payment: PaymentMethod;
  consent: boolean;
}

interface Props {
  rooms: string[];
  /** 지금 주문하면 예상 도착 [최소, 최대] 분 */
  eta: [number, number];
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

/** 휴대폰 키패드의 '완료/엔터'를 누르면 다음 칸으로 넘어가지 않고 키패드만 내려요 */
const doneOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
};

export function CartPage({ rooms, eta, t, lines, form, setForm, canOrder, submitting, error, onQty, onBack, onSubmit }: Props) {
  const [touched, setTouched] = useState(false);
  const total = lines.reduce((a, l) => a + l.total, 0);
  const roomMissing = !form.room.trim();
  const [roomLeft, setRoomLeft] = useState(false);
  const roomBad = !roomMissing && !roomAllowed(rooms, form.room);
  // 입력하는 중에는 빨간 글씨를 띄우지 않고, 칸을 벗어나거나 주문을 누르면 알려 줍니다
  const roomUnknown = roomBad && (touched || roomLeft);
  const nameMissing = form.payment === 'checkout' && !form.guestName.trim();
  const consentMissing = form.payment === 'checkout' && !form.consent;
  const invalid = lines.some((l) => !l.valid);
  const allergyMissing = form.hasAllergy && !form.allergy.trim();

  const submit = () => {
    setTouched(true);
    if (roomMissing || roomBad || nameMissing || consentMissing || allergyMissing || !lines.length || invalid) return;
    onSubmit();
  };

  // 동의한 뒤 금액이 바뀌면 다시 동의받기
  const agreedTotal = useRef(total);
  useEffect(() => {
    if (form.consent && agreedTotal.current !== total) setForm({ ...form, consent: false });
    agreedTotal.current = total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

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
              className={`room-input${(touched && roomMissing) || roomUnknown ? ' is-error' : ''}`}
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('roomPlaceholder')}
              value={form.room}
              maxLength={6}
              enterKeyHint="done"
              onKeyDown={doneOnEnter}
              onChange={(e) => {
                setRoomLeft(false);
                const v = e.target.value.replace(/[^0-9A-Za-z-]/g, '');
                set('room', v);
                // 등록된 객실 번호를 끝까지 입력하면 키패드를 내려요 (더 긴 번호가 없을 때만)
                if (roomComplete(rooms, v)) e.currentTarget.blur();
              }}
              onBlur={() => setRoomLeft(true)}
            />
            {t('roomSuffix') && <span className="room-suffix">{t('roomSuffix')}</span>}
          </div>
          <p className={`help${(touched && roomMissing) || roomUnknown ? ' is-error' : ''}`}>{touched && roomMissing ? t('errRoom') : roomUnknown ? t('errRoomUnknown') : t('roomHelp')}</p>
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
              <input id="guest" className={`input${touched && nameMissing ? ' is-error' : ''}`} placeholder={t('guestNamePlaceholder')} value={form.guestName} onChange={(e) => set('guestName', e.target.value)} enterKeyHint="done" onKeyDown={doneOnEnter} autoComplete="name" />
              {touched && nameMissing && <p className="help is-error">{t('errName')}</p>}
            </div>
          )}
          {form.payment === 'checkout' && (
            <div className={`consent${touched && consentMissing ? ' is-error' : ''}`}>
              <div className="consent-title">{t('consentTitle')}</div>
              <p className="consent-text">{t('consentText', { room: form.room.trim() || '—', name: form.guestName.trim() || '—', total: won(total) })}</p>
              <label className="consent-check">
                <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
                <span className="consent-box" aria-hidden="true"><Check /></span>
                <span>{t('consentCheck')}</span>
              </label>
              {touched && consentMissing && <p className="help is-error">{t('errConsent')}</p>}
            </div>
          )}
        </section>

        <section className="card">
          <div className="label">{t('deliveryLabel')}</div>
          {DELIVERY_PREFS.map((d) => (
            <button type="button" key={d} className={`payopt payopt--sm${form.deliveryPref === d ? ' is-on' : ''}`} aria-pressed={form.deliveryPref === d} onClick={() => set('deliveryPref', d)}>
              <span className="radio" />
              <span className="payopt-text"><span className="payopt-title">{t(`dp_${d}` as StringKey)}</span></span>
            </button>
          ))}
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
            <input id="phone" className="input" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} enterKeyHint="done" onKeyDown={doneOnEnter} />
          </div>
        </section>

        <section className="totals">
          <div><span>{t('subtotal')}</span><span>{won(total)}</span></div>
          <div><span>{t('delivery')}</span><span>{t('free')}</span></div>
          <div className="totals-sum"><span>{t('total')}</span><span>{won(total)}</span></div>
        </section>

        {canOrder && lines.length > 0 && <p className="eta-line">{t('etaNow', { min: eta[0], max: eta[1] })}</p>}
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
