import { useCallback, useEffect, useState } from 'react';
import type { BusinessHours } from '../../lib/hours';
import type { CategoryLabels, Menu, SetMenu } from '../../lib/types';
import { orderedCategories } from '../../lib/categories';
import { loadMenuAdminData } from './api';
import { CategoryTab } from './CategoryTab';
import { HoursTab } from './HoursTab';
import { MenuTab } from './MenuTab';
import { SetTab } from './SetTab';
import { useToast } from './ui';
import { notifyPreview } from '../../lib/preview';

type Tab = 'menu' | 'set' | 'cat' | 'hours';

export function MenuAdmin() {
  const [tab, setTab] = useState<Tab>('menu');
  const [data, setData] = useState<{ menus: Menu[]; sets: SetMenu[]; labels: CategoryLabels; hours: BusinessHours; catOrder: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const reload = useCallback(async () => {
    try {
      setData(await loadMenuAdminData());
      setErr(null);
      notifyPreview();
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const cats = data ? orderedCategories(data.catOrder, data.menus) : [];

  return (
    <div className="madmin">
      <div className="mtabs" role="tablist" aria-label="메뉴 관리">
        {([['menu', '단품 메뉴'], ['set', '세트'], ['cat', '카테고리'], ['hours', '영업시간']] as [Tab, string][]).map(([k, label]) => (
          <button type="button" role="tab" key={k} aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
        <span className="grow" />
        <span className="meta">바꾼 내용은 손님 화면에 1분 안에 반영돼요 · 오른쪽 위 '손님 화면'에서 바로 확인</span>
      </div>

      {err && <p className="alert-bad">불러오지 못했어요: {err}</p>}
      {!data && !err && <p className="meta pad">불러오는 중…</p>}
      {data && tab === 'menu' && <MenuTab menus={data.menus} cats={cats} labels={data.labels} reload={reload} toast={toast.show} />}
      {data && tab === 'set' && <SetTab sets={data.sets} menus={data.menus} labels={data.labels} reload={reload} toast={toast.show} />}
      {data && tab === 'cat' && <CategoryTab key={cats.join('|') + JSON.stringify(data.labels)} cats={cats} menus={data.menus} labels={data.labels} reload={reload} toast={toast.show} />}
      {data && tab === 'hours' && <HoursTab hours={data.hours} labels={data.labels} cats={cats} reload={reload} toast={toast.show} />}
      {toast.node}
    </div>
  );
}
