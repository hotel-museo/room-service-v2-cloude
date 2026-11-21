export type Lang = 'ko' | 'en' | 'ja' | 'zh';

export interface Menu {
  id: number;
  name: string;
  name_en: string | null;
  name_ja: string | null;
  name_zh: string | null;
  description: string | null;
  description_en: string | null;
  description_ja: string | null;
  description_zh: string | null;
  price: number;
  category: string;
  image_url: string | null;
  sort_order: number | null;
  is_available: boolean | null;
  is_hidden: boolean;
  sold_out_until: string | null;
}

export interface SetComponentConfig {
  count?: number;
  quantity?: number;
  category: string;
  menu_ids: number[];
}

export interface SetMenu {
  id: number;
  name: string;
  name_en: string | null;
  name_ja: string | null;
  name_zh: string | null;
  description: string | null;
  description_en: string | null;
  description_ja: string | null;
  description_zh: string | null;
  price: number;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  is_hidden: boolean | null;
  config: { version?: number; components?: SetComponentConfig[] } | null;
}

export type CategoryLabels = Record<string, Partial<Record<Lang, string>>>;

export type ServiceStatus = 'open' | 'busy' | 'preparing' | 'closed' | 'soldout';

export type OrderStatus = 'pending' | 'cooking' | 'completed' | 'rejected';

export type PaymentMethod = 'checkout' | 'card';

/** 주문서(orders.order_items)에 저장되는 한 줄. 기존 사이트와 같은 형식을 유지합니다. */
export interface OrderItem {
  id: number;
  menu_id?: number;
  name: string;
  name_en: string;
  name_ja: string;
  name_zh: string;
  price: number;
  quantity: number;
  subtotal: number;
  is_set: boolean;
  set_menu_id: number | null;
  set_components: SetComponentChoice[] | null;
  set_component_text: string;
}

export interface SetComponentChoice {
  category: string;
  quantity: number;
  items: { id: number; name: string; name_en: string; name_ja: string; name_zh: string }[];
}

export interface Order {
  id: number;
  created_at: string;
  ordered_at: string | null;
  room_number: string | null;
  guest_name: string | null;
  phone: string | null;
  status: OrderStatus | null;
  total_amount: number | null;
  request_note: string | null;
  order_items: OrderItem[] | null;
  accepted_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  estimated_minutes: number | null;
  payment_method: PaymentMethod | null;
  disposable_cutlery_qty: number | null;
  order_token: string | null;
}
