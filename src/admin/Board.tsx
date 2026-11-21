import { useEffect, useMemo, useState } from 'react';
import { isSoldOut, visibleMenus, won } from '../lib/menu';
import { supabase } from '../lib/supabase';
import type { Order, ServiceStatus } from '../lib/types';
import { audioReady, chime, unlockAudio } from './alarm';
import { printTicket } from './print';
import { useBoard } from './useBoard';

const OLD_SITE = 'https://hotel-museo.github.io/bottega-room-service/';
const REJECT_REASONS = ['재료가 모두 소진됐어요', '주방 마감 시간이에요', '주문이 많아 지금은 어려워요', '객실 번호를 확인할 수 없어요'];
const SERVICE: [ServiceStatus, string][] = [['open', '영업 중'], ['busy', '바쁨'], ['preparing', '준비 중'], ['closed', '마감']];

const pad = (n: number) => '#' + String(n).padStart(4, '0');
const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }) : '';
const minutesSince = (iso: string | null, now: number) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0);

function itemLines(o: Order) {
  return (o.order_items ?? []).map((it) => ({
    q: it.quantity,
    n: it.name,
    sub: it.is_set ? (it.set_components ?? []).flatMap((c) => c.items.map((i) => i.name)).join(' · ') || it.set_component_text : '',
    opts: (it.options ?? []).map((op) => op.name),
  }));
}

/** 옵션 표시: "더 맵게"와 "빼주세요"류는 강조 */
function Opts({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <span className="opts">
      {list.map((n, i) => (
        <span key={i} className={/맵게|빼주세요|중화면/.test(n) ? 'opt opt--hot' : 'opt'}>{n}</span>
      ))}
    </span>
  );
}

