import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseRooms, type RoomList } from '../lib/rooms';
import { saveSetting } from './menu/api';

/** 관리자 설정 > 주문 받는 객실 번호. 비워두면 모든 번호를 받아요. */
export function RoomsSection({ toast }: { toast: (m: string, bad?: boolean) => void }) {
  const [saved, setSaved] = useState<RoomList | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from('site_settings').select('settings').eq('key', 'room_list').maybeSingle().then(({ data }) => {
      const v = (data?.settings as RoomList | undefined) ?? { text: '', rooms: [] };
      setSaved(v);
      setText(v.text ?? '');
    });
  }, []);

  const { rooms, bad } = parseRooms(text);
  const changed = !!saved && text.trim() !== (saved.text ?? '').trim();

  const save = async () => {
    setBusy(true);
    try {
      const v = { text: text.trim(), rooms };
      await saveSetting('room_list', v);
      setSaved(v);
      toast(rooms.length ? `객실 ${rooms.length}개를 저장했어요. 이 번호만 주문할 수 있어요` : '객실 목록을 비웠어요. 모든 번호로 주문할 수 있어요');
    } catch (e) {
      toast('저장하지 못했어요: ' + (e as Error).message, true);
    }
    setBusy(false);
  };

  return (
    <section className="panel">
      <h2 className="fd-h2">주문 받는 객실 번호</h2>
      <p className="meta">
        여기 적은 객실 번호로만 주문할 수 있어요. 없는 번호를 넣으면 손님 화면에서 "등록되지 않은 객실 번호"라고 막혀요.
        <br />범위는 <b>201-210</b>, 하나씩은 <b>501</b>처럼 쉼표나 줄바꿈으로 나눠 적어요. <b>비워두면 지금처럼 모든 번호를 받아요.</b>
      </p>
      <textarea className="inp" rows={3} placeholder="예: 201-210, 301-310, 401-410, 501" value={text} onChange={(e) => setText(e.target.value)} aria-label="객실 번호" />
      {bad.length > 0 && <p className="fd-pin-err">알아볼 수 없는 부분: {bad.join(', ')}</p>}
      <div className="fd-rooms">
        {rooms.length ? (
          <>
            <span className="meta">객실 {rooms.length}개</span>
            <div className="fd-room-chips">{rooms.map((r) => <span key={r} className="chip">{r}</span>)}</div>
          </>
        ) : (
          <span className="meta">등록된 객실 없음 → 모든 번호 받음</span>
        )}
      </div>
      <div>
        <button type="button" className="btn-green" disabled={busy || !changed || bad.length > 0} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </section>
  );
}
