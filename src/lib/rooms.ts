/**
 * 주문 받는 객실 번호 목록. 관리자 설정에서 "201-210, 301~310, 501" 처럼 적으면 펼쳐서 저장합니다.
 * 목록이 비어 있으면 모든 번호를 받습니다 (DB 트리거 check_room_number도 같은 규칙).
 */
export interface RoomList {
  /** 관리자가 적은 그대로 (다시 고칠 때 보여 줍니다) */
  text: string;
  /** 펼친 객실 번호 (대문자) */
  rooms: string[];
}

export const normRoom = (r: string) => r.trim().toUpperCase();

/** "201-210, 301~310, B101" → ['201',…,'210','301',…,'310','B101']. 잘못 적은 부분은 bad에 */
export function parseRooms(text: string): { rooms: string[]; bad: string[] } {
  const rooms = new Set<string>();
  const bad: string[] = [];
  text.split(/[,\s\n]+/).map((x) => x.trim()).filter(Boolean).forEach((part) => {
    const m = part.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (b < a || b - a > 200) { bad.push(part); return; }
      for (let n = a; n <= b; n++) rooms.add(String(n).padStart(m[1].length, '0'));
    } else if (/^[0-9A-Za-z-]{1,6}$/.test(part)) rooms.add(normRoom(part));
    else bad.push(part);
  });
  return { rooms: [...rooms].sort((x, y) => x.localeCompare(y, 'ko', { numeric: true })), bad };
}

export const roomAllowed = (list: string[], room: string) => !list.length || list.includes(normRoom(room));