export function Board() {
  const b = useBoard();
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [query, setQuery] = useState('');
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem('ph-auto-print') === '1');
  const toggleAutoPrint = () => {
    const v = !autoPrint;
    setAutoPrint(v);
    localStorage.setItem('ph-auto-print', v ? '1' : '0');
  };

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const pending = b.orders.filter((o) => (o.status ?? 'pending') === 'pending');
  const cooking = b.orders.filter((o) => o.status === 'cooking');
  const finished = b.orders.filter((o) => o.status === 'completed' || o.status === 'rejected').sort((a, c) => (c.completed_at || c.rejected_at || '').localeCompare(a.completed_at || a.rejected_at || ''));

  // 접수 대기 주문이 있으면 7초마다 알림음
  useEffect(() => {
    if (!sound || pending.length === 0) return;
    chime();
    const id = window.setInterval(chime, 7000);
    return () => window.clearInterval(id);
  }, [sound, pending.length]);

  useEffect(() => {
    document.title = pending.length ? `(${pending.length}) 새 주문 · PASTA HOUSE` : 'PASTA HOUSE · 관리자 주문판';
  }, [pending.length]);

  const today = b.orders.filter((o) => o.status !== 'rejected' && new Date(o.created_at).getTime() >= new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + 'T00:00:00+09:00').getTime());
  const revenue = today.reduce((a, o) => a + (o.total_amount ?? 0), 0);
  const roomCharge = today.filter((o) => o.payment_method === 'checkout');

  const menus = useMemo(() => visibleMenus(b.menus), [b.menus]);
  const filtered = menus.filter((m) => !query.trim() || m.name.includes(query.trim()));
  const soldCount = menus.filter((m) => isSoldOut(m)).length;

  const enableSound = () => {
    unlockAudio();
    window.setTimeout(() => setSound(audioReady()), 200);
  };

  const ageChip = (min: number) => (min >= 10 ? 'chip chip--red' : min >= 5 ? 'chip chip--amber' : 'chip');

  return (
    <div className="admin">
      <header className="a-head">
        <div className="brand">
          <div className="brand-name">PASTA HOUSE</div>
          <div className="brand-sub">ROOM SERVICE ADMIN</div>
        </div>
        <nav className="a-nav" aria-label="관리 메뉴">
          <a className="is-active" href="./">주문판</a>
          <a href={OLD_SITE + 'menu-admin.html'} target="_blank" rel="noreferrer">메뉴 관리</a>
          <a href={OLD_SITE + 'sales-admin.html'} target="_blank" rel="noreferrer">매출 · 정산</a>
        </nav>
        <div className="grow" />
        <div className="seg" role="group" aria-label="영업 상태">
          {SERVICE.map(([k, label]) => (
            <button type="button" key={k} className={b.service === k ? `is-on is-${k}` : ''} aria-pressed={b.service === k} onClick={() => void b.changeService(k)}>
              {label}
            </button>
          ))}
        </div>
        {sound ? (
          <span className="status-txt"><span className="dot dot--ok" />알림음 켜짐</span>
        ) : (
          <button type="button" className="btn-outline btn-sound" onClick={enableSound}>알림음 켜기</button>
        )}
        <span className="status-txt"><span className={`dot ${b.online ? 'dot--ok' : 'dot--bad'}`} />{b.online ? `동기화 ${hhmm(b.lastSync?.toISOString() ?? null)}` : '연결 끊김'}</span>
        <button type="button" className={`btn-outline btn-sound${autoPrint ? ' is-on' : ''}`} aria-pressed={autoPrint} onClick={toggleAutoPrint}>
          접수 시 자동 인쇄 {autoPrint ? '켜짐' : '꺼짐'}
        </button>
        <div className="clock">{hhmm(new Date(now).toISOString())}</div>
        <button type="button" className="link" onClick={() => void supabase.auth.signOut()}>로그아웃</button>
      </header>

      {pending.length > 0 && (
        <div className="a-banner" role="status">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
          새 주문 {pending.length}건이 접수를 기다리고 있어요
          {!sound && <button type="button" className="banner-btn" onClick={enableSound}>알림음 켜기</button>}
        </div>
      )}

      <main className="a-main">
        <section className="cols" aria-label="주문 현황">
          <div className="col">
            <div className="col-head"><h2>신규 주문</h2><span className="count count--green">{pending.length}</span></div>
            {pending.length === 0 && <div className="empty-col">새 주문이 들어오면 여기에 떠요</div>}
            {pending.map((o) => {
              const age = minutesSince(o.created_at, now);
              return (
                <article className="ocard ocard--new" key={o.id}>
                  <div className="ocard-top">
                    <div>
                      <div className="room">{o.room_number}<span>호</span></div>
                      <div className="meta">주문 {pad(o.id)} · {hhmm(o.created_at)}</div>
                    </div>
                    <span className={ageChip(age)}>{age}분 경과</span>
                  </div>
                  <ul className="items">
                    {itemLines(o).map((it, i) => (
                      <li key={i}><strong>{it.q}×</strong><span>{it.n}{it.sub && <small>{it.sub}</small>}<Opts list={it.opts} /></span></li>
                    ))}
                  </ul>
                  {o.allergy_note && <div className="allergy">⚠ 알레르기: {o.allergy_note}</div>}
                  {o.request_note && <div className="note">{o.request_note}</div>}
                  <div className="ocard-foot">
                    <span>수저 {o.disposable_cutlery_qty ?? 0} · {o.payment_method === 'checkout' ? `객실 합산${o.guest_name ? ` (${o.guest_name})` : ''}` : '카드 결제'}{o.phone ? ` · ${o.phone}` : ''}</span>
                    <strong>{won(o.total_amount ?? 0)}원</strong>
                  </div>
                  <div className="accept-label">예상 시간을 눌러 접수</div>
                  <div className="accept">
                    {[15, 20, 30].map((m) => (
                      <button type="button" key={m} className="btn-green" onClick={() => { void b.accept(o.id, m); if (autoPrint) printTicket({ ...o, estimated_minutes: m, accepted_at: new Date().toISOString() }); }}>{m}분</button>
                    ))}
                  </div>
                  <button type="button" className="btn-outline danger" onClick={() => { setReason(REJECT_REASONS[0]); setRejecting(o); }}>거절하기</button>
                </article>
              );
            })}
          </div>

          <div className="col">
            <div className="col-head"><h2>조리 중</h2><span className="count">{cooking.length}</span></div>
            {cooking.map((o) => {
              const eta = o.estimated_minutes ?? 20;
              const age = minutesSince(o.accepted_at, now);
              const remain = eta - age;
              const tone = remain <= 0 ? 'red' : remain <= 3 ? 'amber' : 'green';
              const pct = Math.min(100, Math.round((age / eta) * 100));
              return (
                <article className="ocard" key={o.id}>
                  <div className="ocard-top">
                    <div>
                      <div className="room room--md">{o.room_number}<span>호</span></div>
                      <div className="meta">주문 {pad(o.id)} · 접수 {hhmm(o.accepted_at)}</div>
                    </div>
                    <div className="remain">
                      <span className={`remain-num tone-${tone}`}>{remain <= 0 ? `${-remain}분 지연` : `${remain}분 남음`}</span>
                      <span className="meta">약속 {eta}분</span>
                    </div>
                  </div>
                  <div className="bar" role="progressbar" aria-label="경과 시간" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <span className={`bar-fill tone-bg-${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                  <ul className="items items--sm">
                    {itemLines(o).map((it, i) => (
                      <li key={i}><strong>{it.q}×</strong><span>{it.n}{it.sub && <small>{it.sub}</small>}<Opts list={it.opts} /></span></li>
                    ))}
                  </ul>
                  {o.allergy_note && <div className="allergy allergy--sm">⚠ 알레르기: {o.allergy_note}</div>}
                  {o.request_note && <div className="note note--sm">{o.request_note}</div>}
                  <div className="row-btns">
                    <button type="button" className="btn-outline" onClick={() => printTicket(o)}>인쇄</button>
                    <button type="button" className="btn-green wide" onClick={() => void b.complete(o.id)}>배달 완료</button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="col">
            <div className="col-head"><h2 className="dim">오늘 완료</h2><span className="dim">{finished.length}건</span></div>
            <div className="donelist">
              {finished.length === 0 && <div className="empty-col empty-col--flat">아직 완료된 주문이 없어요</div>}
              {finished.map((o) => (
                <div className="done-row" key={o.id}>
                  <strong>{o.room_number}호</strong>
                  <span className="meta">{pad(o.id)} · {hhmm(o.completed_at || o.rejected_at)}</span>
                  <span className={o.status === 'rejected' ? 'tag tag--red' : 'tag'}>{o.status === 'rejected' ? '거절' : '완료'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="side">
          <section className="panel">
            <h2>오늘</h2>
            <div className="kpis">
              <div><span>주문</span><strong>{today.length}건</strong></div>
              <div><span>매출</span><strong>{won(revenue)}</strong></div>
            </div>
            <div className="roomcharge">
              <span className="roomcharge-t">객실 합산</span>
              <span className="roomcharge-v">{roomCharge.length}건 · {won(roomCharge.reduce((a, o) => a + (o.total_amount ?? 0), 0))}원</span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>빠른 품절</h2><span className="meta">자정에 자동 해제 · {soldCount}개 품절</span></div>
            <label htmlFor="q" className="sr-only">메뉴 검색</label>
            <input id="q" className="search" placeholder="메뉴 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="soldlist">
              {filtered.map((m) => {
                const off = isSoldOut(m);
                return (
                  <button type="button" key={m.id} className="sold-row" aria-pressed={!off} onClick={() => void b.setSoldOut(m.id, !off)}>
                    <span className={off ? 'strike' : ''}>{m.name}</span>
                    <span className="sold-right">
                      <span className={off ? 'lbl-off' : 'lbl-on'}>{off ? '품절' : '판매 중'}</span>
                      <span className={`switch${off ? '' : ' is-on'}`}><span /></span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </main>

      {rejecting && (
        <div className="modal-layer">
          <button type="button" className="modal-backdrop" aria-label="닫기" onClick={() => setRejecting(null)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label="주문 거절">
            <h2>{rejecting.room_number}호 주문을 거절할까요?</h2>
            <p className="meta">손님 화면에 아래 사유가 보여요.</p>
            <div className="reasons">
              {REJECT_REASONS.map((r) => (
                <button type="button" key={r} className={reason === r ? 'is-on' : ''} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
            <input className="search" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="거절 사유 직접 입력" />
            <div className="row-btns">
              <button type="button" className="btn-outline" onClick={() => setRejecting(null)}>취소</button>
              <button type="button" className="btn-danger wide" disabled={!reason.trim()} onClick={() => { void b.reject(rejecting.id, reason.trim()); setRejecting(null); }}>거절하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

