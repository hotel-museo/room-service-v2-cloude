import { won } from '../../lib/menu';
import { groupDesc, optName, toggleOption } from '../../lib/options';
import type { Lang, OptionGroup } from '../../lib/types';
import type { StringKey } from '../../i18n/strings';
import { Check } from './Icons';

interface Props {
  groups: OptionGroup[];
  selected: number[];
  onChange: (ids: number[]) => void;
  lang: Lang;
  t: (k: StringKey, v?: Record<string, string | number>) => string;
}

/** 메뉴·세트 옵션 선택 (필수는 라디오, 선택은 체크) */
export function OptionGroups({ groups, selected, onChange, lang, t }: Props) {
  return (
    <>
      {groups.map((g) => {
        const radio = g.min_select === 1 && g.max_select === 1;
        const count = g.option_items.filter((i) => selected.includes(i.id)).length;
        const full = !radio && count >= g.max_select;
        const desc = groupDesc(g, lang);
        return (
          <fieldset className="optgroup" key={g.id}>
            <legend>
              <span>{optName(g, lang)}</span>
              <span className={g.min_select > 0 ? 'opt-req' : 'opt-free'}>
                {g.min_select > 0 ? t('required') : g.max_select > 1 ? t('upTo', { n: g.max_select }) : t('optional')}
              </span>
            </legend>
            {desc && <p className="optdesc">{desc}</p>}
            <div className="optlist">
              {g.option_items.map((it) => {
                const on = selected.includes(it.id);
                const disabled = !on && full;
                return (
                  <button
                    type="button"
                    key={it.id}
                    role={radio ? 'radio' : 'checkbox'}
                    aria-checked={on}
                    disabled={disabled}
                    className={`optrow${on ? ' is-on' : ''}`}
                    onClick={() => onChange(toggleOption(groups, selected, it))}
                  >
                    <span className={radio ? 'radio' : 'box'}>{!radio && on && <Check />}</span>
                    <span className="optrow-name">{optName(it, lang)}</span>
                    <span className="optrow-price">{it.price > 0 ? `+${won(it.price)}` : ''}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}
