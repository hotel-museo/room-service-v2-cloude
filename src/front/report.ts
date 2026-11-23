import { won } from '../lib/menu';
import type { Order } from '../lib/types';
import { itemSummary } from '../admin/sales/aggregate';

/**
 * 대표님 보고용: 퇴실 결제 완료 내역 (하루 단위).
 * - 엑셀(CSV): 주문 한 건이 한 줄
 * - 보고서 인쇄: A4 한 장, 객실별 합계 + 서명란 (인쇄 창에서 "PDF로 저장"도 가능)
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
const pad = (n: number) => '#' + String(n).padStart(4, '0');

interface Group { room: string; guest: string; list: Order[]; total: number }

export function printPaidReport(day: string, groups: Group[]): boolean {
  const total = groups.reduce((a, g) => a + g.total, 0);
  const count = groups.reduce((a, g) => a + g.list.length, 0);
  const staff = [...new Set(groups.flatMap((g) => g.list.map((o) => o.checkout_staff).filter(Boolean)))].join(', ');
  const body = groups
    .map((g) => {
      const o0 = g.list[0];
      const orders = g.list
        .map((o) => `<div class="o"><span>${pad(o.id)} · ${dt(o.created_at)}</span><span>${esc(itemSummary(o))}</span><span class="r">${won(o.total_amount ?? 0)}</span></div>
          <div class="cs">${o.checkout_consent_at ? `✓ 고객 후불 동의 ${dt(o.checkout_consent_at)}` : '후불 동의 기록 없음'}</div>`)
        .join('');
      const notes = [...new Set(g.list.flatMap((o) => [o.settle_note, o.checkout_note]).filter(Boolean))].join(' / ');
      return `<tr>
        <td class="room">${esc(g.room)}호</td>
        <td>${esc(g.guest || '–')}</td>
        <td>${orders}${notes ? `<div class="note">특이사항: ${esc(notes)}</div>` : ''}</td>
        <td class="r b">${won(g.total)}</td>
        <td class="c">${dt(o0.checkout_paid_at)}<br><span class="m">${esc(o0.checkout_staff ?? '')}</span></td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>룸서비스 후불 결제 보고 ${day}</title>
<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; color: #111; font-size: 11.5pt; margin: 0; }
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #123828; padding-bottom: 10px; }
h1 { font-size: 17pt; margin: 0; }
.sub { color: #555; font-size: 10pt; margin-top: 4px; }
.brand { text-align: right; font-size: 9pt; letter-spacing: .2em; color: #123828; font-weight: 700; }
.sum { display: flex; gap: 24px; margin: 14px 0; }
.sum div { border: 1px solid #ddd; border-radius: 6px; padding: 8px 14px; }
.sum span { display: block; font-size: 9pt; color: #555; }
.sum strong { font-size: 14pt; }
table { width: 100%; border-collapse: collapse; }
th { background: #f2f4f3; font-size: 9.5pt; text-align: left; padding: 7px 8px; border-bottom: 1px solid #bbb; }
td { padding: 8px; border-bottom: 1px solid #e3e3e3; vertical-align: top; font-size: 10.5pt; }
.room { font-weight: 700; white-space: nowrap; }
.o { display: grid; grid-template-columns: 120px 1fr 70px; gap: 6px; }
.cs { font-size: 8.5pt; color: #2a6a46; margin: 1px 0 4px; }
.note { font-size: 9pt; color: #7a4b00; margin-top: 4px; }
.r { text-align: right; white-space: nowrap; }
.c { white-space: nowrap; font-size: 9.5pt; }
.b { font-weight: 700; }
.m { color: #555; }
tfoot td { font-weight: 700; border-top: 2px solid #123828; border-bottom: 0; }
.sign { display: flex; justify-content: flex-end; gap: 0; margin-top: 28px; }
.sign div { width: 120px; border: 1px solid #999; text-align: center; }
.sign div + div { border-left: 0; }
.sign span { display: block; font-size: 9pt; padding: 4px; border-bottom: 1px solid #999; background: #f7f7f7; }
.sign i { display: block; height: 56px; }
.empty { padding: 40px; text-align: center; color: #777; }
</style></head><body>
<div class="head">
  <div><h1>룸서비스 투숙객 후불 결제 보고</h1><div class="sub">${esc(day)} 퇴실 결제 완료 내역${staff ? ` · 결제 담당 ${esc(staff)}` : ''}</div></div>
  <div class="brand">HOTEL MUSEO<br>PASTA HOUSE</div>
</div>
<div class="sum">
  <div><span>객실</span><strong>${groups.length}실</strong></div>
  <div><span>주문</span><strong>${count}건</strong></div>
  <div><span>결제 금액 합계</span><strong>${won(total)}원</strong></div>
</div>
${groups.length ? `<table>
  <thead><tr><th>객실</th><th>투숙객</th><th>주문 내역 · 고객 동의</th><th class="r">금액(원)</th><th>결제 시각 · 담당</th></tr></thead>
  <tbody>${body}</tbody>
  <tfoot><tr><td colspan="3">합계</td><td class="r">${won(total)}</td><td></td></tr></tfoot>
</table>` : '<div class="empty">이 날 퇴실 결제한 내역이 없어요</div>'}
<div class="sign"><div><span>보고</span><i></i></div><div><span>확인</span><i></i></div><div><span>대표</span><i></i></div></div>
<script>window.onload = () => window.print();</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
