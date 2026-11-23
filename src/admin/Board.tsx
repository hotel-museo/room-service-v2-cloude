import { useEffect, useMemo, useState } from 'react';
import { kstTime, orderNo } from '../lib/format';
import { isSoldOut, visibleMenus, won } from '../lib/menu';
import { supabase } from '../lib/supabase';
import type { Order, ServiceStatus } from '../lib/types';
import { MenuAdmin } from './menu/MenuAdmin';
import { SalesPage } from './sales/SalesPage';
import { printTicket } from './print';
import { useBoard } from './useBoard';
import { kstDayStart, kstYmd } from './sales/aggregate';
import { GuestPreview } from './GuestPreview';
import { DELIVERY_KO } from '../lib/delivery';
import { AdminSettings, useStaff } from '../lib/staff';
import { HoursTab } from './menu/HoursTab';
import { RoomsSection } from './RoomsSection';
import { EtaSection } from './EtaSection';
import { loadMenuAdminData } from './menu/api';
import { orderedCategories } from '../lib/categories';
import { notifyPreview } from '../lib/preview';
import { useToast } from './menu/ui';
import { REJECT_REASONS as REJECT_PRESETS } from '../lib/rejectReasons';

const REJECT_REASONS = REJECT_PRESETS.map((r) => r.ko);
const SERVICE: [ServiceStatus, string][] = [['open', '영업 중'], ['busy', '바쁨'], ['preparing', '준비 중'], ['closed', '마감']];

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

