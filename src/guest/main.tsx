import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/guest.css';
import { GuestApp } from './GuestApp';
import { isPreview } from '../lib/preview';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GuestApp />
    {isPreview && window.self === window.top && <div className="preview-badge" aria-hidden="true">미리보기 · 주문 안 됨</div>}
  </StrictMode>,
);
