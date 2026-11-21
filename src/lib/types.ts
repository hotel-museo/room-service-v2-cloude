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
  /** 고급 메뉴 추가금 { menu_id: 원 } */
  extras?: Record<string, number>;
}

export interface OptionItem {
  id: number;
  group_id: number;
  name: string;
  name_en: string | null;
  name_ja: string | null;
  name_zh: string | null;
  price: number;
  sort_order: number;
  is_available: boolean;
}

export interface OptionGroup {
  id: number;
  name: string;
  name_en: string | null;
  name_ja: string | null;
  name_zh: string | null;
  description: string | null;
  description_en: string | null;
  description_ja: string | null;
  description_zh: string | null;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  option_items: OptionItem[];
}

export interface OptionLinks {
  groups: OptionGroup[];
  byMenu: Record<number, number[]>;
  bySet: Record<number, number[]>;
}

/** 주문서에 저장되는 선택 옵션 */
export interface ChosenOption {
  group_id: number;
  item_id: number;
  name: string;
  name_en: string;
  name_ja: string;
  name_zh: string;
  price: number;
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
  /** 옵션·추가금이 포함된 1개 가격 */
  price: number;
  /** 옵션을 빼고 메뉴(세트) 원래 가격 */
  base_price?: number;
  quantity: number;
  subtotal: number;
  options?: ChosenOption[];
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
  allergy_note: string | null;
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
