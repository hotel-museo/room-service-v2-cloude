import { useCallback, useEffect, useRef, useState } from 'react';
import { nextKstMidnightIso, todayKstStartIso } from '../lib/menu';
import { supabase } from '../lib/supabase';
import type { Menu, Order, ServiceStatus } from '../lib/types';

const POLL_MS = 4000;

export function useBoard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [wings, setWings] = useState<Order[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [service, setService] = useState<ServiceStatus>('open');
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const since = todayKstStartIso();
    const since60 = new Date(Date.now() - 60 * 864e5).toISOString();
    const [o, m, s, w] = await Promise.all([
      // 오늘 들어온 주문 + 아직 끝나지 않은 예전 주문
      supabase.from('orders').select('*').or(`created_at.gte."${since}",status.in.(pending,cooking)`).order('created_at', { ascending: true }),
      supabase.from('menus').select('*').order('sort_order', { ascending: true }),
      supabase.from('service_status').select('status').eq('id', 1).maybeSingle(),
      // WINGS 입력 대기 + 입력했지만 프런트가 아직 확인 안 한 투숙객 후불 주문 (날짜 상관없이)
      supabase.from('orders').select('*').eq('payment_method', 'checkout').in('status', ['cooking', 'completed']).is('settled_at', null).gte('created_at', since60).order('created_at', { ascending: true }),
    ]);
    busy.current = false;
    if (o.error || m.error) {
      setOnline(false);
      return;
    }
    setOnline(true);
    setOrders((o.data ?? []) as Order[]);
    setMenus((m.data ?? []) as Menu[]);
    if (!w.error) setWings((w.data ?? []) as Order[]);
    if (s.data?.status) setService(s.data.status as ServiceStatus);
    setLastSync(new Date());
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const patchOrder = async (id: number, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    const { error } = await supabase.from('orders').update(patch).eq('id', id);
    if (error) alert('저장하지 못했어요. 인터넷 연결을 확인해 주세요.\n' + error.message);
    void load();
  };

  const accept = (id: number, minutes: number) =>
    patchOrder(id, { status: 'cooking', accepted_at: new Date().toISOString(), estimated_minutes: minutes });
  const complete = (id: number) => patchOrder(id, { status: 'completed', completed_at: new Date().toISOString() });
  const reject = (id: number, reason: string) =>
    patchOrder(id, { status: 'rejected', rejected_at: new Date().toISOString(), rejection_reason: reason });

  const setWingsPosted = async (id: number, on: boolean) => {
    const patch = { wings_posted_at: on ? new Date().toISOString() : null };
    setWings((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    const { error } = await supabase.from('orders').update(patch).eq('id', id);
    if (error) alert(error.message.includes('ALREADY_CONFIRMED') ? '프런트에서 이미 확인한 주문이라 취소할 수 없어요.' : 'WINGS 입력 상태를 저장하지 못했어요.\n' + error.message);
    void load();
  };

  const setSoldOut = async (id: number, soldOut: boolean) => {
    const patch = soldOut ? { is_available: false, sold_out_until: nextKstMidnightIso() } : { is_available: true, sold_out_until: null };
    setMenus((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    const { error } = await supabase.from('menus').update(patch).eq('id', id);
    if (error) alert('품절 상태를 저장하지 못했어요.\n' + error.message);
    void load();
  };

  const changeService = async (status: ServiceStatus) => {
    setService(status);
    const { error } = await supabase.from('service_status').update({ status, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) alert('영업 상태를 저장하지 못했어요.\n' + error.message);
    void load();
  };

  return { orders, wings, setWingsPosted, menus, service, online, lastSync, accept, complete, reject, setSoldOut, changeService, reload: load };
}
