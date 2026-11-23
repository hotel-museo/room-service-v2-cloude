import { won } from '../../lib/menu';
import type { Order } from '../../lib/types';
import { checkoutPayLabel } from '../../lib/types';

/**
 * 대표님께 카톡으로 보낼 "룸서비스 일일 보고" 이미지 (캔버스로 직접 그림).
 * 내용: 보고 담당자, 룸서비스 건수, 총매출, 투숙객 후불·카드 결제 건수와 금액, 거절한 객실과 사유, 주문마다 시간·객실·성함·결제방법·금액·메뉴.
 */
const W = 1080;
const PAD = 64;
const FONT = "'Noto Sans KR', 'Malgun Gothic', sans-serif";
const C = { green: '#123828', ink: '#16181a', sub: '#5f6662', line: '#e3e6e4', soft: '#f3f5f4', terra: '#b4532a' };

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const dayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const w = '일월화수목금토'[d.getUTCDay()];
  const [y, m, dd] = ymd.split('-');
  return `${y}년 ${Number(m)}월 ${Number(dd)}일 (${w})`;
};
const menuText = (o: Order) => (o.order_items ?? []).map((it) => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ');

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    const t = line + ch;
    if (ctx.measureText(t).width > maxW && line) { out.push(line.trimEnd()); line = ch.trimStart(); }
    else line = t;
  }
  if (line) out.push(line);
  return out;
}

