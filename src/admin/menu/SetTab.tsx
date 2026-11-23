import { changedBases, fillTranslations, hasHangul, TR_LANGS } from './translate';
import { useRef, useState } from 'react';
import { won } from '../../lib/menu';
import type { CategoryLabels, Menu, SetComponentConfig, SetMenu } from '../../lib/types';
import { createSet, deleteSet, saveSet, uploadImage } from './api';
import { Confirm, Drawer, Field, Toggle } from './ui';

interface Props {
  sets: SetMenu[];
  menus: Menu[];
  labels: CategoryLabels;
  reload: () => Promise<void>;
  toast: (t: string, bad?: boolean) => void;
}

/** 세트 구성 라벨로 고를 수 있는 이름 (손님 화면에 "파스타 1개 선택"처럼 보임) */
const COMPONENT_LABELS = ['PASTA', 'PIZZA', 'RISOTTO', 'PILAF', 'NOODLE', 'ADE', 'SALAD', 'SIDE', 'DRINK'];

export function SetTab({ sets, menus, labels, reload, toast }: Props) {
  const [editing, setEditing] = useState<SetMenu | 'new' | null>(null);
  const list = [...sets].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      await reload();
    } catch (e) {
      toast('저장하지 못했습니다: ' + (e as Error).message, true);
    }
  };

  return (
    <div className="mtab">
      <div className="mtab-bar">
        <p className="meta">손님은 세트를 누른 뒤 구성별로 메뉴를 고릅니다. 고급 메뉴에는 추가금을 붙일 수 있습니다.</p>
        <button type="button" className="btn-green" onClick={() => setEditing('new')}>+ 세트 추가</button>
      </div>
      <div className="mlist">
        {list.map((s) => {
          const on = s.is_active && !s.is_hidden;
          return (
            <div className={`mitem mitem--set${on ? '' : ' is-hidden'}`} key={s.id}>
              {s.image_url ? <img src={s.image_url} alt="" /> : <span className="noimg">사진 없음</span>}
              <button type="button" className="mitem-main" onClick={() => setEditing(s)}>
                <strong>{s.name}</strong>
                <span className="meta">{s.description}</span>
              </button>
              <span className="mitem-price">{won(s.price)}원</span>
              <Toggle on={on} label={`${s.name} 노출`} onText="보임" offText="숨김" onChange={() => void run(() => saveSet(s.id, { is_hidden: on, is_active: true }), on ? '세트를 숨겼습니다' : '세트를 다시 표시했습니다')} />
              <button type="button" className="edit-btn" onClick={() => setEditing(s)} aria-label={`${s.name} 수정`} title="수정">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14 7l3 3" /></svg>
              </button>
            </div>
          );
        })}
      </div>
      {editing && (
        <SetEditor
          set={editing === 'new' ? null : editing}
          menus={menus}
          labels={labels}
          nextSort={Math.max(0, ...sets.map((s) => s.sort_order)) + 1}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast(msg); await reload(); }}
          onError={(m) => toast(m, true)}
        />
      )}
    </div>
  );
}

