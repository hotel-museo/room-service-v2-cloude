import { useEffect, useMemo, useState } from 'react';
import { descOf, isSoldOut, nameOf, subNameOf, won } from '../../lib/menu';
import { defaultSelection, groupsFor, isSelectionValid, optionsPrice } from '../../lib/options';
import type { Lang, Menu, OptionLinks } from '../../lib/types';
import type { StringKey } from '../../i18n/strings';
import { OptionGroups } from './OptionGroups';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

interface Props {
  menu: Menu | null;
  links: OptionLinks;
  lang: Lang;
  canOrder: boolean;
  t: (k: StringKey, v?: Record<string, string | number>) => string;
  onClose: () => void;
  onAdd: (id: number, qty: number, options: number[]) => void;
}

export function MenuSheet({ menu, links, lang, canOrder, t, onClose, onAdd }: Props) {
  const groups = useMemo(() => (menu ? groupsFor(links, 'menu', menu.id) : []), [menu, links]);
  const [qty, setQty] = useState(1);
  const [opts, setOpts] = useState<number[]>([]);
  useEffect(() => {
    setQty(1);
    setOpts(defaultSelection(groups));
  }, [menu?.id, groups]);
  if (!menu) return null;

  const so = isSoldOut(menu);
  const desc = descOf(menu, lang);
  const valid = isSelectionValid(groups, opts);
  const unit = menu.price + optionsPrice(links, opts);

  let label = t('addWithPrice', { price: won(unit * qty) });
  if (so) label = t('soldOut');
  else if (!valid) label = t('chooseRequired');

  return (
    <Sheet open onClose={onClose} label={nameOf(menu, lang)} closeLabel={t('close')}>
      {menu.image_url && <img className="sheet-img" src={menu.image_url} alt={nameOf(menu, lang)} />}
      <div className="sheet-body">
        <div className="sheet-sub serif-it">{subNameOf(menu, lang)}</div>
        <h2 className="sheet-title">{nameOf(menu, lang)}</h2>
        <div className="sheet-price">{won(menu.price)}</div>
        {desc && <p className="sheet-desc">{desc}</p>}
        {groups.length > 0 && <OptionGroups groups={groups} selected={opts} onChange={setOpts} lang={lang} t={t} />}
        <div className="sheet-actions sheet-actions--sticky">
          <Stepper value={qty} min={1} onChange={setQty} size="lg" />
          <button type="button" className="btn-primary grow" disabled={so || !canOrder || !valid} onClick={() => { onAdd(menu.id, qty, opts); onClose(); }}>
            {label}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
