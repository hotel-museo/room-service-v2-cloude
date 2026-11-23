import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_ETA, type EtaSettings } from '../lib/delivery';
import { notifyPreview } from '../lib/preview';
import { saveSetting } from './menu/api';

/** 관리자 설정 > 손님 장바구니에 보이는 '지금 주문하면 약 ○~○분 후 도착' */
export function EtaSection({ toast }: { toast: (m: string, bad?: boolean) => void }) {
  const [saved, setSaved] = useState<EtaSettings | null>(null);
  const [form, setForm] = useState<EtaSettings>(DEFAULT_ETA);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from('site_settings').select('settings').eq('key', 'eta').maybeSingle().then(({ data }) => {
      const v = { ...DEFAULT_ETA, ...((data?.settings as Partial<EtaSettings>) ?? {}) };
      setSaved(v);
      setForm(v);
    });
  }, []);

  const ok = (r: [number, number]) => r[0] > 0 && r[1] >= r[0] && r[1] <= 180;
  const valid = ok(form.open) && ok(form.busy);
  const changed = !!saved && JSON.stringify(saved) !== JSON.stringify(form);
  const num = (v: string) => Math.max(0, Math.min(180, Number(v.replace(/[^0-9]/g, '')) || 0));
  const setRange = (k: keyof EtaSettings, i: 0 | 1, v: string) => {
    const r: [number, number] = [...form[k]] as [number, number];
    r[i] = num(v);
    setForm({ ...form, [k]: r });
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveSetting('eta', form);
      setSaved(form);
      notifyPreview();
      toast('예상 도착 시간을 저장했습니다');
    } catch (e) {
      toast('저장하지 못했습니다: ' + (e as Error).message, true);
    }
    setBusy(false);
  };

  const row = (k: keyof EtaSettings, label: string, hint: string) => (
    <div className="eta-row">
      <div><strong>{label}</strong><div className="meta">{hint}</div></div>
      <div className="slot">
        <input className="inp inp--sm eta-inp" inputMode="numeric" value={form[k][0]} onChange={(e) => setRange(k, 0, e.target.value)} aria-label={`${label} 최소`} />
        <span>~</span>
        <input className="inp inp--sm eta-inp" inputMode="numeric" value={form[k][1]} onChange={(e) => setRange(k, 1, e.target.value)} aria-label={`${label} 최대`} />
        <span>분</span>
      </div>
    </div>
  );

  return (
    <section className="panel">
      <h2 className="fd-h2">예상 도착 시간</h2>
      <p className="meta">손님 장바구니에 <b>"지금 주문하면 약 ○~○분 후 도착합니다"</b>로 보입니다. 주문판 위쪽을 <b>'바쁨'</b>으로 바꾸면 바쁠 때 시간으로 바뀝니다.</p>
      {row('open', '평소', '영업 중일 때')}
      {row('busy', '바쁠 때', "'바쁨'으로 바꿨을 때")}
      {!valid && <p className="fd-pin-err">시간을 확인해 주십시오 (앞 숫자가 뒤 숫자보다 작거나 같아야 합니다)</p>}
      <div>
        <button type="button" className="btn-green" disabled={busy || !changed || !valid} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </section>
  );
}
