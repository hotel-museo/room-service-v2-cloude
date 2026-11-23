import { useRef, useState } from 'react';
import { hasHangul, TR_LANGS } from './translate';
import type { CategoryLabels, Menu } from '../../lib/types';
import { autoTranslate, saveSetting } from './api';
import { Confirm, Field } from './ui';

interface Props {
  cats: string[];
  menus: Menu[];
  labels: CategoryLabels;
  reload: () => Promise<void>;
  toast: (t: string, bad?: boolean) => void;
}

interface Row {
  code: string;
  ko: string;
  en: string;
  ja: string;
  zh: string;
  isNew?: boolean;
}

/**
 * 카테고리 이름(4개 국어)·순서·추가·삭제.
 * 카테고리 이름표(category_translations)에는 세트 구성 이름(파스타, 에이드 등)도 함께 있어서 저장할 때 그대로 남겨둡니다.
 */
export function CategoryTab({ cats, menus, labels, reload, toast }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    cats.map((c) => ({ code: c, ko: labels[c]?.ko ?? c, en: labels[c]?.en ?? '', ja: labels[c]?.ja ?? '', zh: labels[c]?.zh ?? '' })),
  );
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Row | null>(null);
  const [dirty, setDirty] = useState(false);

  const count = (code: string) => menus.filter((m) => m.category === code).length;
  // 직원이 직접 고친 번역 칸 (저장할 때 덮어쓰지 않아요)
  const touched = useRef(new Set<string>());
  const patch = (code: string, p: Partial<Row>) => {
    (['en', 'ja', 'zh'] as const).forEach((l) => { if (l in p) touched.current.add(`${code}_${l}`); });
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, ...p } : r)));
    setDirty(true);
  };
  const koChanged = (r: Row) => !r.isNew && (labels[r.code]?.ko ?? r.code).trim() !== r.ko.trim();

  /** 저장 전에: 빈 칸 번역 + 한국어 이름이 바뀐 카테고리는 다시 번역 (직접 고친 번역은 그대로) */
  const fillAll = async (list: Row[]) => {
    let failed = false;
    const out: Row[] = [];
    for (const r of list) {
      const n = { ...r };
      if (n.ko.trim()) {
        for (const l of TR_LANGS) {
          const need = !n[l].trim() || (koChanged(r) && !touched.current.has(`${r.code}_${l}`));
          if (!need) continue;
          try { n[l] = await autoTranslate(n.ko.trim(), l); } catch { failed = true; }
        }
      }
      out.push(n);
    }
    return { out, failed };
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };
  const add = () => {
    const code = `CAT_${Date.now().toString(36).toUpperCase()}`;
    setRows((prev) => [...prev, { code, ko: '', en: '', ja: '', zh: '', isNew: true }]);
    setOpen(code);
    setDirty(true);
  };
  const translateRow = async (r: Row) => {
    setBusy(true);
    try {
      patch(r.code, {
        en: r.en || (await autoTranslate(r.ko, 'en')),
        ja: r.ja || (await autoTranslate(r.ko, 'ja')),
        zh: r.zh || (await autoTranslate(r.ko, 'zh')),
      });
    } catch (e) {
      toast('자동 번역에 실패했습니다: ' + (e as Error).message, true);
    }
    setBusy(false);
  };

  const valid = rows.every((r) => r.ko.trim());

  const save = async () => {
    setBusy(true);
    try {
      const { out: filled, failed } = await fillAll(rows);
      setRows(filled);
      const nextLabels: CategoryLabels = { ...labels };
      filled.forEach((r) => {
        nextLabels[r.code] = { ko: r.ko.trim(), en: r.en.trim() || undefined, ja: r.ja.trim() || undefined, zh: r.zh.trim() || undefined };
      });
      await saveSetting('category_translations', nextLabels);
      await saveSetting('category_order', { order: filled.map((r) => r.code) });
      setDirty(false);
      toast('카테고리를 저장했습니다' + (failed ? ' (일부 번역 실패 — 외국어 칸을 확인해 주십시오)' : ''), failed);
      await reload();
    } catch (e) {
      toast('저장하지 못했습니다: ' + (e as Error).message, true);
    }
    setBusy(false);
  };

  return (
    <div className="mtab">
      <div className="mtab-bar">
        <p className="meta">순서는 손님 화면의 카테고리 순서입니다. 메뉴가 없는 카테고리는 손님 화면에 안 보입니다.</p>
        <button type="button" className="btn-green" onClick={add}>+ 카테고리 추가</button>
      </div>

      <div className="mlist">
        {rows.map((r, i) => {
          const n = count(r.code);
          const expanded = open === r.code;
          return (
            <div className="catrow" key={r.code}>
              <div className="mitem">
                <div className="order-btns">
                  <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button type="button" aria-label="아래로" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>▼</button>
                </div>
                <input
                  className="inp cat-name"
                  value={r.ko}
                  placeholder="카테고리 이름 (예: 디저트)"
                  aria-label="카테고리 이름"
                  onChange={(e) => patch(r.code, { ko: e.target.value })}
                />
                <span className="meta cat-count">메뉴 {n}개</span>
                <button type="button" className="btn-outline btn-sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.code)}>
                  외국어 {[r.en, r.ja, r.zh].some((v) => hasHangul(v)) ? '⚠' : r.en && r.ja && r.zh ? '✓' : ''} {expanded ? '▲' : '▼'}
                </button>
                <button
                  type="button"
                  className="btn-outline btn-sm danger"
                  disabled={n > 0}
                  title={n > 0 ? '메뉴를 다른 카테고리로 옮긴 뒤 지울 수 있습니다' : undefined}
                  onClick={() => setDel(r)}
                >
                  삭제
                </button>
              </div>
              {expanded && (
                <div className="cat-langs">
                  {TR_LANGS.map((l) => (
                    <Field key={l} label={{ en: '영어', ja: '일본어', zh: '중국어' }[l]}>
                      <input className={`inp${hasHangul(r[l]) ? ' inp--warn' : ''}`} value={r[l]} onChange={(e) => patch(r.code, { [l]: e.target.value })} />
                      {hasHangul(r[l]) && <span className="tr-warn">한글이 남아 있습니다</span>}
                    </Field>
                  ))}
                  <button type="button" className="btn-outline btn-sm" disabled={busy || !r.ko.trim()} onClick={() => void translateRow(r)}>빈 칸 자동 번역</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="f-hint">메뉴를 다른 카테고리로 옮기려면 '단품 메뉴'에서 메뉴를 열고 카테고리를 바꾸십시오. 메뉴가 있는 카테고리는 지울 수 없습니다.</p>

      <div className="hours-save">
        <button type="button" className="btn-green" disabled={!valid || busy || !dirty} onClick={() => void save()}>{busy ? '저장 중… (번역 포함)' : '저장'}</button>
        {dirty && <span className="meta">저장하지 않은 변경이 있습니다 · 저장하면 빈 외국어 칸과 이름이 바뀐 카테고리는 자동 번역됩니다</span>}
        {!valid && <span className="meta danger-txt">이름이 빈 카테고리가 있습니다</span>}
      </div>

      {del && (
        <Confirm
          title="카테고리를 지우시겠습니까?"
          danger
          body={<p><strong>{del.ko || '이름 없는 카테고리'}</strong>를 목록에서 지웁니다. 저장을 눌러야 반영됩니다.</p>}
          okLabel="지우기"
          onCancel={() => setDel(null)}
          onOk={() => {
            setRows((prev) => prev.filter((x) => x.code !== del.code));
            setDirty(true);
            setDel(null);
          }}
        />
      )}
    </div>
  );
}
