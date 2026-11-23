import { checkoutPayLabel } from '../../lib/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { won } from '../../lib/menu';
import { supabase } from '../../lib/supabase';
import type { CategoryLabels, Menu, Order, SetMenu } from '../../lib/types';
import { useToast } from '../menu/ui';
import { addDays, downloadCsv, itemSummary, kstDayStart, kstYmd, presetRange, summarize, type Preset, type RankRow } from './aggregate';
import { ColumnChart, compactWon } from './Charts';
import { renderDailyReport } from './dailyReport';

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
  const [prev, setPrev] = useState<{ revenue: number; count: number } | null>(null);
  const [report, setReport] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [making, setMaking] = useState(false);
  const [sort, setSort] = useState<Sort>('revenue');
  const [kind, setKind] = useState<Kind>('all');
  const [cat, setCat] = useState('ALL');
  const [onlyUnsettled, setOnlyUnsettled] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const from = kstDayStart(range.from).toISOString();
    const to = kstDayStart(addDays(range.to, 1)).toISOString();
    const days = Math.round((kstDayStart(addDays(range.to, 1)).getTime() - kstDayStart(range.from).getTime()) / 864e5);
    const pFrom = kstDayStart(addDays(range.from, -days)).toISOString();
    const [o, m, s, l, p] = await Promise.all([
      supabase.from('orders').select('*').gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }).limit(5000),
      supabase.from('menus').select('*'),
      supabase.from('set_menus').select('*'),
      supabase.from('site_settings').select('settings').eq('key', 'category_translations').maybeSingle(),
      supabase.from('orders').select('total_amount').eq('status', 'completed').gte('created_at', pFrom).lt('created_at', from).limit(5000),
    ]);
    setPrev(p.error ? null : { revenue: (p.data ?? []).reduce((a, r) => a + ((r as { total_amount: number | null }).total_amount ?? 0), 0), count: (p.data ?? []).length });
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
  const stageOf = (o: Order) => (o.checkout_paid_at ? 3 : o.settled_at ? 2 : o.wings_posted_at ? 1 : 0);
  const roomOrders = s.completed.filter((o) => o.payment_method === 'checkout' && (!onlyUnsettled || !o.checkout_paid_at));
  const roomGroups = useMemo(() => {
    const g = new Map<string, Order[]>();
    roomOrders.forEach((o) => {
      const k = `${o.room_number}|${(o.guest_name ?? '').trim()}|${stageOf(o)}`;
      g.set(k, [...(g.get(k) ?? []), o]);
    });
    return [...g.entries()].map(([k, list]) => ({ k, room: list[0].room_number ?? '', guest: list[0].guest_name ?? '', list, total: list.reduce((a, o) => a + (o.total_amount ?? 0), 0), stage: stageOf(list[0]) }))
      .sort((a, b) => a.stage - b.stage || a.room.localeCompare(b.room, 'ko', { numeric: true }));
  }, [roomOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeReport = async () => {
    setMaking(true);
    try {
      const blob = await renderDailyReport(range.from, s.completed, s.rejected);
      setReport({ blob, url: URL.createObjectURL(blob), name: `룸서비스_일일보고_${range.from}.png` });
    } catch {
      toast.show('보고 이미지를 만들지 못했어요', true);
    }
    setMaking(false);
  };
  const closeReport = () => { if (report) URL.revokeObjectURL(report.url); setReport(null); };
  const file = report ? new File([report.blob], report.name, { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const shareReport = async () => {
    if (!file) return;
    try { await navigator.share({ files: [file], title: '룸서비스 일일 보고' }); } catch { /* 취소 */ }
  };
  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': report.blob })]);
      toast.show('복사했어요. 카톡 채팅방에서 Ctrl+V 하세요');
    } catch {
      toast.show('복사가 안 돼요. "이미지 저장"으로 받아서 보내 주세요', true);
    }
  };
  const saveReport = () => {
    if (!report) return;
    const a = document.createElement('a');
    a.href = report.url;
    a.download = report.name;
    a.click();
  };

  const exportOrders = () =>
    downloadCsv(`룸서비스_주문내역_${range.from}_${range.to}.csv`,
      ['주문번호', '주문일시', '객실', '상태', '결제', '투숙객', '메뉴', '금액', '요청사항', '알레르기', '후불 단계', '확인 담당', '결제 담당', '특이사항'],
      orders.map((o) => [o.id, dt(o.created_at), o.room_number ?? '', ({ pending: '접수 대기', cooking: '조리 중', completed: '완료', rejected: '거절' } as Record<string, string>)[o.status ?? 'pending'], o.payment_method === 'checkout' ? `객실 합산${o.checkout_pay_method ? ` → ${checkoutPayLabel(o.checkout_pay_method)}` : ''}` : '카드', o.guest_name ?? '', itemSummary(o), o.total_amount ?? 0, o.request_note ?? '', o.allergy_note ?? '', o.payment_method === 'checkout' ? ['WINGS 입력 전', '프런트 확인 전', '퇴실 결제 대기', '결제 완료'][stageOf(o)] : '', o.settle_staff ?? '', o.checkout_staff ?? '', [o.settle_note, o.checkout_note].filter(Boolean).join(' / ')]));

  const exportRanking = () =>
    downloadCsv(`룸서비스_메뉴순위_${range.from}_${range.to}.csv`,
      ['순위', '메뉴', '구분', '카테고리', '단품 수량', '세트로 선택', '총 수량', '매출', '매출 비중(%)', '주문 건수'],
      ranking.map((r, i) => [i + 1, r.name, r.kind === 'set' ? '세트' : '단품', catLabel(r.category), r.soloQty, r.inSetQty, r.soloQty + r.inSetQty, r.revenue, s.revenue ? ((r.revenue / s.revenue) * 100).toFixed(1) : 0, r.orders]));

  const prevLabel = preset === 'today' ? '어제' : preset === 'yesterday' ? '그저께' : preset === 'week' ? '그 전 7일' : preset === 'month' || preset === 'lastMonth' ? '그 전 기간' : '그 전 같은 기간';
  const delta = (now: number, before: number | undefined) => {
    if (before === undefined) return null;
    if (before === 0) return now === 0 ? `${prevLabel} 대비 변화 없음` : `${prevLabel}에는 없었어요`;
    const pct = Math.round(((now - before) / before) * 100);
    return pct === 0 ? `${prevLabel} 대비 변화 없음` : `${prevLabel} 대비 ${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
  };
  const hasHourly = s.byHour.some((h) => h.orders > 0);
  const hasDaily = s.byDay.some((d) => d.revenue > 0);

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
        <button type="button" className="btn-green btn-sm" disabled={range.from !== range.to || making} title={range.from !== range.to ? '하루를 골라 주세요' : ''} onClick={() => void makeReport()}>{making ? '만드는 중…' : '보고용 이미지'}</button>
      </div>

      <section className="tiles">
        <div className="tile tile--main"><span>매출</span><strong>{won(s.revenue)}원</strong><small>{delta(s.revenue, prev?.revenue) ?? '완료된 주문 기준'}</small></div>
        <div className="tile"><span>완료 주문</span><strong>{s.completed.length}건</strong><small>객단가 {won(s.avg)}원{prev ? ` · ${delta(s.completed.length, prev.count)}` : ''}</small></div>
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
          {!hasHourly ? <div className="chart-empty">이 기간에 완료된 주문이 없어요</div> : <ColumnChart
            label="시간대별 주문 수"
            data={s.byHour.map((h) => ({ key: String(h.hour), label: `${h.hour}시` }))}
            valueOf={(i) => s.byHour[i].orders}
            format={(v) => `${Math.round(v)}`}
            tooltip={(i) => `${s.byHour[i].hour}시 · ${s.byHour[i].orders}건 · ${won(s.byHour[i].revenue)}원`}
          />}
        </section>
        {multiDay && (
          <section className="panel">
            <h2>일별 매출</h2>
            <p className="meta">완료된 주문 기준</p>
            {!hasDaily ? <div className="chart-empty">이 기간에 매출이 없어요</div> : <ColumnChart
              label="일별 매출"
              data={s.byDay.map((d) => ({ key: d.day, label: d.day.slice(5).replace('-', '/') }))}
              valueOf={(i) => s.byDay[i].revenue}
              format={compactWon}
              tooltip={(i) => `${s.byDay[i].day} · ${s.byDay[i].orders}건 · ${won(s.byDay[i].revenue)}원`}
            />}
          </section>
        )}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>투숙객 후불 진행 현황</h2>
          <label className="check-inline"><input type="checkbox" checked={onlyUnsettled} onChange={(e) => setOnlyUnsettled(e.target.checked)} /> 퇴실 결제 끝난 건 숨기기</label>
        </div>
        <p className="meta">보테가 WINGS 입력 → 프런트 객실 반영 확인 → 프런트 퇴실 결제 완료 순서로 진행돼요. WINGS 입력은 주문판 오른쪽 'WINGS 입력 대기'에서 해요.</p>
        {roomGroups.length === 0 ? (
          <p className="meta pad">{onlyUnsettled ? '진행 중인 투숙객 후불 주문이 없어요' : '이 기간에 투숙객 후불 주문이 없어요'}</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>객실</th><th>투숙객</th><th>주문</th><th className="num">금액</th><th>단계</th><th>결제 방법 · 담당</th></tr></thead>
              <tbody>
                {roomGroups.map((g) => {
                  const o = g.list[0];
                  return (
                    <tr key={g.k} className={g.stage === 3 ? 'is-dim' : ''}>
                      <td className="strong">{g.room}호</td>
                      <td>{g.guest || '–'}</td>
                      <td><div className="meta">{g.list.map((x) => `${pad(x.id)} ${dt(x.created_at)}`).join(' · ')}</div></td>
                      <td className="num strong">{won(g.total)}원</td>
                      <td>{[<span key={0} className="tag tag--red">WINGS 입력 전</span>, <span key={1} className="tag tag--amber">프런트 확인 전</span>, <span key={2} className="tag tag--amber">퇴실 결제 대기</span>, <span key={3} className="tag">결제 완료</span>][g.stage]}</td>
                      <td className="meta">{g.stage === 3 && o.checkout_pay_method ? <b className="dim">{checkoutPayLabel(o.checkout_pay_method)} · </b> : null}{g.stage === 3 ? o.checkout_staff : g.stage === 2 ? o.settle_staff : ''}{(g.stage === 3 ? o.checkout_note : o.settle_note) ? ` · ${g.stage === 3 ? o.checkout_note : o.settle_note}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {report && (
        <div className="modal-layer">
          <button type="button" className="modal-backdrop" aria-label="닫기" onClick={closeReport} />
          <div className="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="rep-t">
            <h2 id="rep-t">보고용 이미지</h2>
            <p className="meta">완료된 주문 기준이에요. 아래 방법 중 하나로 카톡에 보내 주세요.</p>
            <div className="report-preview"><img src={report.url} alt="룸서비스 일일 보고 이미지" /></div>
            <div className="report-btns">
              {canShare && <button type="button" className="btn-green" onClick={() => void shareReport()}>카톡으로 공유</button>}
              <button type="button" className={canShare ? 'btn-outline' : 'btn-green'} onClick={() => void copyReport()}>이미지 복사 (PC 카톡에 붙여넣기)</button>
              <button type="button" className="btn-outline" onClick={saveReport}>이미지 저장</button>
              <button type="button" className="link" onClick={closeReport}>닫기</button>
            </div>
          </div>
        </div>
      )}
      {toast.node}
    </div>
  );
}
