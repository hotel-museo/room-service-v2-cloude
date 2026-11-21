import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import '../styles/admin.css';
import { supabase } from '../lib/supabase';
import { Board } from './Board';
import { Login } from './Login';

function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    if (!session) { setRole(null); return; }
    void supabase.rpc('my_role').then(({ data }) => {
      const r = (data as string) ?? 'admin';
      if (r === 'front') location.replace('../front/');
      else setRole(r);
    });
  }, [session]);

  if (session === undefined || (session && role === null)) return <div className="boot">PASTA HOUSE</div>;
  return session ? <Board /> : <Login />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