function SetEditor({ set, menus, labels, nextSort, onClose, onSaved, onError }: {
  set: SetMenu | null;
  menus: Menu[];
  labels: CategoryLabels;
  nextSort: number;
  onClose: () => void;
  onSaved: (m: string) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [f, setF] = useState({
    name: set?.name ?? '',
    description: set?.description ?? '',
    price: String(set?.price ?? ''),
    image_url: set?.image_url ?? '',
    name_en: set?.name_en ?? '', name_ja: set?.name_ja ?? '', name_zh: set?.name_zh ?? '',
    description_en: set?.description_en ?? '', description_ja: set?.description_ja ?? '', description_zh: set?.description_zh ?? '',
  });
  const [comps, setComps] = useState<SetComponentConfig[]>(
    (set?.config?.components ?? []).map((c) => ({ category: c.category, count: c.count ?? c.quantity ?? 1, menu_ids: [...(c.menu_ids ?? [])], extras: { ...(c.extras ?? {}) } })),
  );
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const touched = useRef(new Set<string>());
  const set_ = (k: keyof typeof f, v: string) => {
    if (/_(en|ja|zh)$/.test(k)) touched.current.add(k);
    setF((p) => ({ ...p, [k]: v }));
  };
  const koChanged = changedBases(f, ['name', 'description'], set as unknown as Record<string, unknown>).length > 0;
  const hasTr = TR_LANGS.some((l) => f[`name_${l}`] || f[`description_${l}`]);
  const translate = async (force: boolean) => {
    setBusy(true);
    const { next, failed } = await fillTranslations(f, ['name', 'description'], { orig: set as unknown as Record<string, unknown>, touched: touched.current, force });
    if (force) touched.current.clear();
    setF(next);
    setLangOpen(true);
    if (failed) onError('일부를 자동 번역하지 못했습니다. 잠시 후 다시 누르거나 직접 입력해 주십시오.');
    setBusy(false);
  };

  const price = Number(f.price.replace(/[^0-9]/g, ''));
  const compsOk = comps.length > 0 && comps.every((c) => c.menu_ids.length >= (c.count ?? 1));
  const valid = f.name.trim() && price > 0 && compsOk;
  const visible = menus.filter((m) => !m.is_hidden).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const cats = [...new Set(visible.map((m) => m.category))];
  const lab = (c: string) => labels[c]?.ko || c;

  const patchComp = (i: number, p: Partial<SetComponentConfig>) => setComps((prev) => prev.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const toggleMenu = (i: number, id: number) => {
    const c = comps[i];
    const has = c.menu_ids.includes(id);
    const extras = { ...(c.extras ?? {}) };
    if (has) delete extras[String(id)];
    patchComp(i, { menu_ids: has ? c.menu_ids.filter((x) => x !== id) : [...c.menu_ids, id], extras });
  };

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { set_('image_url', await uploadImage(file, 'sets')); } catch (e) { onError('사진을 올리지 못했습니다: ' + (e as Error).message); }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    // 저장 전에: 빈 번역 칸 채우기 + 한국어가 바뀐 부분 다시 번역 (직접 고친 번역은 그대로)
    const { next: g, failed } = await fillTranslations(f, ['name', 'description'], { orig: set as unknown as Record<string, unknown>, touched: touched.current });
    setF(g);
    const cleaned = comps.map((c) => ({
      category: c.category,
      count: c.count ?? 1,
      menu_ids: c.menu_ids,
      extras: Object.fromEntries(Object.entries(c.extras ?? {}).filter(([k, v]) => c.menu_ids.includes(Number(k)) && Number(v) > 0).map(([k, v]) => [k, Number(v)])),
    }));
    const row: Partial<SetMenu> = {
      name: g.name.trim(), description: g.description.trim() || null, price, image_url: g.image_url || null,
      name_en: g.name_en.trim() || null, name_ja: g.name_ja.trim() || null, name_zh: g.name_zh.trim() || null,
      description_en: g.description_en.trim() || null, description_ja: g.description_ja.trim() || null, description_zh: g.description_zh.trim() || null,
      config: { version: 2, components: cleaned },
    };
    try {
      if (set) await saveSet(set.id, row);
      else await createSet({ ...row, is_active: true, is_hidden: false, sort_order: nextSort });
      await onSaved((set ? '세트를 저장했습니다' : '세트를 추가했습니다') + (failed ? ' (일부 번역 실패 — 외국어 칸을 확인해 주십시오)' : ''));
    } catch (e) {
      onError('저장하지 못했습니다: ' + (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={set ? '세트 수정' : '새 세트'}
      onClose={onClose}
      footer={
        <>
          {set && <button type="button" className="btn-outline danger" disabled={busy} onClick={() => setConfirm('delete')}>삭제</button>}
          <div className="grow" />
          <button type="button" className="btn-outline" onClick={onClose}>취소</button>
          <button type="button" className="btn-green" disabled={!valid || busy} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
        </>
      }
    >
      <div className="photo">
        {f.image_url ? <img src={f.image_url} alt="" /> : <span className="noimg noimg--lg">사진 없음</span>}
        <div className="photo-btns">
          <label className="btn-outline btn-file">{f.image_url ? '사진 바꾸기' : '사진 올리기'}<input type="file" accept="image/*" onChange={(e) => void onPhoto(e.target.files?.[0])} /></label>
        </div>
      </div>
      <div className="f-row">
        <Field label="세트 이름"><input className="inp" value={f.name} onChange={(e) => set_('name', e.target.value)} /></Field>
        <Field label="가격 (원)"><input className="inp" inputMode="numeric" value={f.price} onChange={(e) => set_('price', e.target.value.replace(/[^0-9]/g, ''))} /></Field>
      </div>
      <Field label="구성 설명" hint="예: 파스타 택 1 + 피자 택 1 + 에이드 1">
        <input className="inp" value={f.description} onChange={(e) => set_('description', e.target.value)} />
      </Field>

      <h3 className="sub-h">구성</h3>
      {comps.map((c, i) => (
        <div className="comp" key={i}>
          <div className="comp-head">
            <select className="inp inp--sm" value={c.category} onChange={(e) => patchComp(i, { category: e.target.value })} aria-label="구성 이름">
              {[...new Set([...COMPONENT_LABELS, c.category])].map((k) => <option key={k} value={k}>{lab(k)}</option>)}
            </select>
            <select className="inp inp--sm" value={c.count ?? 1} onChange={(e) => patchComp(i, { count: Number(e.target.value) })} aria-label="고를 개수">
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}개 선택</option>)}
            </select>
            <button type="button" className="link danger-txt" onClick={() => setComps((p) => p.filter((_, j) => j !== i))}>구성 빼기</button>
          </div>
          <div className="comp-menus">
            {cats.map((cat) => (
              <div key={cat} className="comp-cat">
                <span className="meta">{lab(cat)}</span>
                <div className="chips">
                  {visible.filter((m) => m.category === cat).map((m) => {
                    const on = c.menu_ids.includes(m.id);
                    return (
                      <span key={m.id} className={`chip-pick${on ? ' is-on' : ''}`}>
                        <button type="button" aria-pressed={on} onClick={() => toggleMenu(i, m.id)}>{m.name}</button>
                        {on && (
                          <input
                            className="extra"
                            inputMode="numeric"
                            aria-label={`${m.name} 추가금`}
                            placeholder="+0"
                            value={c.extras?.[String(m.id)] ? String(c.extras[String(m.id)]) : ''}
                            onChange={(e) => patchComp(i, { extras: { ...(c.extras ?? {}), [String(m.id)]: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 } })}
                          />
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {c.menu_ids.length < (c.count ?? 1) && <p className="f-hint danger-txt">메뉴를 {c.count}개 이상 골라 주십시오</p>}
        </div>
      ))}
      <button type="button" className="btn-outline" onClick={() => setComps((p) => [...p, { category: 'PASTA', count: 1, menu_ids: [], extras: {} }])}>+ 구성 추가</button>
      <p className="f-hint">메뉴를 고른 뒤 옆 칸에 숫자를 넣으면 그 메뉴를 고를 때 추가금이 붙습니다.</p>

      {koChanged && hasTr && (
        <p className="tr-note">한국어 이름·설명을 바꿨습니다. <b>저장하면 바뀐 부분의 외국어도 새로 번역합니다.</b> (직접 고친 번역은 그대로 둡니다)</p>
      )}
      <div className="langbox">
        <button type="button" className="langbox-head" aria-expanded={langOpen} onClick={() => setLangOpen(!langOpen)}>
          <span>외국어 (영어 · 일본어 · 중국어)</span>
          <span className="meta">{TR_LANGS.some((l) => hasHangul(f[`name_${l}`]) || hasHangul(f[`description_${l}`])) ? '⚠ 확인 필요' : f.name_en && f.name_ja && f.name_zh ? '입력됨' : '저장하면 자동 번역됩니다'} {langOpen ? '▲' : '▼'}</span>
        </button>
        {langOpen && (
          <div className="langbox-body">
            <div className="tr-btns">
              <button type="button" className="btn-outline btn-sm" disabled={busy || !f.name.trim()} onClick={() => void translate(false)}>빈 칸 자동 번역</button>
              <button type="button" className="btn-outline btn-sm" disabled={busy || !f.name.trim()} onClick={() => void translate(true)}>전부 다시 번역</button>
            </div>
            <p className="f-hint">저장하면 빈 칸은 자동으로 번역됩니다. 자동 번역은 틀릴 수 있으니 꼭 확인해 주십시오.</p>
            {TR_LANGS.map((l) => (
              <div className="f-row" key={l}>
                <Field label={{ en: '영어', ja: '일본어', zh: '중국어' }[l]}>
                  <input className={`inp${hasHangul(f[`name_${l}`]) ? ' inp--warn' : ''}`} value={f[`name_${l}`]} onChange={(e) => set_(`name_${l}`, e.target.value)} />
                  {hasHangul(f[`name_${l}`]) && <span className="tr-warn">한글이 남아 있습니다. 고쳐 주십시오</span>}
                </Field>
                <Field label="구성 설명">
                  <input className={`inp${hasHangul(f[`description_${l}`]) ? ' inp--warn' : ''}`} value={f[`description_${l}`]} onChange={(e) => set_(`description_${l}`, e.target.value)} />
                  {hasHangul(f[`description_${l}`]) && <span className="tr-warn">한글이 남아 있습니다. 고쳐 주십시오</span>}
                </Field>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirm === 'delete' && set && (
        <Confirm
          title="세트를 삭제하시겠습니까?"
          danger
          body={<p><strong>{set.name}</strong>을(를) 삭제하면 되돌릴 수 없습니다. 잠깐 안 팔 거라면 <strong>숨김</strong>을 쓰십시오.</p>}
          okLabel="삭제"
          onCancel={() => setConfirm(null)}
          onOk={async () => {
            setConfirm(null);
            setBusy(true);
            try { await deleteSet(set.id); await onSaved('세트를 삭제했습니다'); } catch (e) { onError('삭제하지 못했습니다: ' + (e as Error).message); setBusy(false); }
          }}
        />
      )}
    </Drawer>
  );
}
