import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { won } from '../lib/menu';
import { supabase } from '../lib/supabase';
import type { Order } from '../lib/types';
import { audioReady, chime, unlockAudio } from '../admin/alarm';
import { useToast } from '../admin/menu/ui';
import { addDays, kstDayStart, kstYmd } from '../admin/sales/aggregate';
import { printFolio } from './folio';

type Tab = 'open' | 'done';
type Method = 'room' | 'card' | 'cash';
const METHOD: Record<Method, string> = { room: 'WINGS 객실에 올림', card: '카드로 받음', cash: '현금으로 받음' };
const METHOD_SHORT: Record<Method, string> = { room: 'WINGS', card: '카드', cash: '현금' };
const STAFF_KEY = 'ph-front-staff';
const readStaff = () => { try { return localStorage.getItem(STAFF_KEY) ?? ''; } catch { return ''; } };
const pad = (n: number) => '#' + String(n).padStart(4, '0');
const dt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const summary = (o: Order) => (o.order_items ?? []).map((it) => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');

interface Group { k: string; room: string; guest: string; list: Order[]; total: number; cooking: number }

function group(list: Order[]): Group[] {
  const m = new Map<string, Order[]>();
  list.forEach((o) => {
    const k = `${o.room_number}|${(o.guest_name ?? '').trim()}`;
    m.set(k, [...(m.get(k) ?? []), o]);
  });
  return [...m.entries()]
    .map(([k, l]) => {
      const sorted = [...l].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return { k, room: sorted[0].room_number ?? '', guest: sorted[0].guest_name ?? '', list: sorted, total: sorted.reduce((a, o) => a + (o.total_amount ?? 0), 0), cooking: sorted.filter((o) => o.status === 'cooking').length };
    })
    .sort((a, b) => a.room.localeCompare(b.room, 'ko', { numeric: true }));
}

export function FrontApp() {
  const [role, setRole] = useState<string>('');
  const [tab, setTab] = useState<Tab>('open');
  const [day, setDay] = useState(() => kstYmd(new Date()));
  const [open, setOpen] = useState<Order[]>([]);
  const [done, setDone] = useState<Order[]>([]);
  const [q, setQ] = useState('');
  const [sound, setSound] = useState(false);
  const [online, setOnline] = useState(true);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [settling, setSettling] = useState<Group | null>(null);
  const seen = useRef<Set<number> | null>(null);
  const toast = useToast();

  useEffect(() => {
    void supabase.rpc('my_role').then(({ data }) => setRole((data as string) ?? 'admin'));
  }, []);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const from = kstDayStart(day).toISOString();
    const to = kstDayStart(addDays(day, 1)).toISOString();
    const [a, b] = await Promise.all([
      supabase.from('orders').select('*').eq('payment_method', 'checkout').in('status', ['cooking', 'completed']).is('settled_at', null).gte('created_at', since).order('created_at').limit(1000),
      supabase.from('orders').select('*').eq('payment_method', 'checkout').gte('settled_at', from).lt('settled_at', to).order('settled_at', { ascending: false }).limit(1000),
    ]);
    if (a.error || b.error) { setOnline(false); return; }
    setOnline(true);
    const list = (a.data ?? []) as Order[];
    if (seen.current) {
      const newOnes = list.filter((o) => !seen.current!.has(o.id));
      if (newOnes.length) {
        chime();
        setFresh((s) => new Set([...s, ...newOnes.map((o) => o.id)]));
      }
    }
    seen.current = new Set([...(seen.current ?? []), ...list.map((o) => o.id)]);
    setOpen(list);
    setDone((b.data ?? []) as Order[]);
  }, [day]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(id);
  }, [load]);

  const match = (g: Group) => !q.trim() || g.room.includes(q.trim()) || g.guest.includes(q.trim());
  const openGroups = useMemo(() => group(open).filter(match), [open, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneGroups = useMemo(() => {
    const m = new Map<string, Order[]>();
    done.forEach((o) => { const k = `${o.settled_at}|${o.room_number}`; m.set(k, [...(m.get(k) ?? []), o]); });
    return [...m.values()].map((l) => ({ ...group(l)[0], k: `${l[0].settled_at}|${l[0].room_number}` })).filter(match);
  }, [done, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const openTotal = open.reduce((a, o) => a + (o.total_amount ?? 0), 0);
  const doneTotal = done.reduce((a, o) => a + (o.total_amount ?? 0), 0);

  const settle = async (g: Group, method: Method, note: string, staff: string) => {
    try { localStorage.setItem(STAFF_KEY, staff.trim()); } catch { /* 무시 */ }
    const { error } = await supabase.from('orders')
      .update({ settled_at: new Date().toISOString(), settle_method: method, settle_note: note.trim() || null, settle_staff: staff.trim() })
      .in('id', g.list.map((o) => o.id)).is('settled_at', null);
    if (error) toast.show('저장하지 못했어요: ' + error.message, true);
    else toast.show(`${g.room}호 ${won(g.total)}원 처리 완료`);
    setSettling(null);
    void load();
  };

  const undo = async (g: Group) => {
    const { error } = await supabase.from('orders').update({ settled_at: null }).in('id', g.list.map((o) => o.id));
    if (error) toast.show('되돌리지 못했어요: ' + error.message, true);
    else toast.show(`${g.room}호 처리를 되돌렸어요`);
    void load();
  };

  const print = (g: Group) => { if (!printFolio(g.room, g.guest, g.list)) toast.show('팝업이 막혀 있어요. 주소창 오른쪽에서 팝업을 허용해 주세요', true); };

  return (
    <div className="admin">
      <header className="a-head">
        <div className="brand">
          <div className="brand-name">HOTEL MUSEO</div>
          <div className="brand-sub">FRONT · ROOM SERVICE</div>
        </div>
        <nav className="a-nav" aria-label="프런트 메뉴">
          <button type="button" className={`nav-btn${tab === 'open' ? ' is-active' : ''}`} onClick={() => setTab('open')}>받을 금액 {open.length > 0 ? `(${group(open).length})` : ''}</button>
          <button type="button" className={`nav-btn${tab === 'done' ? ' is-active' : ''}`} onClick={() => setTab('done')}>처리 완료</button>
        </nav>
        <div className="grow" />
        <input className="inp inp--sm fd-search" type="search" inputMode="numeric" placeholder="객실 번호 · 성함" value={q} onChange={(e) => setQ(e.target.value)} aria-label="객실 번호 또는 성함 검색" />
        {sound ? (
          <span className="status-txt"><span className="dot dot--ok" />알림음 켜짐</span>
        ) : (
          <button type="button" className="btn-outline btn-sound" onClick={() => { unlockAudio(); window.setTimeout(() => setSound(audioReady()), 200); }}>알림음 켜기</button>
        )}
        <span className="status-txt"><span className={`dot ${online ? 'dot--ok' : 'dot--bad'}`} />{online ? '연결됨' : '연결 끊김'}</span>
        {role === 'admin' && <a className="link" href="../admin/">관리자 화면</a>}
        <button type="button" className="link" onClick={() => void supabase.auth.signOut()}>로그아웃</button>
      </header>

      <main className="fd">
        {tab === 'open' ? (
          <>
            <div className="fd-sum">
              <div><span>받을 금액 합계</span><strong>{won(openTotal)}원</strong></div>
              <p className="meta">주방에서 접수한 투숙객 후불 주문이 객실·성함별로 모여요. 손님 객실에 올렸거나 직접 받았으면 <b>처리 완료</b>를 눌러 주세요. 매출·정산에 바로 반영돼요.</p>
            </div>
            {openGroups.length === 0 ? (
              <div className="empty-col">{q ? '검색한 객실이 없어요' : '처리할 룸서비스 금액이 없어요'}</div>
            ) : (
              <div className="fd-grid">
                {openGroups.map((g) => {
                  const isNew = g.list.some((o) => fresh.has(o.id));
                  return (
                    <article key={g.k} className={`fd-card${isNew ? ' is-new' : ''}`} onClick={() => isNew && setFresh((s) => { const n = new Set(s); g.list.forEach((o) => n.delete(o.id)); return n; })}>
                      <div className="fd-top">
                        <div>
                          <div className="fd-room">{g.room}호</div>
                          <div className="fd-guest">{g.guest || '성함 없음'}</div>
                        </div>
                        <div className="fd-amt">{won(g.total)}<small>원</small></div>
                      </div>
                      {isNew && <span className="tag">새로 들어옴</span>}
                      <ul className="fd-orders">
                        {g.list.map((o) => (
                          <li key={o.id}>
                            <div className="fd-ol">
                              <span className="meta">{pad(o.id)} · {dt(o.created_at)}</span>
                              <span className={`chip${o.status === 'cooking' ? ' chip--amber' : ''}`}>{o.status === 'cooking' ? '조리 중' : '배달 완료'}</span>
                            </div>
                            <div className="fd-items">{summary(o)}</div>
                            <div className="fd-ol"><span className="meta">{o.phone ?? ''}</span><b>{won(o.total_amount ?? 0)}원</b></div>
                          </li>
                        ))}
                      </ul>
                      <div className="fd-actions">
                        <button type="button" className="btn-outline btn-sm" onClick={() => print(g)}>내역서 인쇄</button>
                        <button type="button" className="btn-green btn-sm grow" onClick={() => setSettling(g)}>처리 완료</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="filters">
              <input className="inp inp--date" type="date" value={day} max={kstYmd(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="처리한 날짜" />
              <span className="meta">처리 {done.length}건 · {won(doneTotal)}원</span>
            </div>
            {doneGroups.length === 0 ? (
              <div className="empty-col">이 날 처리한 내역이 없어요</div>
            ) : (
              <div className="panel">
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>처리 시각</th><th>객실</th><th>성함</th><th>주문</th><th>방법</th><th>담당자</th><th className="num">금액</th><th /></tr></thead>
                    <tbody>
                      {doneGroups.map((g) => {
                        const o = g.list[0];
                        return (
                          <tr key={g.k}>
                            <td>{dt(o.settled_at!)}</td>
                            <td className="strong">{g.room}호</td>
                            <td>{g.guest || '–'}</td>
                            <td><span className="meta">{g.list.map((x) => pad(x.id)).join(' ')}</span>{o.settle_note ? <div className="meta">메모: {o.settle_note}</div> : null}</td>
                            <td>{o.settle_method ? METHOD_SHORT[o.settle_method] : '관리자 처리'}</td>
                            <td>{o.settle_staff || '–'}</td>
                            <td className="num strong">{won(g.total)}원</td>
                            <td className="num">
                              <button type="button" className="link" onClick={() => print(g)}>인쇄</button>{' '}
                              <button type="button" className="link" onClick={() => void undo(g)}>되돌리기</button>
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

      {settling && <SettleModal g={settling} onClose={() => setSettling(null)} onSave={settle} />}
      {toast.node}
    </div>
  );
}

function SettleModal({ g, onClose, onSave }: { g: Group; onClose: () => void; onSave: (g: Group, m: Method, note: string, staff: string) => Promise<void> }) {
  const [method, setMethod] = useState<Method>('room');
  const [note, setNote] = useState('');
  const [staff, setStaff] = useState(readStaff);
  const [busy, setBusy] = useState(false);
  const ok = staff.trim().length > 0;
  return (
    <div className="modal-layer">
      <button type="button" className="modal-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settle-t">
        <h2 id="settle-t">{g.room}호 · {g.guest || '성함 없음'}</h2>
        <div className="fd-amt fd-amt--lg">{won(g.total)}<small>원</small></div>
        {g.cooking > 0 && <p className="f-hint">아직 조리 중인 주문 {g.cooking}건이 함께 있어요. 금액은 확정이라 처리해도 괜찮아요.</p>}
        <div className="fd-methods" role="radiogroup" aria-label="처리 방법">
          {(Object.keys(METHOD) as Method[]).map((m) => (
            <label key={m} className={`fd-method${method === m ? ' is-on' : ''}`}>
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
              <span>{METHOD[m]}</span>
              {m === 'room' && <small>체크아웃 때 객실 요금과 함께 결제</small>}
            </label>
          ))}
        </div>
        <label className="f-label" htmlFor="settle-staff">담당자 <span className="req">필수</span></label>
        <input id="settle-staff" className="inp" placeholder="처리한 직원 이름" value={staff} onChange={(e) => setStaff(e.target.value)} maxLength={30} autoFocus={!staff} />
        <input className="inp" placeholder="메모 (선택) 예: WINGS 전표 번호" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="메모" />
        <div className="fd-actions">
          <button type="button" className="btn-outline" onClick={onClose}>취소</button>
          <button type="button" className="btn-green grow" disabled={busy || !ok} onClick={async () => { setBusy(true); await onSave(g, method, note, staff); }}>{busy ? '저장 중…' : '처리 완료'}</button>
        </div>
      </div>
    </div>
  );
}
