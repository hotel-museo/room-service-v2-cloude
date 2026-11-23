import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import '../styles/admin.css';
import { supabase } from '../lib/supabase';
import { Board } from './Board';
import { Login } from './Login';

/** 로그인은 됐지만 직원 명단(staff_roles)에 없는 계정 */
function NoAccess() {
  return (
    <div className="login">
      <div className="login-card">
        <h1>권한이 없는 계정이에요</h1>
        <p className="meta">이 계정은 직원 명단에 등록되어 있지 않아요. 관리자에게 등록을 요청해 주세요.</p>
        <button type="button" className="btn-green" onClick={() => void supabase.auth.signOut()}>로그아웃</button>
      </div>
    </div>
  );
}

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
      const r = (data as string) ?? 'none';
      if (r === 'front') location.replace('../front/');
      else setRole(r);
    });
  }, [session]);

  if (session === undefined || (session && role === null)) return <div className="boot">PASTA HOUSE</div>;
  if (session && role === 'none') return <NoAccess />;
  return session ? <Board /> : <Login />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
