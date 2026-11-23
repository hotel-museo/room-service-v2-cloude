import { won } from '../lib/menu';
import type { Order } from '../lib/types';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const dt = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** 객실별 룸서비스 이용 내역서 (손님께 드리는 용, 80mm 영수증 프린터 / A4 모두 가능) */
export function printFolio(room: string, guest: string, list: Order[]) {
  const total = list.reduce((a, o) => a + (o.total_amount ?? 0), 0);
  const rows = list
    .map((o) => {
      const items = (o.order_items ?? [])
        .map((it) => `<tr><td>${esc(it.name)} × ${it.quantity}</td><td class="r">${won(it.price * it.quantity)}</td></tr>`)
        .join('');
      const consent = o.checkout_consent_at ? `<tr><td colspan="2" class="cs">✓ 고객 후불 동의 ${dt(o.checkout_consent_at)}${o.checkout_consent_text ? `<br>“${esc(o.checkout_consent_text)}”` : ''}</td></tr>` : '';
      return `<tr class="h"><td colspan="2">#${String(o.id).padStart(4, '0')} · ${dt(o.created_at)}</td></tr>${items}${consent}`;
    })
    .join('');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>룸서비스 이용 내역 ${esc(room)}호</title>
<style>
@page { size: 80mm auto; margin: 4mm; }
body { font-family: 'Noto Sans KR', sans-serif; max-width: 72mm; margin: 0; color: #000; font-size: 13px; }
h1 { font-size: 16px; text-align: center; margin: 4px 0; }
.c { text-align: center; }
.room { font-size: 26px; font-weight: 900; text-align: center; margin: 6px 0 2px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
td { padding: 3px 0; vertical-align: top; }
.r { text-align: right; white-space: nowrap; }
tr.h td { padding-top: 8px; font-weight: 700; border-top: 1px dashed #000; }
.tot { display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; border-top: 2px solid #000; margin-top: 10px; padding-top: 6px; }
.cs { font-size: 11px; padding-top: 4px; line-height: 1.4; }
.foot { margin-top: 14px; font-size: 11px; text-align: center; }
</style></head><body>
<h1>HOTEL MUSEO · PASTA HOUSE</h1>
<div class="c">룸서비스 이용 내역</div>
<div class="room">${esc(room)}호</div>
<div class="c">${esc(guest || '')}</div>
<table>${rows}</table>
<div class="tot"><span>합계</span><span>${won(total)}원</span></div>
<div class="foot">출력 ${dt(new Date().toISOString())}</div>
<script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
