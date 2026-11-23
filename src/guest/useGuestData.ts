import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_HOURS, type BusinessHours } from '../lib/hours';
import { EMPTY_LINKS, loadOptionLinks } from '../lib/options';
import { isPreview, onPreviewChange } from '../lib/preview';
import type { CategoryLabels, Menu, OptionLinks, ServiceStatus, SetMenu } from '../lib/types';

export interface GuestData {
  menus: Menu[];
  sets: SetMenu[];
  labels: CategoryLabels;
  service: ServiceStatus;
  options: OptionLinks;
  hours: BusinessHours;
  catOrder: string[];
  /** 주문 받는 객실 번호 (비어 있으면 모두 받음) */
  rooms: string[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

// 관리자 미리보기는 더 자주 새로 불러와요 (바꾼 즉시 알림도 받아요)
const REFRESH_MS = isPreview ? 15_000 : 60_000;

export function useGuestData(): GuestData {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [sets, setSets] = useState<SetMenu[]>([]);
  const [labels, setLabels] = useState<CategoryLabels>({});
  const [service, setService] = useState<ServiceStatus>('open');
  const [options, setOptions] = useState<OptionLinks>(EMPTY_LINKS);
  const [hours, setHours] = useState<BusinessHours>(DEFAULT_HOURS);
  const [catOrder, setCatOrder] = useState<string[]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [m, s, l, st, op, bh, co, rl] = await Promise.all([
      supabase.from('menus').select('*').order('sort_order', { ascending: true }),
      supabase.from('set_menus').select('*').order('sort_order', { ascending: true }),
      supabase.from('site_settings').select('settings').eq('key', 'category_translations').maybeSingle(),
      supabase.from('service_status').select('status').eq('id', 1).maybeSingle(),
      loadOptionLinks(),
      supabase.from('site_settings').select('settings').eq('key', 'business_hours').maybeSingle(),
      supabase.from('site_settings').select('settings').eq('key', 'category_order').maybeSingle(),
      supabase.from('site_settings').select('settings').eq('key', 'room_list').maybeSingle(),
    ]);
    setRooms(((rl.data?.settings as { rooms?: string[] } | undefined)?.rooms) ?? []);
    setCatOrder(((co.data?.settings as { order?: string[] } | undefined)?.order) ?? []);
    if (bh.data?.settings) setHours({ ...DEFAULT_HOURS, ...(bh.data.settings as BusinessHours) });
    setOptions(op);
    if (m.error || s.error) {
      setError((m.error || s.error)!.message);
    } else {
      setMenus((m.data ?? []) as Menu[]);
      setSets((s.data ?? []) as SetMenu[]);
      setError(null);
    }
    if (l.data?.settings) setLabels(l.data.settings as CategoryLabels);
    if (st.data?.status) setService(st.data.status as ServiceStatus);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), REFRESH_MS);
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    const off = isPreview ? onPreviewChange(() => void reload()) : () => undefined;
    return () => {
      off();
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload]);

  return { menus, sets, labels, service, options, hours, catOrder, rooms, loading, error, reload };
}
