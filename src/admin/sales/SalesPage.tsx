import { useCallback, useEffect, useMemo, useState } from 'react';
import { won } from '../../lib/menu';
import { supabase } from '../../lib/supabase';
import type { CategoryLabels, Menu, Order, SetMenu } from '../../lib/types';
import { useToast } from '../menu/ui';
import { addDays, downloadCsv, itemSummary, kstDayStart, kstYmd, presetRange, summarize, type Preset, type RankRow } from './aggregate';
import { ColumnChart, compactWon } from './Charts';

const PRESETS: [Preset, string][] = [['today', '오늘'], ['yesterday', '어제'], ['week', '최근 7일'], ['month', '이번 달'], ['lastMonth', '지난 달'], ['custom', '직접 선택']];
const pad = (n: number) => '#' + String(n).padStart(4, '0');
const dt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

type Sort = 'revenue' | 'qty';
type Kind = 'all' | 'menu' | 'set';

export function SalesPage() {
  const [preset, setPreset] = useState<Preset>('today');
  const [range, setRange] = useState(() => presetRange('today'));
  const [orders, setOrders] = useState<Order[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [sets, setSets] = useState<SetMenu[]>([]);
  const [labels, setLabels] = useState<CategoryLabels>({});
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>('revenue');
  const [kind, setKind] = useState<Kind>('all');
  const [cat, setCat] = useState('ALL');
  const [onlyUnsettled, setOnlyUnsettled] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const from = kstDayStart(range.from).toISOString();
    const to = kstDayStart(addDays(range.to, 1)).toISOString();
    const [o, m, s, l] = await Promise.all([
      supabase.from('orders').select('*').gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }).limit(5000),
      supabase.from('menus').select('*'),
      supabase.from('set_menus').select('*'),
      supabase.from('site_settings').select('settings').eq('key', 'category_translations').maybeSingle(),
    ]);
    if (o.error) toast.show('불러오지 못했어요: ' + o.error.message, true);
    setOrders((o.data ?? []) as Order[]);
    setMenus((m.data ?? []) as Menu[]);
    setSets((s.data ?? []) as SetMenu[]);
    setLabels((l.data?.settings ?? {}) as CategoryLabels);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => { void load(); }, [load]);

  const pick = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  const s = useMemo(() => summarize(orders, menus, sets, range.from, range.to), [orders, menus, sets, range.from, range.to]);
  const catLabel = (c: string) => (c === 'SET' ? '세트' : labels[c]?.ko || c || '기타');

  const ranking = useMemo(() => {
    const list = s.ranking.filter((r) => (kind === 'all' || r.kind === kind) && (cat === 'ALL' || r.category === cat));
    const qty = (r: RankRow) => r.soloQty + r.inSetQty;
    return list.sort((a, b) => (sort === 'revenue' ? b.revenue - a.revenue || qty(b) - qty(a) : qty(b) - qty(a) || b.revenue - a.revenue));
  }, [s.ranking, kind, cat, sort]);
  const rankMax = Math.max(1, ...ranking.map((r) => (sort === 'revenue' ? r.revenue : r.soloQty + r.inSetQty)));
  const rankCats = [...new Set(s.ranking.map((r) => r.category))];
  const multiDay = range.from !== range.to;

  // 객실 합산 정산표
  const roomOrders = s.completed.filter((o) => o.payment_method === 'checkout' && (!onlyUnsettled || !o.settled_at));
  const roomGroups = useMemo(() => {
    const g = new Map<string, Order[]>();
    roomOrders.forEach((o) => {
      const k = `${o.room_number}|${(o.guest_name ?? '').trim()}`;
      g.set(k, [...(g.get(k) ?? []), o]);
    });
    return [...g.entries()].map(([k, list]) => ({ k, room: list[0].room_number ?? '', guest: list[0].guest_name ?? '', list, total: list.reduce((a, o) => a + (o.total_amount ?? 0), 0), settled: list.every((o) => o.settled_at) }))
      .sort((a, b) => Number(a.settled) - Number(b.settled) || a.room.localeCompare(b.room, 'ko', { numeric: true }));
  }, [roomOrders]);

  const settle = async (list: Order[], on: boolean) => {
    const { error } = await supabase.from('orders').update({ settled_at: on ? new Date().toISOString() : null }).in('id', list.map((o) => o.id));
    if (error) toast.show('저장하지 못했어요: ' + error.message, true);
    else toast.show(on ? '정산 완료로 표시했어요' : '정산 완료를 취소했어요');
    void load();
  };

  const exportOrders = () =>
    downloadCsv(`룸서비스_주문내역_${range.from}_${range.to}.csv`,
      ['주문번호', '주문일시', '객실', '상태', '결제', '투숙객', '메뉴', '금액', '요청사항', '알레르기', '정산', '정산 방법', '담당자'],
      orders.map((o) => [o.id, dt(o.created_at), o.room_number ?? '', ({ pending: '접수 대기', cooking: '조리 중', completed: '완료', rejected: '거절' } as Record<string, string>)[o.status ?? 'pending'], o.payment_method === 'checkout' ? '객실 합산' : '카드', o.guest_name ?? '', itemSummary(o), o.total_amount ?? 0, o.request_note ?? '', o.allergy_note ?? '', o.settled_at ? '완료' : '', o.settle_method ? ({ room: 'WINGS', card: '카드', cash: '현금' } as const)[o.settle_method] : '', o.settle_staff ?? '']));

  const exportRanking = () =>
    downloadCsv(`룸서비스_메뉴순위_${range.from}_${range.to}.csv`,
      ['순위', '메뉴', '구분', '카테고리', '단품 수량', '세트로 선택', '총 수량', '매출', '매출 비중(%)', '주문 건수'],
      ranking.map((r, i) => [i + 1, r.name, r.kind === 'set' ? '세트' : '단품', catLabel(r.category), r.soloQty, r.inSetQty, r.soloQty + r.inSetQty, r.revenue, s.revenue ? ((r.revenue / s.revenue) * 100).toFixed(1) : 0, r.orders]));

  return (
    <div className="sales">
      <div className="filters">
        <div className="seg seg--light" role="group" aria-label="기간">
          {PRESETS.map(([k, l]) => <button type="button" key={k} className={preset === k ? 'is-on is-open' : ''} aria-pressed={preset === k} onClick={() => pick(k)}>{l}</button>)}
        </div>
        {preset === 'custom' && (
          <div className="slot">
            <input className="inp inp--date" type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="시작일" />
            <span>~</span>
            <input className="inp inp--date" type="date" value={range.to} min={range.from} max={kstYmd(new Date())} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="종료일" />
          </div>
        )}
        <span className="meta">{range.from === range.to ? range.from : `${range.from} ~ ${range.to}`}{loading ? ' · 불러오는 중…' : ''}</span>
        <span className="grow" />
        <button type="button" className="btn-outline btn-sm" onClick={exportOrders} disabled={!orders.length}>주문 내역 엑셀</button>
      </div>

      <section className="tiles">
        <div className="tile tile--main"><span>매출</span><strong>{won(s.revenue)}원</strong><small>완료된 주문 기준</small></div>
        <div className="tile"><span>완료 주문</span><strong>{s.completed.length}건</strong><small>객단가 {won(s.avg)}원</small></div>
        <div className="tile"><span>객실 합산</span><strong>{won(s.roomRevenue)}원</strong><small>카드 {won(s.cardRevenue)}원</small></div>
        <div className="tile"><span>거절</span><strong>{s.rejected.length}건</strong><small>{s.inProgress.length ? `진행 중 ${s.inProgress.length}건은 매출에서 빠져요` : '진행 중인 주문 없음'}</small></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>메뉴별 판매 순위</h2>
          <button type="button" className="btn-outline btn-sm" onClick={exportRanking} disabled={!ranking.length}>순위 엑셀</button>
        </div>
        <div className="rank-filters">
          <div className="seg seg--light" role="group" aria-label="정렬">
            <button type="button" className={sort === 'revenue' ? 'is-on is-open' : ''} aria-pressed={sort === 'revenue'} onClick={() => setSort('revenue')}>매출순</button>
            <button type="button" className={sort === 'qty' ? 'is-on is-open' : ''} aria-pressed={sort === 'qty'} onClick={() => setSort('qty')}>수량순</button>
          </div>
          <div className="seg seg--light" role="group" aria-label="구분">
            {([['all', '전체'], ['menu', '단품'], ['set', '세트']] as [Kind, string][]).map(([k, l]) => <button type="button" key={k} className={kind === k ? 'is-on is-open' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
          </div>
          <select className="inp inp--sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="카테고리">
            <option value="ALL">모든 카테고리</option>
            {rankCats.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
          </select>
        </div>
        {ranking.length === 0 ? (
          <p className="meta pad">이 기간에 완료된 주문이 없어요</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>순위</th><th>메뉴</th><th className="num">단품</th><th className="num" title="세트 구성으로 골라진 수량">세트로</th><th className="num">총 수량</th><th className="num">매출</th><th className="bar-col">{sort === 'revenue' ? '매출 비중' : '수량'}</th><th className="num">주문</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => {
                  const v = sort === 'revenue' ? r.revenue : r.soloQty + r.inSetQty;
                  const share = s.revenue ? (r.revenue / s.revenue) * 100 : 0;
                  return (
                    <tr key={r.key}>
                      <td className={`rank${i < 3 ? ' rank--top' : ''}`}>{i + 1}</td>
                      <td>
                        <div className="rname">{r.name}</div>
                        <div className="meta">{r.kind === 'set' ? '세트' : catLabel(r.category)}</div>
                      </td>
                      <td className="num">{r.soloQty || '–'}</td>
                      <td className="num">{r.inSetQty || '–'}</td>
                      <td className="num strong">{r.soloQty + r.inSetQty}</td>
                      <td className="num">{r.revenue ? `${won(r.revenue)}원` : '–'}</td>
                      <td className="bar-col">
                        <span className="hbar" title={sort === 'revenue' ? `${share.toFixed(1)}%` : `${v}개`}>
                          <span className="hbar-fill" style={{ width: `${(v / rankMax) * 100}%` }} />
                        </span>
                        <span className="meta hbar-val">{sort === 'revenue' ? `${share.toFixed(1)}%` : `${v}개`}</span>
                      </td>
                      <td className="num">{r.orders}건</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="f-hint">단품: 그 메뉴를 따로 주문한 수량 · 세트로: 세트 구성에서 골라진 수량 · 메뉴 매출은 단품 매출만 넣었어요 (세트 매출은 세트 줄에 있어요)</p>
          </div>
        )}
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>시간대별 주문</h2>
          <p className="meta">완료된 주문 수 · 막대에 마우스를 올리면 매출도 보여요</p>
          <ColumnChart
            label="시간대별 주문 수"
            data={s.byHour.map((h) => ({ key: String(h.hour), label: `${h.hour}시` }))}
            valueOf={(i) => s.byHour[i].orders}
            format={(v) => `${Math.round(v)}`}
            tooltip={(i) => `${s.byHour[i].hour}시 · ${s.byHour[i].orders}건 · ${won(s.byHour[i].revenue)}원`}
          />
        </section>
        {multiDay && (
          <section className="panel">
            <h2>일별 매출</h2>
            <p className="meta">완료된 주문 기준</p>
            <ColumnChart
              label="일별 매출"
              data={s.byDay.map((d) => ({ key: d.day, label: d.day.slice(5).replace('-', '/') }))}
              valueOf={(i) => s.byDay[i].revenue}
              format={compactWon}
              tooltip={(i) => `${s.byDay[i].day} · ${s.byDay[i].orders}건 · ${won(s.byDay[i].revenue)}원`}
            />
          </section>
        )}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>객실 합산 정산표</h2>
          <label className="check-inline"><input type="checkbox" checked={onlyUnsettled} onChange={(e) => setOnlyUnsettled(e.target.checked)} /> 정산 안 된 것만</label>
        </div>
        <p className="meta">프런트 화면(…/front/)에서 처리하면 여기도 자동으로 '정산 완료'가 돼요. 급할 땐 여기서 직접 눌러도 돼요.</p>
        {roomGroups.length === 0 ? (
          <p className="meta pad">{onlyUnsettled ? '정산할 객실이 없어요' : '이 기간에 객실 합산 주문이 없어요'}</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>객실</th><th>투숙객</th><th>주문</th><th className="num">금액</th><th>상태</th><th /></tr></thead>
              <tbody>
                {roomGroups.map((g) => (
                  <tr key={g.k} className={g.settled ? 'is-dim' : ''}>
                    <td className="strong">{g.room}호</td>
                    <td>{g.guest || '–'}</td>
                    <td><div className="meta">{g.list.map((o) => `${pad(o.id)} ${dt(o.created_at)}`).join(' · ')}</div></td>
                    <td className="num strong">{won(g.total)}원</td>
                    <td>{g.settled ? <span className="tag">정산 완료{g.list[0].settle_method ? ` · ${({ room: 'WINGS', card: '카드', cash: '현금' } as const)[g.list[0].settle_method]}` : ''}{g.list[0].settle_staff ? ` · ${g.list[0].settle_staff}` : ''}</span> : <span className="tag tag--amber">미정산</span>}</td>
                    <td className="num">
                      {g.settled
                        ? <button type="button" className="link" onClick={() => void settle(g.list, false)}>취소</button>
                        : <button type="button" className="btn-green btn-sm" onClick={() => void settle(g.list, true)}>정산 완료</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {toast.node}
    </div>
  );
}
