import { useEffect, useState } from 'react';
import { won } from '../../lib/menu';
import type { Lang } from '../../lib/types';
import type { StringKey } from '../../i18n/strings';
import { fetchOrderStatus, type OrderStatusRow, type TrackedOrder } from '../orders';
import { Check } from './Icons';

interface Props {
  lang: Lang;
  t: (k: StringKey, v?: Record<string, string | number>) => string;
  order: TrackedOrder;
  onMenu: () => void;
  onNewOrder: () => void;
}

const POLL_MS = 8000;

function timeText(d: Date, lang: Lang) {
  const loc = lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : lang === 'zh' ? 'zh-CN' : 'en-US';
  return d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });
}

export function StatusPage({ lang, t, order, onMenu, onNewOrder }: Props) {
  const [row, setRow] = useState<OrderStatusRow | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await fetchOrderStatus(order.token);
      if (alive && r) setRow(r);
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [order.token]);

  const status = row?.status ?? 'pending';
  let title = t('st_pending_t');
  let desc = t('st_pending_d');
  if (status === 'cooking') {
    title = t('st_cooking_t');
    if (row?.accepted_at && row.estimated_minutes) {
      const eta = new Date(new Date(row.accepted_at).getTime() + row.estimated_minutes * 60_000);
      desc = t('st_cooking_d_at', { time: timeText(eta, lang) });
    } else desc = t('st_cooking_d', { min: row?.estimated_minutes ?? 20 });
  } else if (status === 'completed') {
    title = t('st_completed_t');
    desc = t('st_completed_d');
  } else if (status === 'rejected') {
    title = t('st_rejected_t');
    desc = row?.rejection_reason || t('st_rejected_d');
  }

  const steps = [
    { key: 'received', label: t('step_received'), at: order.placedAt },
    { key: 'cooking', label: t('step_cooking'), at: row?.accepted_at ?? null },
    { key: 'done', label: t('step_done'), at: row?.completed_at ?? null },
  ];
  const level = status === 'completed' ? 3 : status === 'cooking' ? 2 : 1;
  const ended = status === 'completed' || status === 'rejected';

  return (
    <div className="page">
      <header className="status-top">
        <div className="brand-mini">PASTA HOUSE</div>
        <div className="muted">{order.room}{t('roomSuffix')}</div>
      </header>

      <div className="page-body">
        <section className="status-hero" aria-live="polite">
          {row && <div className="eyebrow eyebrow--ink">{t('orderNo', { no: String(row.id).padStart(4, '0') })}</div>}
          <h1 className="status-title">{title}</h1>
          <p className="status-desc">{desc}</p>
        </section>

        {status !== 'rejected' && (
          <section className="card steps" aria-label="progress">
            {steps.map((s, i) => {
              const state = i + 1 < level ? 'done' : i + 1 === level ? (level === 3 ? 'done' : 'now') : 'todo';
              return (
                <div className={`step step--${state}`} key={s.key}>
                  <div className="step-rail">
                    <span className="step-dot">{state === 'done' && <Check />}</span>
                    {i < steps.length - 1 && <span className="step-line" />}
                  </div>
                  <div className="step-row">
                    <span className="step-label">{s.label}</span>
                    {s.at && state !== 'todo' && <span className="muted">{timeText(new Date(s.at), lang)}</span>}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <section className="card">
          {order.lines.map((l, i) => (
            <div className="sum-line" key={i}>
              <span>
                {l.name} × {l.qty}
                {l.detail && <span className="cline-detail">{l.detail}</span>}
              </span>
              <span>{won(l.total)}</span>
            </div>
          ))}
          <div className="sum-line sum-line--total">
            <span>{t('total')} · {order.payment === 'checkout' ? t('payCheckout') : t('payCard')}</span>
            <span>{won(order.total)}</span>
          </div>
        </section>
      </div>

      <div className="bottom-bar bottom-bar--plain">
        {ended ? (
          <button type="button" className="btn-primary block" onClick={onNewOrder}>{t('newOrder')}</button>
        ) : (
          <button type="button" className="btn-ghost block" onClick={onMenu}>{t('backToMenu')}</button>
        )}
      </div>
    </div>
  );
}
