import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { CONTACT_KEYS, CONTACT_LABEL_KO, EMPTY_CONTACTS, type Contacts } from './contacts';
import { notifyPreview } from './preview';

/** 관리자 설정 > 손님 '문의하기' 연락처. 비워둔 곳은 손님 화면에 안 나와요. */
export function ContactsSection({ toast }: { toast: (m: string, bad?: boolean) => void }) {
  const [saved, setSaved] = useState<Contacts | null>(null);
  const [form, setForm] = useState<Contacts>(EMPTY_CONTACTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from('site_settings').select('settings').eq('key', 'contacts').maybeSingle().then(({ data }) => {
      const v = { ...EMPTY_CONTACTS, ...((data?.settings as Partial<Contacts>) ?? {}) };
      setSaved(v);
      setForm(v);
    });
  }, []);

  const clean = (v: string) => v.replace(/[^0-9+\-() ]/g, '').slice(0, 20);
  const changed = !!saved && CONTACT_KEYS.some((k) => form[k].trim() !== saved[k].trim());

  const save = async () => {
    setBusy(true);
    try {
      const v = Object.fromEntries(CONTACT_KEYS.map((k) => [k, form[k].trim()])) as unknown as Contacts;
      const { error } = await supabase.from('site_settings').upsert({ key: 'contacts', settings: v, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      setSaved(v);
      notifyPreview();
      toast('연락처를 저장했어요');
    } catch (e) {
      toast('저장하지 못했어요: ' + (e as Error).message, true);
    }
    setBusy(false);
  };

  return (
    <section className="panel">
      <h2 className="fd-h2">손님 '문의하기' 연락처</h2>
      <p className="meta">손님 첫 화면의 <b>문의하기</b>를 누르면 나와요. 번호를 누르면 바로 전화가 걸려요. 비워둔 곳은 안 보여요.</p>
      <div className="fd-contacts">
        {CONTACT_KEYS.map((k) => (
          <label key={k} className="fd-contact">
            <span className="f-label">{CONTACT_LABEL_KO[k]}</span>
            <input className="inp" type="tel" inputMode="tel" placeholder="예: 02-123-4567" value={form[k]} onChange={(e) => setForm({ ...form, [k]: clean(e.target.value) })} />
          </label>
        ))}
      </div>
      <div>
        <button type="button" className="btn-green" disabled={busy || !changed} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </section>
  );
}
