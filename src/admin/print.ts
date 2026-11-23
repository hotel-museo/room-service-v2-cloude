import { won } from '../lib/menu';
import { escapeHtml, kstTime } from '../lib/format';
import type { Order } from '../lib/types';


/**
 * 주방 영수증 (80mm 감열지 기준).
 * 지금은 브라우저 인쇄 창을 띄웁니다. 매장 PC 크롬을 키오스크 인쇄 모드로 켜면 창 없이 바로 출력돼요.
 * 메뉴명은 손님 언어와 상관없이 항상 한국어로 찍힙니다.
 */
export function printTicket(o: Order) {
  const items = (o.order_items ?? [])
    .map((it) => {
      const sub = it.is_set ? (it.set_components ?? []).flatMap((c) => c.items.map((i) => i.name)) : [];
      const opts = (it.options ?? []).map((op) => op.name);
      return `<div class="it"><b>${it.quantity}×</b> ${escapeHtml(it.name)}</div>${sub.map((n) => `<div class="sub">- ${escapeHtml(n)}</div>`).join('')}${opts.map((n) => `<div class="sub opt">+ ${escapeHtml(n)}</div>`).join('')}`;
    })
    .join('');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>주방 영수증 ${o.id}</title>
<style>
@page { size: 80mm auto; margin: 4mm; }
body { font-family: 'Noto Sans KR', sans-serif; width: 72mm; margin: 0; color: #000; }
.room { font-size: 34px; font-weight: 900; text-align: center; margin: 4px 0; }
.meta { font-size: 13px; text-align: center; }
hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
.it { font-size: 18px; font-weight: 700; margin: 6px 0 2px; }
.sub { font-size: 14px; margin-left: 18px; }
.opt { font-weight: 700; }
.note { background: #000; color: #fff; padding: 6px 8px; font-size: 16px; font-weight: 700; margin: 8px 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.row { display: flex; justify-content: space-between; font-size: 14px; }
</style></head><body>
<div class="meta">PASTA HOUSE 룸서비스</div>
<div class="room">${escapeHtml(o.room_number ?? '')}호</div>
<div class="meta">주문 #${String(o.id).padStart(4, '0')} · 주문 ${kstTime(o.created_at)} · 접수 ${kstTime(o.accepted_at ?? new Date().toISOString())}</div>
<div class="meta"><b>약속 ${o.estimated_minutes ?? ''}분</b></div>
<hr>${items}<hr>
${o.allergy_note ? `<div class="note">⚠ 알레르기: ${escapeHtml(o.allergy_note)}</div>` : ''}
${o.request_note ? `<div class="note">요청: ${escapeHtml(o.request_note)}</div>` : ''}
<div class="row"><span>일회용 수저</span><span>${o.disposable_cutlery_qty ?? 0}개</span></div>
<div class="row"><span>${o.payment_method === 'checkout' ? '객실 합산' : '카드 결제'}${o.guest_name ? ` (${escapeHtml(o.guest_name)})` : ''}</span><span>${won(o.total_amount ?? 0)}원</span></div>
<script>window.onload=function(){window.print();setTimeout(function(){window.close();},300);};</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) {
    alert('팝업이 막혀 있어서 인쇄하지 못했어요. 브라우저 주소창 오른쪽에서 팝업을 허용해 주세요.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
