import { useMemo, useState } from 'react';
import { isSoldOut, nextKstMidnightIso, won } from '../../lib/menu';
import type { CategoryLabels, Menu } from '../../lib/types';
import { autoTranslate, createMenu, deleteMenu, saveMenu, saveOrder, uploadImage } from './api';
import { Confirm, Drawer, Field, Toggle } from './ui';

interface Props {
  menus: Menu[];
  labels: CategoryLabels;
  reload: () => Promise<void>;
  toast: (t: string, bad?: boolean) => void;
}

const catName = (labels: CategoryLabels, c: string) => labels[c]?.ko || c;

export function MenuTab({ menus, labels, reload, toast }: Props) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Menu | 'new' | null>(null);

  const cats = useMemo(() => {
    const order: string[] = [];
    [...menus].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).forEach((m) => !order.includes(m.category) && order.push(m.category));
    return order;
  }, [menus]);

  const byCat = (c: string) =>
    menus.filter((m) => m.category === c && (!q.trim() || m.name.includes(q.trim()))).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      await reload();
    } catch (e) {
      toast('저장하지 못했어요: ' + (e as Error).message, true);
    }
  };

  const move = (c: string, idx: number, dir: -1 | 1) => {
    const list = byCat(c);
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[idx], b = list[j];
    const sa = a.sort_order ?? 0, sb = b.sort_order ?? 0;
    void run(() => saveOrder([{ id: a.id, sort_order: sb === sa ? sa + dir : sb }, { id: b.id, sort_order: sa }]), '순서를 바꿨어요');
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
                  <div className={`mitem${m.is_hidden ? ' is-hidden' : ''}`} key={m.id}>
                    <div className="order-btns">
                      <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(c, i, -1)}>▲</button>
                      <button type="button" aria-label="아래로" disabled={i === list.length - 1} onClick={() => move(c, i, 1)}>▼</button>
                    </div>
                    {m.image_url ? <img src={m.image_url} alt="" /> : <span className="noimg">사진 없음</span>}
                    <button type="button" className="mitem-main" onClick={() => setEditing(m)}>
                      <strong>{m.name}</strong>
                      <span className="meta">{m.name_en || '영어 이름 없음'}</span>
                    </button>
                    <span className="mitem-price">{won(m.price)}원</span>
                    <Toggle
                      on={!sold}
                      label={`${m.name} 판매 상태`}
                      onText="판매 중"
                      offText="품절"
                      onChange={() => void run(() => saveMenu(m.id, sold ? { is_available: true, sold_out_until: null } : { is_available: false, sold_out_until: nextKstMidnightIso() }), sold ? '판매 중으로 바꿨어요' : '오늘 품절로 바꿨어요 (자정에 자동 해제)')}
                    />
                    <Toggle
                      on={!m.is_hidden}
                      label={`${m.name} 노출`}
                      onText="보임"
                      offText="숨김"
                      onChange={() => void run(() => saveMenu(m.id, { is_hidden: !m.is_hidden }), m.is_hidden ? '손님 화면에 다시 보여요' : '손님 화면에서 숨겼어요')}
                    />
                    <button type="button" className="btn-outline btn-sm" onClick={() => setEditing(m)}>수정</button>
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
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const price = Number(f.price.replace(/[^0-9]/g, ''));
  const valid = f.name.trim() && price > 0 && f.category;
  const priceChanged = !!menu && price !== menu.price;

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      set('image_url', await uploadImage(file, 'menus'));
    } catch (e) {
      onError('사진을 올리지 못했어요: ' + (e as Error).message);
    }
    setBusy(false);
  };

  const translate = async () => {
    setBusy(true);
    try {
      const next = { ...f };
      for (const l of ['en', 'ja', 'zh'] as Lang3[]) {
        if (!next[`name_${l}`]) next[`name_${l}`] = await autoTranslate(f.name, l);
        if (!next[`description_${l}`] && f.description) next[`description_${l}`] = await autoTranslate(f.description, l);
      }
      setF(next);
      setLangOpen(true);
    } catch (e) {
      onError('자동 번역에 실패했어요: ' + (e as Error).message);
    }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    const row: Partial<Menu> = {
      name: f.name.trim(), price, description: f.description.trim() || null, category: f.category, image_url: f.image_url || null,
      name_en: f.name_en.trim() || null, description_en: f.description_en.trim() || null,
      name_ja: f.name_ja.trim() || null, description_ja: f.description_ja.trim() || null,
      name_zh: f.name_zh.trim() || null, description_zh: f.description_zh.trim() || null,
    };
    try {
      if (menu) await saveMenu(menu.id, row);
      else await createMenu({ ...row, sort_order: nextSort, is_available: true, is_hidden: false });
      await onSaved(menu ? '저장했어요' : '메뉴를 추가했어요');
    } catch (e) {
      onError('저장하지 못했어요: ' + (e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteMenu(menu!.id);
      await onSaved('메뉴를 삭제했어요');
    } catch (e) {
      onError('삭제하지 못했어요: ' + (e as Error).message);
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
            {busy ? '저장 중…' : '저장'}
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
      <Field label="설명" hint="손님 화면에서 메뉴 이름 아래에 작게 보여요">
        <textarea className="inp" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
      </Field>

      <div className="langbox">
        <button type="button" className="langbox-head" aria-expanded={langOpen} onClick={() => setLangOpen(!langOpen)}>
          <span>외국어 (영어 · 일본어 · 중국어)</span>
          <span className="meta">{f.name_en && f.name_ja && f.name_zh ? '입력됨' : '비어 있는 칸은 한국어로 보여요'} {langOpen ? '▲' : '▼'}</span>
        </button>
        {langOpen && (
          <div className="langbox-body">
            <button type="button" className="btn-outline btn-sm" disabled={busy || !f.name.trim()} onClick={() => void translate()}>빈 칸 자동 번역</button>
            <p className="f-hint">자동 번역은 틀리는 경우가 많아요. 특히 메뉴 이름은 꼭 확인해 주세요.</p>
            {(['en', 'ja', 'zh'] as Lang3[]).map((l) => (
              <div className="f-row" key={l}>
                <Field label={{ en: '영어 이름', ja: '일본어 이름', zh: '중국어 이름' }[l]}>
                  <input className="inp" value={f[`name_${l}`]} onChange={(e) => set(`name_${l}`, e.target.value)} />
                </Field>
                <Field label="설명">
                  <input className="inp" value={f[`description_${l}`]} onChange={(e) => set(`description_${l}`, e.target.value)} />
                </Field>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirm === 'price' && menu && (
        <Confirm
          title="가격을 바꿀까요?"
          body={<p><strong>{menu.name}</strong><br />{won(menu.price)}원 → <strong>{won(price)}원</strong></p>}
          okLabel="가격 바꾸기"
          onCancel={() => setConfirm(null)}
          onOk={() => { setConfirm(null); void save(); }}
        />
      )}
      {confirm === 'delete' && menu && (
        <Confirm
          title="메뉴를 삭제할까요?"
          danger
          body={<p><strong>{menu.name}</strong>을(를) 삭제하면 되돌릴 수 없어요.<br />잠깐 안 팔 메뉴라면 목록에서 <strong>숨김</strong>을 쓰세요.</p>}
          okLabel="삭제"
          onCancel={() => setConfirm(null)}
          onOk={() => { setConfirm(null); void remove(); }}
        />
      )}
    </Drawer>
  );
}
