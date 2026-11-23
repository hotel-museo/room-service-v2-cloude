import { useState } from 'react';
import type { BusinessHours } from '../../lib/hours';
import type { CategoryLabels } from '../../lib/types';
import { saveSetting } from './api';
import { Field } from './ui';

interface Props {
  hours: BusinessHours;
  labels: CategoryLabels;
  cats: string[];
  reload: () => Promise<void>;
  toast: (t: string, bad?: boolean) => void;
}

const valid = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function HoursTab({ hours, labels, cats, reload, toast }: Props) {
  const [slots, setSlots] = useState<[string, string][]>(hours.slots.length ? hours.slots : [['11:00', '15:30']]);
  const [cutoffs, setCutoffs] = useState<Record<string, string>>(hours.categoryCutoffs ?? {});
  const [busy, setBusy] = useState(false);

  const ok = slots.every(([a, b]) => valid(a) && valid(b) && a < b) && Object.values(cutoffs).every((v) => !v || valid(v));

  const save = async () => {
    setBusy(true);
    try {
      const cleanCut = Object.fromEntries(Object.entries(cutoffs).filter(([, v]) => v));
      await saveSetting('business_hours', { ...hours, slots, categoryCutoffs: cleanCut });
      toast('영업시간을 저장했습니다');
      await reload();
    } catch (e) {
      toast('저장하지 못했습니다: ' + (e as Error).message, true);
    }
    setBusy(false);
  };

  return (
    <div className="mtab hours">
      <section className="panel">
        <h2>주문 받는 시간</h2>
        <p className="meta">이 시간에만 손님이 주문할 수 있습니다. 마감 30분 전부터 손님 화면에 남은 시간이 보입니다. 임시로 쉬는 날은 주문판 위쪽의 '마감'을 누르십시오.</p>
        {slots.map(([a, b], i) => (
          <div className="slot" key={i}>
            <input className="inp inp--time" type="time" value={a} aria-label="시작" onChange={(e) => setSlots((p) => p.map((s, j) => (j === i ? [e.target.value, s[1]] : s)))} />
            <span>~</span>
            <input className="inp inp--time" type="time" value={b} aria-label="마감" onChange={(e) => setSlots((p) => p.map((s, j) => (j === i ? [s[0], e.target.value] : s)))} />
            {slots.length > 1 && <button type="button" className="link danger-txt" onClick={() => setSlots((p) => p.filter((_, j) => j !== i))}>빼기</button>}
          </div>
        ))}
        <button type="button" className="btn-outline btn-sm" onClick={() => setSlots((p) => [...p, ['17:30', '20:30']])}>+ 시간대 추가</button>
      </section>

      <section className="panel">
        <h2>메뉴별 주문 마감</h2>
        <p className="meta">특정 카테고리만 더 일찍 막고 싶을 때 씁니다. 비워두면 위 시간과 같습니다.</p>
        {cats.map((c) => (
          <Field key={c} label={labels[c]?.ko || c}>
            <div className="slot">
              <input className="inp inp--time" type="time" value={cutoffs[c] ?? ''} onChange={(e) => setCutoffs((p) => ({ ...p, [c]: e.target.value }))} />
              {cutoffs[c] && <button type="button" className="link" onClick={() => setCutoffs((p) => ({ ...p, [c]: '' }))}>지우기</button>}
            </div>
          </Field>
        ))}
      </section>

      <div className="hours-save">
        <button type="button" className="btn-green" disabled={!ok || busy} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
        {!ok && <span className="danger-txt meta">시간을 확인해 주십시오 (시작이 마감보다 빨라야 합니다)</span>}
      </div>
    </div>
  );
}
