import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { won } from '../lib/menu';
import { supabase } from '../lib/supabase';
import type { Order } from '../lib/types';
import { useToast } from '../admin/menu/ui';
import { addDays, kstDayStart, kstYmd } from '../admin/sales/aggregate';
import { printFolio } from './folio';
import { printPaidReport } from './report';
import { downloadPaidXlsx } from './excel';

/**
 * 프런트 GL 화면. 투숙객 후불 주문의 3단계 중 프런트 몫 2단계를 처리합니다.
 *   (보테가) WINGS 입력 완료 → (프런트) 객실 반영 확인 → (프런트) 퇴실 결제 완료
 * 퇴실 결제 대기는 날짜와 상관없이 결제 완료될 때까지 계속 남아 있어요 (연박·장기 투숙).
 */
type Tab = 'confirm' | 'stay' | 'paid';
type Step = 'confirm' | 'paid';

const STAFF_KEY = 'ph-front-staff';
const readStaff = () => { try { return localStorage.getItem(STAFF_KEY) ?? ''; } catch { return ''; } };
const pad = (n: number) => '#' + String(n).padStart(4, '0');
const dt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const summary = (o: Order) => (o.order_items ?? []).map((it) => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');
const daysSince = (iso: string) => Math.floor((kstDayStart(kstYmd(new Date())).getTime() - kstDayStart(kstYmd(new Date(iso))).getTime()) / 864e5);

interface Group { k: string; room: string; guest: string; list: Order[]; total: number; cooking: number }

function group(list: Order[], keyOf: (o: Order) => string = (o) => `${o.room_number}|${(o.guest_name ?? '').trim()}`): Group[] {
  const m = new Map<string, Order[]>();
  list.forEach((o) => { const k = keyOf(o); m.set(k, [...(m.get(k) ?? []), o]); });
  return [...m.entries()]
    .map(([k, l]) => {
      const sorted = [...l].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return { k, room: sorted[0].room_number ?? '', guest: sorted[0].guest_name ?? '', list: sorted, total: sorted.reduce((a, o) => a + (o.total_amount ?? 0), 0), cooking: sorted.filter((o) => o.status === 'cooking').length };
    })
    .sort((a, b) => a.room.localeCompare(b.room, 'ko', { numeric: true }));
}

export function FrontApp() {
  const [tab, setTab] = useState<Tab>('confirm');
  const [day, setDay] = useState(() => kstYmd(new Date()));
  const [toConfirm, setToConfirm] = useState<Order[]>([]);
  const [staying, setStaying] = useState<Order[]>([]);
  const [paid, setPaid] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  const [online, setOnline] = useState(true);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [acting, setActing] = useState<{ g: Group; step: Step } | null>(null);
  const seen = useRef<Set<number> | null>(null);
  const toast = useToast();


  const load = useCallback(async () => {
    const since = new Date(Date.now() - 120 * 864e5).toISOString();
    const base = () => supabase.from('orders').select('*').eq('payment_method', 'checkout');
    const [a, b, c] = await Promise.all([
      base().in('status', ['cooking', 'completed']).not('wings_posted_at', 'is', null).is('settled_at', null).gte('created_at', since).order('created_at').limit(1000),
      base().not('settled_at', 'is', null).is('checkout_paid_at', null).order('created_at').limit(2000),
      base().gte('checkout_paid_at', kstDayStart(day).toISOString()).lt('checkout_paid_at', kstDayStart(addDays(day, 1)).toISOString()).order('checkout_paid_at', { ascending: false }).limit(1000),
    ]);
    if (a.error || b.error || c.error) { setOnline(false); return; }
    setOnline(true);
    const list = (a.data ?? []) as Order[];
    if (seen.current) {
      const newOnes = list.filter((o) => !seen.current!.has(o.id));
      if (newOnes.length) { setFresh((s) => new Set([...s, ...newOnes.map((o) => o.id)])); }
    }
    seen.current = new Set([...(seen.current ?? []), ...list.map((o) => o.id)]);
    setToConfirm(list);
    setStaying((b.data ?? []) as Order[]);
    setPaid((c.data ?? []) as Order[]);
  }, [day]);

  // 프런트는 소리 없이 화면으로만 알려요: 브라우저 탭 제목에 확인할 객실 수
  const confirmCount = useMemo(() => group(toConfirm).length, [toConfirm]);
  useEffect(() => {
    document.title = confirmCount ? `(${confirmCount}) 객실 반영 확인 · 프런트` : '프런트 · 룸서비스 정산';
  }, [confirmCount]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(id);
  }, [load]);

  const match = (g: Group) => !q.trim() || g.room.includes(q.trim()) || g.guest.includes(q.trim());
  const confirmGroups = useMemo(() => group(toConfirm).filter(match), [toConfirm, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const stayGroups = useMemo(() => group(staying).filter(match), [staying, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const paidGroups = useMemo(() => group(paid, (o) => `${o.checkout_paid_at}|${o.room_number}`).filter(match), [paid, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = (l: Order[]) => l.reduce((a, o) => a + (o.total_amount ?? 0), 0);

  const save = async (g: Group, step: Step, note: string, staff: string) => {
    try { localStorage.setItem(STAFF_KEY, staff.trim()); } catch { /* 무시 */ }
    const now = new Date().toISOString();
    const ids = g.list.map((o) => o.id);
    const { error } = step === 'confirm'
      ? await supabase.from('orders').update({ settled_at: now, settle_method: 'room', settle_note: note.trim() || null, settle_staff: staff.trim() }).in('id', ids).is('settled_at', null)
      : await supabase.from('orders').update({ checkout_paid_at: now, checkout_note: note.trim() || null, checkout_staff: staff.trim() }).in('id', ids).is('checkout_paid_at', null);
    if (error) toast.show('저장하지 못했어요: ' + error.message, true);
    else toast.show(step === 'confirm' ? `${g.room}호 객실 반영 확인 → 퇴실 결제 대기로 옮겼어요` : `${g.room}호 퇴실 결제 완료`);
    setActing(null);
    void load();
  };

  const undo = async (g: Group, step: Step) => {
    const ids = g.list.map((o) => o.id);
    const { error } = step === 'confirm'
      ? await supabase.from('orders').update({ settled_at: null }).in('id', ids).is('checkout_paid_at', null)
      : await supabase.from('orders').update({ checkout_paid_at: null }).in('id', ids);
    if (error) toast.show('되돌리지 못했어요: ' + error.message, true);
    else toast.show(step === 'confirm' ? `${g.room}호를 객실 반영 확인 전으로 되돌렸어요` : `${g.room}호를 퇴실 결제 대기로 되돌렸어요`);
    void load();
  };

  const print = (g: Group) => { if (!printFolio(g.room, g.guest, g.list)) toast.show('팝업이 막혀 있어요. 주소창 오른쪽에서 팝업을 허용해 주세요', true); };
  const clearFresh = (g: Group) => setFresh((s) => { const n = new Set(s); g.list.forEach((o) => n.delete(o.id)); return n; });

  const orderList = (g: Group, showStatus: boolean) => (
    <ul className="fd-orders">
      {g.list.map((o) => (
        <li key={o.id}>
          <div className="fd-ol">
            <span className="meta">{pad(o.id)} · {dt(o.created_at)}</span>
            {showStatus && <span className={`chip${o.status === 'cooking' ? ' chip--amber' : ''}`}>{o.status === 'cooking' ? '조리 중' : '배달 완료'}</span>}
          </div>
          <div className="fd-items">{summary(o)}</div>
          <div className={`fd-consent${o.checkout_consent_at ? '' : ' is-missing'}`}>{o.checkout_consent_at ? `✓ 고객 후불 동의 ${dt(o.checkout_consent_at)}` : '후불 동의 기록 없음 (이전 주문)'}</div>
          {o.settle_note && <div className="meta">특이사항: {o.settle_note}</div>}
          <div className="fd-ol"><span className="meta">{o.settle_staff ? `확인 ${o.settle_staff}` : o.phone ?? ''}</span><b>{won(o.total_amount ?? 0)}원</b></div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="admin">
      <header className="a-head">
        <div className="brand">
          <div className="brand-name">HOTEL MUSEO</div>
          <div className="brand-sub">FRONT · ROOM SERVICE</div>
        </div>
        <nav className="a-nav" aria-label="프런트 메뉴">
          <button type="button" className={`nav-btn${tab === 'confirm' ? ' is-active' : ''}`} onClick={() => setTab('confirm')}>객실 반영 확인{toConfirm.length ? ` (${group(toConfirm).length})` : ''}</button>
          <button type="button" className={`nav-btn${tab === 'stay' ? ' is-active' : ''}`} onClick={() => setTab('stay')}>퇴실 결제 대기{staying.length ? ` (${group(staying).length})` : ''}</button>
          <button type="button" className={`nav-btn${tab === 'paid' ? ' is-active' : ''}`} onClick={() => setTab('paid')}>결제 완료</button>
        </nav>
        <div className="grow" />
        <input className="inp inp--sm fd-search" type="search" placeholder="객실 번호 · 성함" value={q} onChange={(e) => setQ(e.target.value)} aria-label="객실 번호 또는 성함 검색" />
        <span className="status-txt"><span className={`dot ${online ? 'dot--ok' : 'dot--bad'}`} />{online ? '연결됨' : '연결 끊김'}</span>
        <button type="button" className="link" onClick={() => void supabase.auth.signOut()}>로그아웃</button>
      </header>

      <main className="fd">
        {tab === 'confirm' && (
          <>
            <div className="fd-sum">
              <div><span>확인할 금액</span><strong>{won(sum(toConfirm))}원</strong></div>
              <p className="meta">보테가에서 <b>WINGS 입력 완료</b>한 투숙객 후불 주문이에요. WINGS에서 객실 결제로 잘 들어갔는지 확인하고 <b>객실 반영 확인</b>을 눌러 주세요. 확인한 객실은 <b>퇴실 결제 대기</b>로 넘어가요.</p>
            </div>
            {confirmGroups.length === 0 ? (
              <div className="empty-col">{q ? '검색한 객실이 없어요' : '확인할 주문이 없어요'}</div>
            ) : (
              <div className="fd-grid">
                {confirmGroups.map((g) => {
                  const isNew = g.list.some((o) => fresh.has(o.id));
                  return (
                    <article key={g.k} className={`fd-card${isNew ? ' is-new' : ''}`} onClick={() => isNew && clearFresh(g)}>
                      <div className="fd-top">
                        <div><div className="fd-room">{g.room}호</div><div className="fd-guest">{g.guest || '성함 없음'}</div></div>
                        <div className="fd-amt">{won(g.total)}<small>원</small></div>
                      </div>
                      {isNew && <span className="tag">새로 들어옴</span>}
                      {orderList(g, true)}
                      <div className="fd-actions">
                        <button type="button" className="btn-outline btn-sm" onClick={() => print(g)}>내역서 인쇄</button>
                        <button type="button" className="btn-green btn-sm grow" onClick={() => setActing({ g, step: 'confirm' })}>객실 반영 확인</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'stay' && (
          <>
            <div className="fd-sum">
              <div><span>퇴실 때 받을 금액</span><strong>{won(sum(staying))}원</strong></div>
              <p className="meta">객실 반영 확인이 끝난 객실이에요. 연박·장기 투숙 손님은 <b>퇴실 결제 완료</b>를 누를 때까지 날짜가 지나도 계속 여기 남아요. 같은 손님이 다음 날 또 주문하면 이 카드에 합쳐져요.</p>
            </div>
            {stayGroups.length === 0 ? (
              <div className="empty-col">{q ? '검색한 객실이 없어요' : '퇴실 결제를 기다리는 객실이 없어요'}</div>
            ) : (
              <div className="fd-grid">
                {stayGroups.map((g) => {
                  const days = daysSince(g.list[0].created_at);
                  return (
                    <article key={g.k} className="fd-card">
                      <div className="fd-top">
                        <div><div className="fd-room">{g.room}호</div><div className="fd-guest">{g.guest || '성함 없음'}</div></div>
                        <div className="fd-amt">{won(g.total)}<small>원</small></div>
                      </div>
                      <div className="fd-ol">
                        <span className="meta">주문 {g.list.length}건 · 첫 주문 {dt(g.list[0].created_at)}</span>
                        {days > 0 && <span className="fd-days">{days}일째</span>}
                      </div>
                      {orderList(g, false)}
                      <div className="fd-actions">
                        <button type="button" className="btn-outline btn-sm" onClick={() => print(g)}>내역서 인쇄</button>
                        <button type="button" className="btn-green btn-sm grow" onClick={() => setActing({ g, step: 'paid' })}>퇴실 결제 완료</button>
                      </div>
                      <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => void undo(g, 'confirm')}>객실 반영 확인 취소</button>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'paid' && (
          <>
            <div className="filters">
              <input className="inp inp--date" type="date" value={day} max={kstYmd(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="결제한 날짜" />
              <span className="meta">퇴실 결제 {paidGroups.length}객실 · {won(sum(paid))}원</span>
              <span className="grow" />
              <button type="button" className="btn-outline btn-sm" disabled={!paid.length} onClick={() => void downloadPaidXlsx(day, paid).catch(() => toast.show('엑셀을 만들지 못했어요. 다시 눌러 주세요', true))}>엑셀 다운로드</button>
              <button type="button" className="btn-green btn-sm" onClick={() => { if (!printPaidReport(day, group(paid))) toast.show('팝업이 막혀 있어요. 주소창 오른쪽에서 팝업을 허용해 주세요', true); }}>대표 보고서 인쇄 · PDF</button>
            </div>
            {paidGroups.length === 0 ? (
              <div className="empty-col">이 날 퇴실 결제한 객실이 없어요</div>
            ) : (
              <div className="panel">
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>결제 시각</th><th>객실</th><th>성함</th><th>주문</th><th>결제 담당</th><th className="num">금액</th><th /></tr></thead>
                    <tbody>
                      {paidGroups.map((g) => {
                        const o = g.list[0];
                        return (
                          <tr key={g.k}>
                            <td>{dt(o.checkout_paid_at!)}</td>
                            <td className="strong">{g.room}호</td>
                            <td>{g.guest || '–'}</td>
                            <td><span className="meta">{g.list.map((x) => pad(x.id)).join(' ')}</span>{o.checkout_note ? <div className="meta">특이사항: {o.checkout_note}</div> : null}</td>
                            <td>{o.checkout_staff || '–'}</td>
                            <td className="num strong">{won(g.total)}원</td>
                            <td className="num">
                              <button type="button" className="link" onClick={() => print(g)}>내역서</button>{' '}
                              <button type="button" className="link" onClick={() => void undo(g, 'paid')}>결제 취소</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {acting && <StepModal g={acting.g} step={acting.step} onClose={() => setActing(null)} onSave={save} />}
      {toast.node}
    </div>
  );
}

function StepModal({ g, step, onClose, onSave }: { g: Group; step: Step; onClose: () => void; onSave: (g: Group, step: Step, note: string, staff: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [staff, setStaff] = useState(readStaff);
  const [busy, setBusy] = useState(false);
  const label = step === 'confirm' ? '객실 반영 확인' : '퇴실 결제 완료';
  return (
    <div className="modal-layer">
      <button type="button" className="modal-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="step-t">
        <h2 id="step-t">{g.room}호 · {g.guest || '성함 없음'}</h2>
        <div className="fd-amt fd-amt--lg">{won(g.total)}<small>원</small></div>
        <p className="f-hint">
          {step === 'confirm'
            ? 'WINGS에서 이 객실에 위 금액이 결제로 들어가 있는지 확인한 뒤 눌러 주세요. 퇴실 결제 대기로 넘어가요.'
            : `주문 ${g.list.length}건 합계예요. 퇴실 때 결제를 받았으면 눌러 주세요. 영수증과 함께 대표님께 보고해 주세요.`}
        </p>
        {step === 'confirm' && g.cooking > 0 && <p className="f-hint">아직 조리 중인 주문 {g.cooking}건이 함께 있어요. 금액은 확정이라 지금 확인해도 괜찮아요.</p>}
        <label className="f-label" htmlFor="step-staff">담당자 <span className="req">필수</span></label>
        <input id="step-staff" className="inp" placeholder="처리한 직원 이름" value={staff} onChange={(e) => setStaff(e.target.value)} maxLength={30} autoFocus={!staff} />
        <input className="inp" placeholder="특이사항 (있을 때만)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="특이사항" />
        <div className="fd-actions">
          <button type="button" className="btn-outline" onClick={onClose}>취소</button>
          <button type="button" className="btn-green grow" disabled={busy || !staff.trim()} onClick={async () => { setBusy(true); await onSave(g, step, note, staff); }}>{busy ? '저장 중…' : label}</button>
        </div>
      </div>
    </div>
  );
}