export async function renderDailyReport(ymd: string, orders: Order[], rejected: Order[] = [], reporter = ''): Promise<Blob> {
  await Promise.all([document.fonts.load(`400 28px 'Noto Sans KR'`), document.fonts.load(`700 28px 'Noto Sans KR'`), document.fonts.load(`900 28px 'Noto Sans KR'`)]).catch(() => undefined);
  const list = [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const total = list.reduce((a, o) => a + (o.total_amount ?? 0), 0);

  // 높이 계산용으로 먼저 줄바꿈
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `400 28px ${FONT}`;
  const menuW = W - PAD * 2 - 48;
  const rows = list.map((o) => ({ o, lines: wrap(probe, menuText(o), menuW) }));
  const rowH = (n: number) => 32 + 44 + n * 40 + 30;
  const listH = rows.reduce((a, r) => a + rowH(r.lines.length), 0) || 140;
  // 거절한 주문 (사유 포함)
  const rej = [...rejected].sort((a, b) => a.created_at.localeCompare(b.created_at));
  probe.font = `500 26px ${FONT}`;
  const rejRows = rej.map((o) => ({ o, lines: wrap(probe, `사유: ${o.rejection_reason?.trim() || '기재 없음'}`, menuW) }));
  const rejH = rej.length ? 110 + rejRows.reduce((a, r) => a + 32 + 44 + r.lines.length * 38 + 26, 0) : 0;
  const H = 640 + 160 + listH + 220 + rejH;

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 머리
  ctx.fillStyle = C.green;
  ctx.fillRect(0, 0, W, 200);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('HOTEL MUSEO · PASTA HOUSE', PAD, 76);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 46px ${FONT}`;
  ctx.fillText('룸서비스 일일 보고', PAD, 140);
  ctx.font = `500 26px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(dayLabel(ymd), W - PAD, 140);
  if (reporter.trim()) {
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`보고 담당  ${reporter.trim()}`, W - PAD, 76);
  }
  ctx.textAlign = 'left';

  // 요약
  let y = 240;
  const half = (W - PAD * 2 - 24) / 2;
  const box = (x: number, label: string, value: string) => {
    ctx.fillStyle = C.soft;
    ctx.beginPath();
    ctx.roundRect(x, y, half, 190, 24);
    ctx.fill();
    ctx.fillStyle = C.sub;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(label, x + 36, y + 62);
    ctx.fillStyle = C.ink;
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText(value, x + 36, y + 150);
  };
  box(PAD, '룸서비스 총 매출', `${won(total)}원`);
  box(PAD + half + 24, '룸서비스', `${list.length}건`);
  y += 190 + 24;

  // 결제 방법별: 투숙객 후불 / 카드 결제
  const checkout = list.filter((o) => o.payment_method === 'checkout');
  const card = list.filter((o) => o.payment_method !== 'checkout');
  const sumOf = (l: Order[]) => l.reduce((a, o) => a + (o.total_amount ?? 0), 0);
  const payBox = (x: number, label: string, l: Order[], color: string, bg: string) => {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x, y, half, 120, 24);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(label, x + 36, y + 50);
    ctx.fillStyle = C.ink;
    ctx.font = `900 44px ${FONT}`;
    const cnt = `${l.length}건`;
    ctx.fillText(cnt, x + 36, y + 100);
    const cw = ctx.measureText(cnt).width;
    ctx.fillStyle = C.sub;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(`${won(sumOf(l))}원`, x + 36 + cw + 18, y + 98);
  };
  payBox(PAD, '투숙객 후불', checkout, C.green, '#e8f0eb');
  payBox(PAD + half + 24, '카드 결제', card, C.terra, '#f6ebe5');
  y += 120 + 70;

  // 주문 목록
  ctx.fillStyle = C.ink;
  ctx.font = `900 30px ${FONT}`;
  ctx.fillText('주문 내역', PAD, y);
  y += 30;
  if (!rows.length) {
    ctx.fillStyle = C.sub;
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText('오늘 완료된 룸서비스가 없어요', PAD, y + 80);
    y += 140;
  }
  rows.forEach(({ o, lines }, i) => {
    y += 32;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y - 16);
    ctx.lineTo(W - PAD, y - 16);
    ctx.stroke();
    // 번호
    ctx.fillStyle = C.green;
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText(String(i + 1), PAD, y + 34);
    // 객실 · 성함 · 시간
    const x0 = PAD + 48;
    ctx.fillStyle = C.ink;
    ctx.font = `900 32px ${FONT}`;
    const room = `${o.room_number ?? ''}호`;
    ctx.fillText(room, x0, y + 34);
    let x = x0 + ctx.measureText(room).width + 16;
    ctx.font = `700 28px ${FONT}`;
    const guest = o.guest_name?.trim() || '성함 없음';
    ctx.fillText(guest, x, y + 34);
    x += ctx.measureText(guest).width + 16;
    ctx.fillStyle = C.sub;
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(hm(o.created_at), x, y + 34);
    // 결제방법 칩 + 금액 (오른쪽)
    ctx.textAlign = 'right';
    ctx.fillStyle = C.ink;
    ctx.font = `900 32px ${FONT}`;
    const amt = `${won(o.total_amount ?? 0)}원`;
    ctx.fillText(amt, W - PAD, y + 34);
    const amtW = ctx.measureText(amt).width;
    const paidBy = o.payment_method === 'checkout' ? checkoutPayLabel(o.checkout_pay_method) : '';
    const pay = o.payment_method === 'checkout' ? `투숙객 후불${paidBy ? ` · ${paidBy}` : ''}` : '카드';
    ctx.font = `700 22px ${FONT}`;
    const pw = ctx.measureText(pay).width + 28;
    const px = W - PAD - amtW - 20 - pw;
    ctx.fillStyle = o.payment_method === 'checkout' ? '#e8f0eb' : '#f6ebe5';
    ctx.beginPath();
    ctx.roundRect(px, y + 6, pw, 38, 19);
    ctx.fill();
    ctx.fillStyle = o.payment_method === 'checkout' ? C.green : C.terra;
    ctx.textAlign = 'center';
    ctx.fillText(pay, px + pw / 2, y + 33);
    ctx.textAlign = 'left';
    // 메뉴
    ctx.fillStyle = '#353a37';
    ctx.font = `400 28px ${FONT}`;
    lines.forEach((ln, k) => ctx.fillText(ln, x0, y + 44 + 40 + k * 40));
    y += 44 + lines.length * 40 + 30;
  });

  // 합계 줄
  y += 20;
  ctx.fillStyle = C.green;
  ctx.fillRect(PAD, y, W - PAD * 2, 3);
  ctx.font = `900 32px ${FONT}`;
  ctx.fillStyle = C.ink;
  ctx.fillText(`합계 ${list.length}건`, PAD, y + 56);
  ctx.textAlign = 'right';
  ctx.fillText(`${won(total)}원`, W - PAD, y + 56);
  ctx.textAlign = 'left';

  // 거절한 객실
  if (rej.length) {
    y += 56 + 90;
    ctx.fillStyle = C.ink;
    ctx.font = `900 30px ${FONT}`;
    ctx.fillText('거절한 주문', PAD, y);
    const t = '거절한 주문';
    const tw = ctx.measureText(t).width;
    ctx.fillStyle = '#b3261e';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(`${rej.length}건 · 매출 제외`, PAD + tw + 16, y);
    y += 20;
    rejRows.forEach(({ o, lines }) => {
      y += 32;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PAD, y - 16);
      ctx.lineTo(W - PAD, y - 16);
      ctx.stroke();
      const x0 = PAD + 48;
      ctx.fillStyle = '#b3261e';
      ctx.beginPath();
      ctx.arc(PAD + 12, y + 24, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = `900 32px ${FONT}`;
      const room = `${o.room_number ?? ''}호`;
      ctx.fillText(room, x0, y + 34);
      let x = x0 + ctx.measureText(room).width + 16;
      ctx.font = `700 28px ${FONT}`;
      const guest = o.guest_name?.trim() || '성함 없음';
      ctx.fillText(guest, x, y + 34);
      x += ctx.measureText(guest).width + 16;
      ctx.fillStyle = C.sub;
      ctx.font = `500 24px ${FONT}`;
      ctx.fillText(`${hm(o.created_at)}${o.rejected_at ? ` → ${hm(o.rejected_at)} 거절` : ''}`, x, y + 34);
      // 금액 (청구 안 됨이라 취소선)
      ctx.textAlign = 'right';
      ctx.fillStyle = C.sub;
      ctx.font = `700 28px ${FONT}`;
      const amt = `${won(o.total_amount ?? 0)}원`;
      ctx.fillText(amt, W - PAD, y + 34);
      const aw = ctx.measureText(amt).width;
      ctx.fillRect(W - PAD - aw, y + 24, aw, 2);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7a2a1d';
      ctx.font = `500 26px ${FONT}`;
      lines.forEach((ln, k) => ctx.fillText(ln, x0, y + 44 + 38 + k * 38));
      y += 44 + lines.length * 38 + 26;
    });
    y -= 56;
  }

  // 실제 쓴 높이로 자르기
  const usedH = Math.ceil(y + 100);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = usedH;
  out.getContext('2d')!.drawImage(cv, 0, 0);
  return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/png'));
}
