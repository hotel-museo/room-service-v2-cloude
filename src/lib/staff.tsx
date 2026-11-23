import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

/**
 * 직원 명단 (직급 + 이름). DB front_staff 표에 팀별로 저장해요.
 * - front: 호텔 프런트 — 객실 반영 확인·퇴실 결제 완료 담당자
 * - bottega: 보테가 — 보고용 이미지 담당자
 * '관리자 설정'은 팀별 비밀번호로 잠겨 있어요.
 */
export type StaffTeam = 'front' | 'bottega';
export interface FrontStaff {
  id: number;
  name: string;
  rank: string;
  sort_order: number;
  active: boolean;
  team: StaffTeam;
}

export const RANKS = ['수습', '사원', '주임', '대리', '과장', '팀장'];
export const staffLabel = (s: Pick<FrontStaff, 'name' | 'rank'>) => (s.rank.trim() ? `${s.rank.trim()} ${s.name.trim()}` : s.name.trim());

export function useStaff(team: StaffTeam) {
  const [list, setList] = useState<FrontStaff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('front_staff').select('*').eq('team', team).order('sort_order').order('id');
    if (e) setError(e.message);
    else { setList((data ?? []) as FrontStaff[]); setError(null); }
  }, [team]);
  useEffect(() => { void load(); }, [load]);
  return { list, active: list.filter((s) => s.active), error, reload: load };
}

/** 관리자 설정: 비밀번호를 넣어야 들어갈 수 있어요. 다른 탭으로 나가면 다시 잠겨요. */
export function AdminSettings(props: { team: StaffTeam; staff: ReturnType<typeof useStaff>; toast: (m: string, bad?: boolean) => void; usedFor: string; children?: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);

  const enter = async () => {
    if (!pin) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('check_staff_pin', { team: props.team, p: pin });
    setBusy(false);
    if (error) return props.toast('확인하지 못했어요: ' + error.message, true);
    if (data === true) { setUnlocked(true); setPin(''); setBad(false); }
    else { setBad(true); setPin(''); }
  };

  if (!unlocked) {
    return (
      <div className="fd-lock">
        <section className="panel">
          <h2 className="fd-h2">관리자 설정</h2>
          <p className="meta">비밀번호를 입력해 주세요.</p>
          <input className={`inp fd-pin${bad ? ' is-bad' : ''}`} type="password" inputMode="numeric" autoComplete="off" maxLength={8} placeholder="••••" value={pin} autoFocus
            onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, '')); setBad(false); }} onKeyDown={(e) => e.key === 'Enter' && void enter()} aria-label="비밀번호" />
          {bad && <p className="fd-pin-err">비밀번호가 맞지 않아요</p>}
          <button type="button" className="btn-green" disabled={busy || !pin} onClick={() => void enter()}>{busy ? '확인 중…' : '들어가기'}</button>
        </section>
      </div>
    );
  }
  return (
    <div className="fd-staff">
      {props.children}
      <StaffSettings {...props} />
      <PinChange team={props.team} toast={props.toast} />
    </div>
  );
}

function PinChange({ team, toast }: { team: StaffTeam; toast: (m: string, bad?: boolean) => void }) {
  const [oldPin, setOld] = useState('');
  const [newPin, setNew] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = /^[0-9]{4,8}$/.test(newPin) && newPin === again && !!oldPin;
  const digits = (v: string) => v.replace(/[^0-9]/g, '');
  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('change_staff_pin', { team, old_pin: oldPin, new_pin: newPin });
    setBusy(false);
    if (error) return toast('바꾸지 못했어요: ' + error.message, true);
    if (data !== true) return toast('지금 비밀번호가 맞지 않아요', true);
    toast('비밀번호를 바꿨어요');
    setOld(''); setNew(''); setAgain('');
  };
  return (
    <section className="panel">
      <h2 className="fd-h2">비밀번호 변경</h2>
      <div className="fd-pin-change">
        <input className="inp" type="password" inputMode="numeric" maxLength={8} placeholder="지금 비밀번호" value={oldPin} onChange={(e) => setOld(digits(e.target.value))} aria-label="지금 비밀번호" />
        <input className="inp" type="password" inputMode="numeric" maxLength={8} placeholder="새 비밀번호 (숫자 4~8자리)" value={newPin} onChange={(e) => setNew(digits(e.target.value))} aria-label="새 비밀번호" />
        <input className="inp" type="password" inputMode="numeric" maxLength={8} placeholder="새 비밀번호 한 번 더" value={again} onChange={(e) => setAgain(digits(e.target.value))} aria-label="새 비밀번호 확인" />
        <button type="button" className="btn-green" disabled={busy || !ok} onClick={() => void save()}>변경</button>
      </div>
      {again && newPin !== again && <p className="fd-pin-err">새 비밀번호가 서로 달라요</p>}
    </section>
  );
}

/** 직원 명단 관리 */
function StaffSettings({ team, staff, toast, usedFor }: { team: StaffTeam; staff: ReturnType<typeof useStaff>; toast: (m: string, bad?: boolean) => void; usedFor: string }) {
  const [name, setName] = useState('');
  const [rank, setRank] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<FrontStaff | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const next = Math.max(0, ...staff.list.map((s) => s.sort_order)) + 1;
    const { error } = await supabase.from('front_staff').insert({ team, name: name.trim(), rank: rank.trim(), sort_order: next });
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
    <>
      <div className="fd-sum">
        <div><span>등록된 직원</span><strong>{staff.active.length}명</strong></div>
        <p className="meta">여기 등록한 직원은 <b>{usedFor}</b> 때 담당자 목록에 나와요. 쉬는 직원은 '숨김'으로 두면 버튼에서 빠지고, 다시 켜면 돌아와요.</p>
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
    </>
  );
}

/** 담당자 고르기: '직원 선택'을 누르면 아래로 명단이 펼쳐져요 (명단에 없으면 직접 입력) */
export function StaffPicker({ staff, value, onChange }: { staff: FrontStaff[]; value: string; onChange: (v: string) => void }) {
  const labels = staff.map(staffLabel);
  const [typing, setTyping] = useState(() => !!value && !labels.includes(value));
  const [open, setOpen] = useState(false);
  if (!staff.length || typing) {
    return (
      <>
        <input id="step-staff" className="inp" placeholder="처리한 직원 이름" value={value} onChange={(e) => onChange(e.target.value)} maxLength={30} autoFocus={!value} />
        {staff.length > 0 ? (
          <button type="button" className="link fd-picker-toggle" onClick={() => { setTyping(false); onChange(''); }}>등록된 직원에서 고르기</button>
        ) : (
          <p className="f-hint">위쪽 '관리자 설정'에서 직원을 등록하면 다음부터 버튼으로 바로 고를 수 있어요.</p>
        )}
      </>
    );
  }
  return (
    <div className="fd-select">
      <button type="button" id="step-staff" className={`fd-select-btn${open ? ' is-open' : ''}${value ? '' : ' is-empty'}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{value || '직원 선택'}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <ul className="fd-select-list" role="listbox" aria-label="담당자">
          {labels.map((l) => (
            <li key={l}>
              <button type="button" role="option" aria-selected={value === l} className={value === l ? 'is-on' : ''} onClick={() => { onChange(l); setOpen(false); }}>
                {l}
                {value === l && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="fd-select-other" onClick={() => { setTyping(true); setOpen(false); onChange(''); }}>명단에 없는 사람 직접 입력</button>
          </li>
        </ul>
      )}
    </div>
  );
}
