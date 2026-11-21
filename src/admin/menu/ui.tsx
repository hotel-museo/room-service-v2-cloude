import { useEffect, useState, type ReactNode } from 'react';

/** 오른쪽에서 열리는 편집 창 */
export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="drawer-layer">
      <button type="button" className="modal-backdrop" aria-label="닫기" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-x" aria-label="닫기" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>
  );
}

/** 확인 창 (가격 변경, 삭제 등) */
export function Confirm({ title, body, okLabel, danger, onOk, onCancel }: { title: string; body: ReactNode; okLabel: string; danger?: boolean; onOk: () => void; onCancel: () => void }) {
  return (
    <div className="modal-layer modal-layer--top">
      <button type="button" className="modal-backdrop" aria-label="취소" onClick={onCancel} />
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="modal-body">{body}</div>
        <div className="row-btns">
          <button type="button" className="btn-outline" onClick={onCancel}>취소</button>
          <button type="button" className={danger ? 'btn-danger wide' : 'btn-green wide'} onClick={onOk}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label, onText, offText }: { on: boolean; onChange: () => void; label: string; onText: string; offText: string }) {
  return (
    <button type="button" className="toggle" role="switch" aria-checked={on} aria-label={label} onClick={onChange}>
      <span className={on ? 'lbl-on' : 'lbl-off'}>{on ? onText : offText}</span>
      <span className={`switch${on ? ' is-on' : ''}`}><span /></span>
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="f">
      <span className="f-label">{label}</span>
      {children}
      {hint && <span className="f-hint">{hint}</span>}
    </label>
  );
}

/** 저장 결과 알림 (3초 뒤 사라짐) */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => setMsg(null), 3000);
    return () => window.clearTimeout(id);
  }, [msg]);
  const node = msg ? <div className={`toast${msg.bad ? ' toast--bad' : ''}`} role="status">{msg.text}</div> : null;
  return { show: (text: string, bad = false) => setMsg({ text, bad }), node };
}
