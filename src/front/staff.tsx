import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * 프런트 직원 명단 (이름 + 직급). DB front_staff 표에 저장해서 프런트 PC 어디서나 같아요.
 * 객실 반영 확인·퇴실 결제 완료 때 '담당자'를 버튼으로 바로 고를 수 있게 해요.
 */
export interface FrontStaff {
  id: number;
  name: string;
  rank: string;
  sort_order: number;
  active: boolean;
}

export const RANKS = ['지배인', '부지배인', '매니저', '주임', '대리', '사원', '인턴'];
export const staffLabel = (s: Pick<FrontStaff, 'name' | 'rank'>) => (s.rank.trim() ? `${s.name.trim()} ${s.rank.trim()}` : s.name.trim());

export function useFrontStaff() {
  const [list, setList] = useState<FrontStaff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('front_staff').select('*').order('sort_order').order('id');
    if (e) setError(e.message);
    else { setList((data ?? []) as FrontStaff[]); setError(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { list, active: list.filter((s) => s.active), error, reload: load };
}

/** 직원 설정 화면 */
export function StaffSettings({ staff, toast }: { staff: ReturnType<typeof useFrontStaff>; toast: (m: string, bad?: boolean) => void }) {
  const [name, setName] = useState('');
  const [rank, setRank] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<FrontStaff | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const next = Math.max(0, ...staff.list.map((s) => s.sort_order)) + 1;
    const { error } = await supabase.from('front_staff').insert({ name: name.trim(), rank: rank.trim(), sort_order: next });
    setBusy(false);
    if (error) return toast('추가하지 못했어요: ' + error.message, true);
    toast(`${staffLabel({ name, rank })}님을 추가했어요`);
    setName('');
    setRank('');
    void staff.reload();
  };

  const patch = async (id: number, p: Partial<FrontStaff>, msg?: string) => {
    const { error } = await supabase.from('front_staff').update(p).eq('id', id);
    if (error) return toast('저장하지 못했어요: ' + error.message, true);
    if (msg) toast(msg);
    void staff.reload();
  };

  const move = async (i: number, d: -1 | 1) => {
    const a = staff.list[i];
    const b = staff.list[i + d];
    if (!a || !b) return;
    await Promise.all([
      supabase.from('front_staff').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('front_staff').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    void staff.reload();
  };

  const remove = async (s: FrontStaff) => {
    if (!window.confirm(`${staffLabel(s)}님을 명단에서 지울까요?\n이미 처리한 기록의 담당자 이름은 그대로 남아요.`)) return;
    const { error } = await supabase.from('front_staff').delete().eq('id', s.id);
    if (error) return toast('지우지 못했어요: ' + error.message, true);
    toast(`${staffLabel(s)}님을 지웠어요`);
    void staff.reload();
  };

  return (
    <div className="fd-staff">
      <div className="fd-sum">
        <div><span>등록된 직원</span><strong>{staff.active.length}명</strong></div>
        <p className="meta">여기 등록한 직원은 <b>객실 반영 확인</b>·<b>퇴실 결제 완료</b> 때 담당자 버튼으로 나와요. 쉬는 직원은 '숨김'으로 두면 버튼에서 빠지고, 다시 켜면 돌아와요.</p>
      </div>

      {staff.error && <p className="alert-bad">직원 명단을 불러오지 못했어요: {staff.error}</p>}

      <section className="panel">
        <h2 className="fd-h2">직원 추가</h2>
        <div className="fd-staff-add">
          <input className="inp" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} aria-label="이름" onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <input className="inp" placeholder="직급 (예: 대리)" value={rank} onChange={(e) => setRank(e.target.value)} maxLength={20} aria-label="직급" list="fd-ranks" onKeyDown={(e) => e.key === 'Enter' && void add()} />
          <datalist id="fd-ranks">{RANKS.map((r) => <option key={r} value={r} />)}</datalist>
          <button type="button" className="btn-green" disabled={busy || !name.trim()} onClick={() => void add()}>추가</button>
        </div>
        <div className="fd-rank-chips">
          {RANKS.map((r) => (
            <button type="button" key={r} className={`chip${rank === r ? ' chip--on' : ''}`} onClick={() => setRank(r)}>{r}</button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="fd-h2">직원 명단</h2>
        {staff.list.length === 0 ? (
          <p className="meta">아직 등록된 직원이 없어요. 위에서 추가해 주세요.</p>
        ) : (
          <ul className="fd-staff-list">
            {staff.list.map((s, i) => (
              <li key={s.id} className={s.active ? '' : 'is-off'}>
                <span className="fd-order">
                  <button type="button" aria-label="위로" disabled={i === 0} onClick={() => void move(i, -1)}>▲</button>
                  <button type="button" aria-label="아래로" disabled={i === staff.list.length - 1} onClick={() => void move(i, 1)}>▼</button>
                </span>
                {editing?.id === s.id ? (
                  <>
                    <input className="inp inp--sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={20} aria-label="이름" />
                    <input className="inp inp--sm" value={editing.rank} onChange={(e) => setEditing({ ...editing, rank: e.target.value })} maxLength={20} aria-label="직급" list="fd-ranks" />
                    <span className="grow" />
                    <button type="button" className="link" onClick={() => setEditing(null)}>취소</button>
                    <button type="button" className="btn-green btn-sm" disabled={!editing.name.trim()} onClick={() => { void patch(s.id, { name: editing.name.trim(), rank: editing.rank.trim() }, '수정했어요'); setEditing(null); }}>저장</button>
                  </>
                ) : (
                  <>
                    <strong>{s.name}</strong>
                    <span className="chip">{s.rank || '직급 없음'}</span>
                    {!s.active && <span className="meta">숨김</span>}
                    <span className="grow" />
                    <button type="button" className="link" onClick={() => setEditing(s)}>수정</button>
                    <button type="button" className="link" onClick={() => void patch(s.id, { active: !s.active }, s.active ? `${staffLabel(s)}님을 숨겼어요` : `${staffLabel(s)}님을 다시 보이게 했어요`)}>{s.active ? '숨김' : '보이기'}</button>
                    <button type="button" className="link danger" onClick={() => void remove(s)}>삭제</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 담당자 고르기: 등록된 직원 버튼 + (필요하면) 직접 입력 */
export function StaffPicker({ staff, value, onChange }: { staff: FrontStaff[]; value: string; onChange: (v: string) => void }) {
  const labels = staff.map(staffLabel);
  const [typing, setTyping] = useState(() => !!value && !labels.includes(value));
  if (!staff.length || typing) {
    return (
      <>
        <input id="step-staff" className="inp" placeholder="처리한 직원 이름" value={value} onChange={(e) => onChange(e.target.value)} maxLength={30} autoFocus={!value} />
        {staff.length > 0 ? (
          <button type="button" className="link fd-picker-toggle" onClick={() => { setTyping(false); onChange(''); }}>등록된 직원에서 고르기</button>
        ) : (
          <p className="f-hint">위쪽 '직원 설정'에서 직원을 등록하면 다음부터 버튼으로 바로 고를 수 있어요.</p>
        )}
      </>
    );
  }
  return (
    <>
      <div className="fd-picker" role="group" aria-label="담당자">
        {labels.map((l) => (
          <button type="button" key={l} className={value === l ? 'is-on' : ''} aria-pressed={value === l} onClick={() => onChange(l)}>{l}</button>
        ))}
      </div>
      <button type="button" className="link fd-picker-toggle" onClick={() => { setTyping(true); onChange(''); }}>명단에 없는 사람 직접 입력</button>
    </>
  );
}
