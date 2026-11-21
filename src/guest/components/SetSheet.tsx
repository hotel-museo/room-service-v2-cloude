import { useEffect, useMemo, useState } from 'react';
import { descOf, isSoldOut, nameOf, setComponents, won } from '../../lib/menu';
import { defaultSelection, groupsFor, isSelectionValid, optionsPrice, setExtras } from '../../lib/options';
import type { CategoryLabels, Lang, Menu, OptionLinks, SetMenu } from '../../lib/types';
import { OptionGroups } from './OptionGroups';
import type { StringKey } from '../../i18n/strings';
import { Check } from './Icons';
import { Sheet } from './Sheet';

interface Props {
  set: SetMenu | null;
  menus: Menu[];
  links: OptionLinks;
  labels: CategoryLabels;
  lang: Lang;
  canOrder: boolean;
  isCut: (m: Menu) => boolean;
  t: (k: StringKey, v?: Record<string, string | number>) => string;
  onClose: () => void;
  onAdd: (setId: number, choices: { category: string; ids: number[] }[], options: number[]) => void;
}

/** 세트 구성 선택. 같은 메뉴를 여러 번 고를 수 있도록 개수로 관리합니다 (예: 짬뽕 택 2). */
export function SetSheet({ set, menus, links, labels, lang, canOrder, isCut, t, onClose, onAdd }: Props) {
  const comps = useMemo(() => (set ? setComponents(set) : []), [set]);
  const groups = useMemo(() => (set ? groupsFor(links, 'set', set.id) : []), [set, links]);
  const [picked, setPicked] = useState<number[][]>([]);
  const [opts, setOpts] = useState<number[]>([]);
  useEffect(() => {
    setPicked(comps.map(() => []));
    setOpts(defaultSelection(groups));
  }, [set?.id, comps, groups]);
  if (!set) return null;

  const byId = new Map(menus.map((m) => [m.id, m]));
  const label = (cat: string) => labels[cat]?.[lang] || labels[cat]?.ko || cat;
  const complete = comps.every((c, i) => (picked[i]?.length ?? 0) === c.count);
  const optsValid = isSelectionValid(groups, opts);
  const unit = set.price + setExtras(set, picked.map((ids) => ({ ids }))) + optionsPrice(links, opts);

  const toggle = (ci: number, id: number) =>
    setPicked((prev) => {
      const next = prev.map((a) => [...a]);
      const cur = next[ci] ?? [];
      const cap = comps[ci].count;
      if (cap === 1) next[ci] = cur[0] === id ? [] : [id];
      else if (cur.length < cap) next[ci] = [...cur, id];
      else {
        const idx = cur.indexOf(id);
        next[ci] = idx >= 0 ? cur.filter((_, i) => i !== idx) : cur;
      }
      return next;
    });

  const removeOne = (ci: number, id: number) =>
    setPicked((prev) => prev.map((a, i) => {
      if (i !== ci) return a;
      const idx = a.lastIndexOf(id);
      return idx >= 0 ? a.filter((_, j) => j !== idx) : a;
    }));

  return (
    <Sheet open onClose={onClose} label={nameOf(set, lang)} closeLabel={t('close')}>
      {set.image_url && <img className="sheet-img sheet-img--short" src={set.image_url} alt={nameOf(set, lang)} />}
      <div className="sheet-body">
        <div className="sheet-sub serif-it">{t('setLabel')}</div>
        <h2 className="sheet-title">{nameOf(set, lang)}</h2>
        <p className="sheet-desc">{descOf(set, lang) || set.description}</p>

        {comps.map((c, ci) => {
          const mine = picked[ci] ?? [];
          const options = c.menuIds.map((id) => byId.get(id)).filter((m): m is Menu => !!m && !m.is_hidden);
          return (
            <fieldset className="setgroup" key={ci}>
              <legend>
                <span>{t('setChoose', { label: label(c.category), n: c.count })}</span>
                <span className={`setcount${mine.length === c.count ? ' is-done' : ''}`}>{t('setChosen', { done: mine.length, n: c.count })}</span>
              </legend>
              <div className="setopts">
                {options.map((m) => {
                  const n = mine.filter((x) => x === m.id).length;
                  const so = isSoldOut(m) || isCut(m);
                  return (
                    <div key={m.id} className={`setopt${n ? ' is-on' : ''}${so ? ' is-soldout' : ''}`}>
                      <button type="button" disabled={so} onClick={() => toggle(ci, m.id)} aria-pressed={n > 0}>
                        {m.image_url ? <img src={m.image_url} alt="" loading="lazy" /> : <span className="setopt-noimg" />}
                        <span className="setopt-name">{nameOf(m, lang)}</span>
                        {c.extras[String(m.id)] ? <span className="setopt-extra">+{won(c.extras[String(m.id)])}</span> : null}
                        {so && <span className="soldout-tag">{t('soldOut')}</span>}
                        {n > 0 && <span className="setopt-check">{c.count > 1 ? n : <Check />}</span>}
                      </button>
                      {n > 0 && c.count > 1 && (
                        <button type="button" className="setopt-minus" aria-label="−" onClick={() => removeOne(ci, m.id)}>−</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {groups.length > 0 && <OptionGroups groups={groups} selected={opts} onChange={setOpts} lang={lang} t={t} />}

        <div className="sheet-actions sheet-actions--sticky">
          <button
            type="button"
            className="btn-primary grow"
            disabled={!complete || !optsValid || !canOrder}
            onClick={() => { onAdd(set.id, comps.map((c, i) => ({ category: c.category, ids: picked[i] ?? [] })), opts); onClose(); }}
          >
            {!complete ? t('setIncomplete') : !optsValid ? t('chooseRequired') : t('addWithPrice', { price: won(unit) })}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
