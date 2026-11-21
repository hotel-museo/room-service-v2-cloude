import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/guest.css';
import { GuestApp } from './GuestApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GuestApp />
  </StrictMode>,
);
