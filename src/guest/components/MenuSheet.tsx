import { useEffect, useState } from 'react';
import { descOf, isSoldOut, nameOf, subNameOf, won } from '../../lib/menu';
import type { Lang, Menu } from '../../lib/types';
import type { StringKey } from '../../i18n/strings';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

interface Props {
  menu: Menu | null;
  lang: Lang;
  canOrder: boolean;
  t: (k: StringKey, v?: Record<string, string | number>) => string;
  onClose: () => void;
  onAdd: (id: number, qty: number) => void;
}

export function MenuSheet({ menu, lang, canOrder, t, onClose, onAdd }: Props) {
  const [qty, setQty] = useState(1);
  useEffect(() => setQty(1), [menu?.id]);
  if (!menu) return null;
  const so = isSoldOut(menu);
  const desc = descOf(menu, lang);
  return (
    <Sheet open onClose={onClose} label={nameOf(menu, lang)} closeLabel={t('close')}>
      {menu.image_url && <img className="sheet-img" src={menu.image_url} alt={nameOf(menu, lang)} />}
      <div className="sheet-body">
        <div className="sheet-sub serif-it">{subNameOf(menu, lang)}</div>
        <h2 className="sheet-title">{nameOf(menu, lang)}</h2>
        {desc && <p className="sheet-desc">{desc}</p>}
        <div className="sheet-actions">
          <Stepper value={qty} min={1} onChange={setQty} size="lg" />
          <button type="button" className="btn-primary grow" disabled={so || !canOrder} onClick={() => { onAdd(menu.id, qty); onClose(); }}>
            {so ? t('soldOut') : t('addWithPrice', { price: won(menu.price * qty) })}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
