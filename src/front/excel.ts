import type { Order } from '../lib/types';
import { itemSummary } from '../admin/sales/aggregate';

/**
 * 대표 보고용 엑셀(.xlsx). 제목·요약·표·합계를 서식까지 넣어서 만들어요.
 * exceljs는 크기가 커서 버튼을 누를 때만 불러와요.
 */
const dt = (iso?: string | null) => {
  if (!iso) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
};
const GREEN = 'FF123828';
const LIGHT = 'FFF2F4F3';

export async function downloadPaidXlsx(day: string, orders: Order[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HOTEL MUSEO · PASTA HOUSE';
  const ws = wb.addWorksheet('후불 결제 보고', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', ySplit: 6 }],
  });

  const cols = [
    { header: '퇴실 결제 시각', key: 'paid', width: 15 },
    { header: '객실', key: 'room', width: 8 },
    { header: '투숙객', key: 'guest', width: 11 },
    { header: '주문번호', key: 'no', width: 10 },
    { header: '주문 시각', key: 'at', width: 14 },
    { header: '메뉴', key: 'menu', width: 42 },
    { header: '금액(원)', key: 'amt', width: 12 },
    { header: '고객 후불 동의', key: 'consent', width: 15 },
    { header: 'WINGS 입력', key: 'wings', width: 14 },
    { header: '객실 반영 확인', key: 'conf', width: 13 },
    { header: '퇴실 결제 담당', key: 'payer', width: 13 },
    { header: '특이사항', key: 'note', width: 26 },
  ];
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));
  const last = String.fromCharCode(64 + cols.length); // L

  const sorted = [...orders].sort((a, b) => (a.checkout_paid_at ?? '').localeCompare(b.checkout_paid_at ?? '') || a.id - b.id);
  const total = sorted.reduce((a, o) => a + (o.total_amount ?? 0), 0);
  const rooms = new Set(sorted.map((o) => `${o.room_number}|${o.guest_name}`)).size;

  // 1~2행: 제목
  ws.mergeCells(`A1:${last}1`);
  ws.getCell('A1').value = '룸서비스 투숙객 후불 결제 보고';
  ws.getCell('A1').font = { size: 16, bold: true, color: { argb: GREEN } };
  ws.getRow(1).height = 28;
  ws.mergeCells(`A2:${last}2`);
  ws.getCell('A2').value = `${day} 퇴실 결제 완료 내역 · HOTEL MUSEO / PASTA HOUSE · 출력 ${dt(new Date().toISOString())}`;
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF666666' } };

  // 4행: 요약
  const sum: [string, string | number, string][] = [['A4', '객실', 'B4'], ['C4', '주문', 'D4'], ['E4', '결제 합계', 'F4']];
  const sumVals = [`${rooms}실`, `${sorted.length}건`, total];
  sum.forEach(([lc, label, vc], i) => {
    ws.getCell(lc).value = label;
    ws.getCell(lc).font = { size: 10, color: { argb: 'FF666666' } };
    ws.getCell(lc).alignment = { horizontal: 'right' };
    const v = ws.getCell(vc);
    v.value = sumVals[i];
    v.font = { size: 13, bold: true };
    v.alignment = { horizontal: 'left' };
    if (typeof sumVals[i] === 'number') v.numFmt = '#,##0"원"';
  });
  ws.getRow(4).height = 22;

  // 6행: 머리글
  const head = ws.getRow(6);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  head.height = 24;

  const thin = { style: 'thin' as const, color: { argb: 'FFD9DDDB' } };
  sorted.forEach((o, i) => {
    const r = ws.addRow({
      paid: dt(o.checkout_paid_at),
      room: o.room_number ? `${o.room_number}호` : '',
      guest: o.guest_name ?? '',
      no: `#${String(o.id).padStart(4, '0')}`,
      at: dt(o.created_at),
      menu: itemSummary(o),
      amt: o.total_amount ?? 0,
      consent: o.checkout_consent_at ? `✓ ${dt(o.checkout_consent_at)}` : '기록 없음',
      wings: dt(o.wings_posted_at),
      conf: o.settle_staff ?? '',
      payer: o.checkout_staff ?? '',
      note: [o.settle_note, o.checkout_note].filter(Boolean).join(' / '),
    });
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      cell.font = { size: 10 };
      cell.alignment = { vertical: 'middle', wrapText: col === 6 || col === 12, horizontal: [1, 2, 4, 5, 8, 9, 10, 11].includes(col) ? 'center' : col === 7 ? 'right' : 'left' };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFA' } };
    });
    r.height = 22;
    r.getCell('amt').numFmt = '#,##0';
    if (!o.checkout_consent_at) r.getCell('consent').font = { size: 10, color: { argb: 'FFB45309' } };
  });

  // 합계 행
  const t = ws.addRow({ paid: '합계', menu: `${rooms}실 · ${sorted.length}건`, amt: total });
  for (let c = 1; c <= cols.length; c++) t.getCell(c).value ??= '';
  t.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    cell.border = { top: { style: 'medium', color: { argb: GREEN } }, bottom: thin };
    cell.alignment = { vertical: 'middle' };
  });
  t.getCell('amt').numFmt = '#,##0';
  t.getCell('amt').alignment = { horizontal: 'right', vertical: 'middle' };
  t.height = 22;

  // 결재란
  const sr = t.number + 2;
  ['보고', '확인', '대표'].forEach((label, i) => {
    const col = 10 + i; // J, K, L
    const h = ws.getCell(sr, col);
    h.value = label;
    h.alignment = { horizontal: 'center' };
    h.font = { size: 10, bold: true };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    h.border = { top: thin, left: thin, right: thin, bottom: thin };
    const b = ws.getCell(sr + 1, col);
    b.border = { top: thin, left: thin, right: thin, bottom: thin };
  });
  ws.getRow(sr + 1).height = 44;

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `룸서비스_후불결제보고_${day}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
