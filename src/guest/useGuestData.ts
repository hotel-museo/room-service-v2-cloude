import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { CategoryLabels, Menu, ServiceStatus, SetMenu } from '../lib/types';

export interface GuestData {
  menus: Menu[];
  sets: SetMenu[];
  labels: CategoryLabels;
  service: ServiceStatus;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const REFRESH_MS = 60_000;

export function useGuestData(): GuestData {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [sets, setSets] = useState<SetMenu[]>([]);
  const [labels, setLabels] = useState<CategoryLabels>({});
  const [service, setService] = useState<ServiceStatus>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [m, s, l, st] = await Promise.all([
      supabase.from('menus').select('*').order('sort_order', { ascending: true }),
      supabase.from('set_menus').select('*').order('sort_order', { ascending: true }),
      supabase.from('site_settings').select('settings').eq('key', 'category_translations').maybeSingle(),
      supabase.from('service_status').select('status').eq('id', 1).maybeSingle(),
    ]);
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
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload]);

  return { menus, sets, labels, service, loading, error, reload };
}
