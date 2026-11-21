import type { BusinessHours } from '../../lib/hours';
import { supabase } from '../../lib/supabase';
import type { CategoryLabels, Menu, SetMenu } from '../../lib/types';

export async function loadMenuAdminData() {
  const [m, s, l, h] = await Promise.all([
    supabase.from('menus').select('*').order('sort_order', { ascending: true }),
    supabase.from('set_menus').select('*').order('sort_order', { ascending: true }),
    supabase.from('site_settings').select('settings').eq('key', 'category_translations').maybeSingle(),
    supabase.from('site_settings').select('settings').eq('key', 'business_hours').maybeSingle(),
  ]);
  if (m.error) throw m.error;
  if (s.error) throw s.error;
  return {
    menus: (m.data ?? []) as Menu[],
    sets: (s.data ?? []) as SetMenu[],
    labels: (l.data?.settings ?? {}) as CategoryLabels,
    hours: (h.data?.settings ?? { tz: 'Asia/Seoul', slots: [] }) as BusinessHours,
  };
}

function check<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

export const saveMenu = async (id: number, patch: Partial<Menu>) => check(await supabase.from('menus').update(patch).eq('id', id));
export const createMenu = async (row: Partial<Menu>) => check(await supabase.from('menus').insert(row).select('*').single());
export const deleteMenu = async (id: number) => check(await supabase.from('menus').delete().eq('id', id));
export const saveSet = async (id: number, patch: Partial<SetMenu>) => check(await supabase.from('set_menus').update(patch).eq('id', id));
export const createSet = async (row: Partial<SetMenu>) => check(await supabase.from('set_menus').insert(row).select('*').single());
export const deleteSet = async (id: number) => check(await supabase.from('set_menus').delete().eq('id', id));
export const saveSetting = async (key: string, settings: unknown) =>
  check(await supabase.from('site_settings').upsert({ key, settings, updated_at: new Date().toISOString() }));

/** 여러 메뉴의 순서를 한 번에 저장 */
export async function saveOrder(items: { id: number; sort_order: number }[], table: 'menus' | 'set_menus' = 'menus') {
  for (const it of items) check(await supabase.from(table).update({ sort_order: it.sort_order }).eq('id', it.id));
}

/**
 * 사진을 1200px 이하 JPG로 줄여서 올립니다 (휴대폰 데이터 절약).
 * 반환: 공개 주소
 */
export async function uploadImage(file: File, folder: 'menus' | 'sets'): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('이미지 변환 실패'))), 'image/jpeg', 0.85));
  const path = `pasta-house/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  check(await supabase.storage.from('menu-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
  return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
}

/**
 * 자동 번역 (기존 번역 함수 사용). 기계 번역이라 메뉴 이름은 꼭 확인해야 해요.
 */
export async function autoTranslate(text: string, target: 'en' | 'ja' | 'zh'): Promise<string> {
  if (!text.trim()) return '';
  const { data, error } = await supabase.functions.invoke('hyper-action', { body: { text, target } });
  if (error) throw error;
  return String((data as { translatedText?: string })?.translatedText ?? '');
}
