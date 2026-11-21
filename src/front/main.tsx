import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import '../styles/admin.css';
import { supabase } from '../lib/supabase';
import { Login } from '../admin/Login';
import { FrontApp } from './FrontApp';

function FrontRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="boot">HOTEL MUSEO</div>;
  return session ? <FrontApp /> : <Login sub="FRONT DESK" title="프런트 로그인" />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FrontRoot />
  </StrictMode>,
);