type Page = 'orders' | 'menu' | 'sales' | 'settings';
function usePage(): Page {
  const get = (): Page => (location.hash === '#menu' ? 'menu' : location.hash === '#sales' ? 'sales' : location.hash === '#settings' ? 'settings' : 'orders');
  const [page, setPage] = useState<Page>(get);
  useEffect(() => {
    const on = () => setPage(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return page;
}

export function Board() {
  const b = useBoard();
  const page = usePage();
  const [now, setNow] = useState(Date.now());
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem('ph-auto-print') === '1');
  const [previewOpen, setPreviewOpen] = useState(() => localStorage.getItem('ph-preview-open') === '1');
  const togglePreview = () => {
    const v = !previewOpen;
    setPreviewOpen(v);
    localStorage.setItem('ph-preview-open', v ? '1' : '0');
  };
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

  // 윈도우 프로그램(PASTA HOUSE 주문)으로 열었으면 접수 대기 건수를 알려 줍니다 → 아이콘 숫자·깜빡임·창 자동 띄우기
  useEffect(() => {
    window.phDesktop?.setPending(pending.length);
  }, [pending.length]);
  useEffect(() => () => window.phDesktop?.setPending(0), []);

  useEffect(() => {
    document.title = pending.length ? `(${pending.length}) 새 주문 · PASTA HOUSE` : 'PASTA HOUSE · 관리자 주문판';
  }, [pending.length]);

  const today = b.orders.filter((o) => o.status !== 'rejected' && (o.status as string) !== 'canceled' && new Date(o.created_at).getTime() >= new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + 'T00:00:00+09:00').getTime());
  const revenue = today.reduce((a, o) => a + (o.total_amount ?? 0), 0);
  const roomCharge = today.filter((o) => o.payment_method === 'checkout');

  const menus = useMemo(() => visibleMenus(b.menus), [b.menus]);
  const filtered = menus.filter((m) => !query.trim() || m.name.includes(query.trim()));
  const soldCount = menus.filter((m) => isSoldOut(m)).length;

  const ageChip = (min: number) => (min >= 10 ? 'chip chip--red' : min >= 5 ? 'chip chip--amber' : 'chip');

  return (
    <div className={`admin${previewOpen ? ' has-preview' : ''}`}>
      <header className="a-head">
        <div className="brand">
          <div className="brand-name">PASTA HOUSE</div>
          <div className="brand-sub">ROOM SERVICE ADMIN</div>
        </div>
        <nav className="a-nav" aria-label="관리 메뉴">
          <a className={page === 'orders' ? 'is-active' : ''} href="#orders">주문판{page !== 'orders' && pending.length > 0 ? ` (${pending.length})` : ''}</a>
          <a className={page === 'menu' ? 'is-active' : ''} href="#menu">메뉴 관리</a>
          <a className={page === 'sales' ? 'is-active' : ''} href="#sales">매출 · 정산</a>
          <a className={page === 'settings' ? 'is-active' : ''} href="#settings">관리자 설정</a>
        </nav>
        <div className="grow" />
        <div className="seg seg--svc" role="group" aria-label="영업 상태">
          {SERVICE.map(([k, label]) => (
            <button type="button" key={k} className={b.service === k ? `is-on is-${k}` : ''} aria-pressed={b.service === k} onClick={() => void b.changeService(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tools">
          <button type="button" className={`tool${autoPrint ? ' is-on' : ''}`} onClick={toggleAutoPrint} aria-pressed={autoPrint} title="주문을 접수하면 주방 영수증을 자동으로 인쇄합니다">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z" /></svg>
            <span>자동 인쇄 {autoPrint ? '켜짐' : '꺼짐'}</span>
          </button>
          <button type="button" className={`tool${previewOpen ? ' is-on' : ''}`} onClick={togglePreview} aria-pressed={previewOpen} title="손님이 보는 주문 화면을 오른쪽에 띄웁니다. 메뉴를 바꾸면 바로 반영됩니다">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2" /></svg>
            <span>손님 화면</span>
          </button>
        </div>
        <div className="clockbox" title={b.online ? `마지막 동기화 ${kstTime(b.lastSync?.toISOString() ?? null)}` : '인터넷 연결을 확인해 주십시오'}>
          <span className={`dot ${b.online ? 'dot--ok' : 'dot--bad'}`} />
          <span className="clock">{kstTime(new Date(now).toISOString())}</span>
          {!b.online && <span className="offline">연결 끊김</span>}
        </div>
        <button type="button" className="logout" onClick={() => void supabase.auth.signOut()} title="로그아웃" aria-label="로그아웃">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4" /></svg>
        </button>
      </header>

      {pending.length > 0 && (
        <div className="a-banner" role="status">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
          새 주문 {pending.length}건이 접수를 기다리고 있습니다
          {page !== 'orders' && <a className="banner-btn" href="#orders">주문판 보기</a>}
        </div>
      )}

      {page === 'menu' && <MenuAdmin />}
      {page === 'sales' && <SalesPage />}
      {page === 'settings' && <BottegaSettings />}

      <main className="a-main" hidden={page !== 'orders'}>
        <section className="cols" aria-label="주문 현황">
          <div className="col">
            <div className="col-head"><h2>신규 주문</h2><span className="count count--green">{pending.length}</span></div>
            {pending.length === 0 && <div className="empty-col">새 주문이 들어오면 여기에 뜹니다</div>}
            {pending.map((o) => {
              const age = minutesSince(o.created_at, now);
              return (
                <article className="ocard ocard--new" key={o.id}>
                  <div className="ocard-top">
                    <div>
                      <div className="room">{o.room_number}<span>호</span></div>
                      <div className="meta">주문 {orderNo(o.id)} · {kstTime(o.created_at)}</div>
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
                  <DeliveryTag pref={o.delivery_pref} />
                  <div className="ocard-foot">
                    <span>수저 {o.disposable_cutlery_qty ?? 0} · {o.payment_method === 'checkout' ? `객실 합산${o.guest_name ? ` (${o.guest_name})` : ''}${o.checkout_consent_at ? ' · 후불 동의 ✓' : ''}` : '카드 결제'}{o.phone ? ` · ${o.phone}` : ''}</span>
                    <strong>{won(o.total_amount ?? 0)}원</strong>
                  </div>
                  <div className="accept-label">예상 시간을 눌러 접수</div>
                  <div className="accept">
                    {[15, 20, 30].map((m) => (
                      <button type="button" key={m} className="btn-green" onClick={() => { void b.accept(o.id, m); if (autoPrint) printTicket({ ...o, estimated_minutes: m, accepted_at: new Date().toISOString() }); }}>{m}분</button>
                    ))}
                  </div>
                  <button type="button" className="btn-outline danger" onClick={() => { setReason(''); setRejecting(o); }}>거절하기</button>
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
                      <div className="meta">주문 {orderNo(o.id)} · 접수 {kstTime(o.accepted_at)}</div>
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
                  <DeliveryTag pref={o.delivery_pref} />
                  {o.payment_method === 'checkout' && !(o.wings_posted_at || b.wings.find((w) => w.id === o.id)?.wings_posted_at) && <div className="wings-flag">투숙객 후불 · WINGS 입력 전{o.guest_name ? ` (${o.guest_name})` : ''}</div>}
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
              {finished.length === 0 && <div className="empty-col empty-col--flat">아직 완료된 주문이 없습니다</div>}
              {finished.map((o) => (
                <div className="done-row" key={o.id}>
                  <strong>{o.room_number}호</strong>
                  <span className="meta">{orderNo(o.id)} · {kstTime(o.completed_at || o.rejected_at)}</span>
                  <span className={o.status === 'rejected' ? 'tag tag--red' : 'tag'}>{o.status === 'rejected' ? '거절' : '완료'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="side">
          <WingsPanel list={b.wings} onPost={b.setWingsPosted} />
          <section className="panel">
            <h2>오늘</h2>
            <div className="kpis">
              <div><span>주문</span><strong>{today.length}건</strong></div>
              <div><span>매출</span><strong>{won(revenue)}원</strong></div>
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
            <h2>{rejecting.room_number}호 주문을 거절하시겠습니까?</h2>
            <p className="meta">고른 사유가 손님 화면에 보입니다. 아래 버튼 사유는 손님 언어(영어·일본어·중국어)로 자동 번역됩니다.</p>
            <div className="reasons">
              {REJECT_REASONS.map((r) => (
                <button type="button" key={r} className={reason === r ? 'is-on' : ''} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
            <label className="f-label" htmlFor="reject-custom">직접 입력</label>
            <input id="reject-custom" className="search" placeholder="예: 트러플 크림 재료가 떨어졌습니다" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} />
            {reason.trim() && !REJECT_REASONS.includes(reason.trim()) && <p className="f-hint">직접 쓴 사유는 번역되지 않고 그대로 보입니다. 외국인 손님이면 버튼 사유를 고르는 게 좋습니다.</p>}
            <div className="row-btns">
              <button type="button" className="btn-outline" onClick={() => setRejecting(null)}>취소</button>
              <button type="button" className="btn-danger wide" disabled={!reason.trim()} title={reason.trim() ? '' : '거절 사유를 골라 주십시오'} onClick={() => { void b.reject(rejecting.id, reason.trim()); setRejecting(null); }}>거절하기</button>
            </div>
          </div>
        </div>
      )}
      {previewOpen && <GuestPreview onClose={togglePreview} />}
    </div>
  );
}


/** 배달 방법: 기본(직접 전달)은 표시 안 하고, 문 앞에 두기만 눈에 띄게 */
function DeliveryTag({ pref }: { pref?: string | null }) {
  if (pref !== 'door') return null;
  return <div className="dtag">🚪 {DELIVERY_KO.door}</div>;
}

/** 오늘 기준 며칠 지났는지 (한국 날짜) */
const daysOld = (iso: string) => Math.floor((kstDayStart(kstYmd(new Date())).getTime() - kstDayStart(kstYmd(new Date(iso))).getTime()) / 864e5);
const OLD_DAYS = 3;

function WingsPanel({ list, onPost }: { list: Order[]; onPost: (id: number, on: boolean) => Promise<void> }) {
  const todo = list.filter((o) => !o.wings_posted_at);
  const posted = list.filter((o) => o.wings_posted_at);
  const md = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <section className={`panel${todo.length ? ' panel--alert' : ''}`}>
      <div className="panel-head"><h2>WINGS 입력 대기</h2><span className="meta">투숙객 후불 · {todo.length}건</span></div>
      {todo.length === 0 ? (
        <p className="meta" style={{ margin: 0 }}>WINGS에 넣을 주문이 없습니다</p>
      ) : (
        <ul className="wings-list">
          {todo.map((o) => (
            <li key={o.id}>
              <div>
                <strong>{o.room_number}호</strong> <span>{o.guest_name || '성함 없음'}</span>
                {daysOld(o.created_at) >= OLD_DAYS && <span className="tag tag--red">{daysOld(o.created_at)}일 지남</span>}
                <div className="meta">{orderNo(o.id)} · {md(o.created_at)}</div>
              </div>
              <b>{won(o.total_amount ?? 0)}원</b>
              <button type="button" className="btn-green btn-sm" onClick={() => void onPost(o.id, true)}>입력 완료</button>
            </li>
          ))}
        </ul>
      )}
      {posted.length > 0 && (
        <details className="wings-posted">
          <summary>입력함 · 프런트 확인 기다리는 중 {posted.length}건</summary>
          <ul className="wings-list">
            {posted.map((o) => (
              <li key={o.id}>
                <div><strong>{o.room_number}호</strong> <span className="meta">{orderNo(o.id)}</span></div>
                <b>{won(o.total_amount ?? 0)}원</b>
                <button type="button" className="link" onClick={() => void onPost(o.id, false)}>입력 취소</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** 보테가 관리자 설정: 비밀번호 → 보테가 직원 명단(보고용 이미지 담당자) · 비밀번호 변경 */
function BottegaSettings() {
  const staff = useStaff('bottega');
  const toast = useToast();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadMenuAdminData>> | null>(null);
  const reload = async () => { try { setData(await loadMenuAdminData()); } catch (e) { toast.show('영업시간을 불러오지 못했습니다: ' + (e as Error).message, true); } };
  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="fd">
      <AdminSettings team="bottega" usedFor="보고용 이미지" staff={staff} toast={toast.show}>
        <section className="fd-hours">
          <h2 className="fd-h2">영업시간 관리</h2>
          {data ? (
            <HoursTab key={JSON.stringify(data.hours)} hours={data.hours} labels={data.labels} cats={orderedCategories(data.catOrder, data.menus)} reload={async () => { await reload(); notifyPreview(); }} toast={toast.show} />
          ) : (
            <p className="meta">불러오는 중…</p>
          )}
        </section>
        <EtaSection toast={toast.show} />
        <RoomsSection toast={toast.show} />
      </AdminSettings>
      {toast.node}
    </main>
  );
}
