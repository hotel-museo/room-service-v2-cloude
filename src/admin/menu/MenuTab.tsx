import { changedBases, fillTranslations, hasHangul, TR_LANGS } from './translate';
import { useRef, useState } from 'react';
import { isSoldOut, nextKstMidnightIso, won } from '../../lib/menu';
import type { CategoryLabels, Menu } from '../../lib/types';
import { createMenu, deleteMenu, saveMenu, saveOrder, uploadImage } from './api';
import { Confirm, Drawer, Field, Toggle } from './ui';

interface Props {
  menus: Menu[];
  cats: string[];
  labels: CategoryLabels;
  reload: () => Promise<void>;
  toast: (t: string, bad?: boolean) => void;
}

const catName = (labels: CategoryLabels, c: string) => labels[c]?.ko || c;

export function MenuTab({ menus, cats, labels, reload, toast }: Props) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Menu | 'new' | null>(null);

  const byCat = (c: string) =>
    menus.filter((m) => m.category === c && (!q.trim() || m.name.includes(q.trim()))).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      await reload();
    } catch (e) {
      toast('저장하지 못했습니다: ' + (e as Error).message, true);
    }
  };

  const move = (c: string, idx: number, dir: -1 | 1) => {
    const list = byCat(c);
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[idx], b = list[j];
    const sa = a.sort_order ?? 0, sb = b.sort_order ?? 0;
    void run(() => saveOrder([{ id: a.id, sort_order: sb === sa ? sa + dir : sb }, { id: b.id, sort_order: sa }]), '순서를 바꿨습니다');
  };

  return (
    <div className="mtab">
      <div className="mtab-bar">
        <input className="search search--wide" placeholder="메뉴 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="메뉴 검색" />
        <button type="button" className="btn-green" onClick={() => setEditing('new')}>+ 메뉴 추가</button>
      </div>

      {cats.map((c) => {
        const list = byCat(c);
        if (!list.length) return null;
        return (
          <section className="mcat" key={c}>
            <h3>{catName(labels, c)} <span className="meta">{list.length}개</span></h3>
            <div className="mlist">
              {list.map((m, i) => {
                const sold = isSoldOut(m);
                return (
                  <div className={`mitem mitem--menu${m.is_hidden ? ' is-hidden' : ''}`} key={m.id}>
                    <div className="order-btns">
                      <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(c, i, -1)}>▲</button>
                      <button type="button" aria-label="아래로" disabled={i === list.length - 1} onClick={() => move(c, i, 1)}>▼</button>
                    </div>
                    {m.image_url ? <img src={m.image_url} alt="" /> : <span className="noimg">사진 없음</span>}
                    <button type="button" className="mitem-main" onClick={() => setEditing(m)}>
                      <strong>{m.name}{sold && <em className="flag flag--red">품절</em>}{m.is_hidden && <em className="flag">숨김</em>}</strong>
                      <span className="meta">{m.name_en || '영어 이름 없음'}</span>
                    </button>
                    <span className="mitem-price">{won(m.price)}원</span>
                    <Toggle
                      on={!sold}
                      label={`${m.name} 판매 상태`}
                      onText="판매 중"
                      offText="품절"
                      onChange={() => void run(() => saveMenu(m.id, sold ? { is_available: true, sold_out_until: null } : { is_available: false, sold_out_until: nextKstMidnightIso() }), sold ? '판매 중으로 바꿨습니다' : '오늘 품절로 바꿨습니다 (자정에 자동 해제)')}
                    />
                    <Toggle
                      on={!m.is_hidden}
                      label={`${m.name} 노출`}
                      onText="보임"
                      offText="숨김"
                      onChange={() => void run(() => saveMenu(m.id, { is_hidden: !m.is_hidden }), m.is_hidden ? '손님 화면에 다시 보입니다' : '손님 화면에서 숨겼습니다')}
                    />
                    <button type="button" className="edit-btn" onClick={() => setEditing(m)} aria-label={`${m.name} 수정`} title="수정">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14 7l3 3" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {editing && (
        <MenuEditor
          menu={editing === 'new' ? null : editing}
          cats={cats}
          labels={labels}
          nextSort={Math.max(0, ...menus.map((m) => m.sort_order ?? 0)) + 1}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); toast(msg); await reload(); }}
          onError={(msg) => toast(msg, true)}
        />
      )}
    </div>
  );
}

type Lang3 = 'en' | 'ja' | 'zh';

function MenuEditor({ menu, cats, labels, nextSort, onClose, onSaved, onError }: {
  menu: Menu | null;
  cats: string[];
  labels: CategoryLabels;
  nextSort: number;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [f, setF] = useState({
    name: menu?.name ?? '',
    price: String(menu?.price ?? ''),
    description: menu?.description ?? '',
    category: menu?.category ?? cats[0] ?? '',
    image_url: menu?.image_url ?? '',
    name_en: menu?.name_en ?? '', description_en: menu?.description_en ?? '',
    name_ja: menu?.name_ja ?? '', description_ja: menu?.description_ja ?? '',
    name_zh: menu?.name_zh ?? '', description_zh: menu?.description_zh ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [langOpen, setLangOpen] = useState(!menu);
  const [confirm, setConfirm] = useState<'price' | 'delete' | null>(null);
  // 직원이 직접 고친 번역 칸 (저장할 때 자동 번역으로 덮어쓰지 않아요)
  const touched = useRef(new Set<string>());
  const set = (k: keyof typeof f, v: string) => {
    if (/_(en|ja|zh)$/.test(k)) touched.current.add(k);
    setF((p) => ({ ...p, [k]: v }));
  };
  const koChanged = changedBases(f, ['name', 'description'], menu as unknown as Record<string, unknown>).length > 0;
  const hasTr = TR_LANGS.some((l) => f[`name_${l}`] || f[`description_${l}`]);

  const price = Number(f.price.replace(/[^0-9]/g, ''));
  const valid = f.name.trim() && price > 0 && f.category;
  const priceChanged = !!menu && price !== menu.price;

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      set('image_url', await uploadImage(file, 'menus'));
    } catch (e) {
      onError('사진을 올리지 못했습니다: ' + (e as Error).message);
    }
    setBusy(false);
  };

  /** force=false: 빈 칸 + 한국어가 바뀐 부분만, force=true: 전부 다시 */
  const translate = async (force: boolean) => {
    setBusy(true);
    const { next, failed } = await fillTranslations(f, ['name', 'description'], { orig: menu as unknown as Record<string, unknown>, touched: touched.current, force });
    if (force) touched.current.clear();
    setF(next);
    setLangOpen(true);
    if (failed) onError('일부를 자동 번역하지 못했습니다. 잠시 후 다시 누르거나 직접 입력해 주십시오.');
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    // 저장 전에: 빈 번역 칸 채우기 + 한국어가 바뀐 부분 다시 번역 (직접 고친 번역은 그대로)
    const { next: g, failed } = await fillTranslations(f, ['name', 'description'], { orig: menu as unknown as Record<string, unknown>, touched: touched.current });
    setF(g);
    const row: Partial<Menu> = {
      name: g.name.trim(), price, description: g.description.trim() || null, category: g.category, image_url: g.image_url || null,
      name_en: g.name_en.trim() || null, description_en: g.description_en.trim() || null,
      name_ja: g.name_ja.trim() || null, description_ja: g.description_ja.trim() || null,
      name_zh: g.name_zh.trim() || null, description_zh: g.description_zh.trim() || null,
    };
    try {
      if (menu) await saveMenu(menu.id, row);
      else await createMenu({ ...row, sort_order: nextSort, is_available: true, is_hidden: false });
      await onSaved((menu ? '저장했습니다' : '메뉴를 추가했습니다') + (failed ? ' (일부 번역 실패 — 외국어 칸을 확인해 주십시오)' : ''));
    } catch (e) {
      onError('저장하지 못했습니다: ' + (e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteMenu(menu!.id);
      await onSaved('메뉴를 삭제했습니다');
    } catch (e) {
      onError('삭제하지 못했습니다: ' + (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={menu ? '메뉴 수정' : '새 메뉴'}
      onClose={onClose}
      footer={
        <>
          {menu && <button type="button" className="btn-outline danger" onClick={() => setConfirm('delete')} disabled={busy}>삭제</button>}
          <div className="grow" />
          <button type="button" className="btn-outline" onClick={onClose}>취소</button>
          <button type="button" className="btn-green" disabled={!valid || busy} onClick={() => (priceChanged ? setConfirm('price') : void save())}>
            {busy ? '저장 중… (번역 포함)' : '저장'}
          </button>
        </>
      }
    >
      <div className="photo">
        {f.image_url ? <img src={f.image_url} alt="" /> : <span className="noimg noimg--lg">사진 없음</span>}
        <div className="photo-btns">
          <label className="btn-outline btn-file">
            {f.image_url ? '사진 바꾸기' : '사진 올리기'}
            <input type="file" accept="image/*" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
          {f.image_url && <button type="button" className="link" onClick={() => set('image_url', '')}>사진 빼기</button>}
        </div>
      </div>

      <Field label="메뉴 이름">
        <input className="inp" value={f.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <div className="f-row">
        <Field label="가격 (원)">
          <input className="inp" inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
        <Field label="카테고리">
          <select className="inp" value={f.category} onChange={(e) => set('category', e.target.value)}>
            {cats.map((c) => <option key={c} value={c}>{catName(labels, c)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="설명" hint="손님 화면에서 메뉴 이름 아래에 작게 보입니다">
        <textarea className="inp" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
      </Field>

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
            <p className="f-hint">저장하면 빈 칸은 자동으로 번역됩니다. 자동 번역은 틀릴 수 있으니 특히 메뉴 이름은 꼭 확인해 주십시오.</p>
            {(['en', 'ja', 'zh'] as Lang3[]).map((l) => (
              <div className="f-row" key={l}>
                <Field label={{ en: '영어 이름', ja: '일본어 이름', zh: '중국어 이름' }[l]}>
                  <input className={`inp${hasHangul(f[`name_${l}`]) ? ' inp--warn' : ''}`} value={f[`name_${l}`]} onChange={(e) => set(`name_${l}`, e.target.value)} />
                  {hasHangul(f[`name_${l}`]) && <span className="tr-warn">한글이 남아 있습니다. 고쳐 주십시오</span>}
                </Field>
                <Field label="설명">
                  <input className={`inp${hasHangul(f[`description_${l}`]) ? ' inp--warn' : ''}`} value={f[`description_${l}`]} onChange={(e) => set(`description_${l}`, e.target.value)} />
                  {hasHangul(f[`description_${l}`]) && <span className="tr-warn">한글이 남아 있습니다. 고쳐 주십시오</span>}
                </Field>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirm === 'price' && menu && (
        <Confirm
          title="가격을 바꾸시겠습니까?"
          body={<p><strong>{menu.name}</strong><br />{won(menu.price)}원 → <strong>{won(price)}원</strong></p>}
          okLabel="가격 바꾸기"
          onCancel={() => setConfirm(null)}
          onOk={() => { setConfirm(null); void save(); }}
        />
      )}
      {confirm === 'delete' && menu && (
        <Confirm
          title="메뉴를 삭제하시겠습니까?"
          danger
          body={<p><strong>{menu.name}</strong>을(를) 삭제하면 되돌릴 수 없습니다.<br />잠깐 안 팔 메뉴라면 목록에서 <strong>숨김</strong>을 쓰십시오.</p>}
          okLabel="삭제"
          onCancel={() => setConfirm(null)}
          onOk={() => { setConfirm(null); void remove(); }}
        />
      )}
    </Drawer>
  );
}
