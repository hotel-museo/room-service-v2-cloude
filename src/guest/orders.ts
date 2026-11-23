import { supabase } from '../lib/supabase';
import type { OrderItem, OrderStatus, PaymentMethod } from '../lib/types';

export interface PlaceOrderInput {
  room: string;
  guestName: string;
  phone: string;
  note: string;
  allergy: string;
  cutlery: number;
  payment: PaymentMethod;
  items: OrderItem[];
  /** 후불일 때 손님이 동의한 문구 (손님 언어 그대로) */
  consentText?: string;
}

export interface TrackedOrder {
  token: string;
  placedAt: string;
  room: string;
  total: number;
  payment: PaymentMethod;
  /** 손님은 자기 주문 내역을 DB에서 읽을 수 없어서, 보낸 내용을 이 기기에 보관합니다. */
  lines: { name: string; detail: string; qty: number; total: number }[];
}

export type PlaceResult = { ok: true; token: string } | { ok: false; reason: 'price' | 'closed' | 'cutoff' | 'name' | 'consent' | 'generic' };

function makeToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceResult> {
  const token = makeToken();
  const total = input.items.reduce((a, i) => a + i.price * i.quantity, 0);
  const { error } = await supabase.from('orders').insert({
    room_number: input.room.trim(),
    guest_name: input.payment === 'checkout' ? input.guestName.trim() : '',
    phone: input.phone.trim(),
    status: 'pending',
    total_amount: total,
    request_note: input.note.trim(),
    allergy_note: input.allergy.trim() || null,
    disposable_cutlery_qty: input.cutlery,
    order_items: input.items,
    ordered_at: new Date().toISOString(),
    payment_method: input.payment,
    order_token: token,
    checkout_consent_at: input.payment === 'checkout' ? new Date().toISOString() : null,
    checkout_consent_text: input.payment === 'checkout' ? input.consentText ?? null : null,
  });
  if (error) {
    const msg = `${error.message} ${error.details ?? ''}`;
    if (/ORDER_CLOSED/.test(msg)) return { ok: false, reason: 'closed' };
    if (/GUEST_NAME_REQUIRED/.test(msg)) return { ok: false, reason: 'name' };
    if (/CHECKOUT_CONSENT_REQUIRED/.test(msg)) return { ok: false, reason: 'consent' };
    if (/ITEM_CUT_OFF/.test(msg)) return { ok: false, reason: 'cutoff' };
    if (/PRICE_CHANGED|MENU_NOT_AVAILABLE|TOTAL_MISMATCH|SET_|INVALID_OPTIONS/.test(msg)) return { ok: false, reason: 'price' };
    return { ok: false, reason: 'generic' };
  }
  return { ok: true, token };
}

export interface OrderStatusRow {
  id: number;
  status: OrderStatus | null;
  accepted_at: string | null;
  completed_at: string | null;
  estimated_minutes: number | null;
  rejection_reason: string | null;
}

export async function fetchOrderStatus(token: string): Promise<OrderStatusRow | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, accepted_at, completed_at, estimated_minutes, rejection_reason')
    .eq('order_token', token)
    .maybeSingle();
  if (error) return null;
  return data as OrderStatusRow | null;
}

const TRACK_KEY = 'ph-tracked-order-v1';

export function loadTracked(): TrackedOrder | null {
  try {
    const raw = localStorage.getItem(TRACK_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TrackedOrder;
    // 하루가 지난 주문은 추적하지 않습니다
    if (Date.now() - new Date(t.placedAt).getTime() > 24 * 3600_000) return null;
    return t;
  } catch {
    return null;
  }
}

export function saveTracked(t: TrackedOrder | null) {
  try {
    if (t) localStorage.setItem(TRACK_KEY, JSON.stringify(t));
    else localStorage.removeItem(TRACK_KEY);
  } catch {
    /* 무시 */
  }
}
