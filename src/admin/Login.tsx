import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError('이메일 또는 비밀번호가 맞지 않아요.');
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <div className="brand-name">PASTA HOUSE</div>
          <div className="brand-sub">ROOM SERVICE ADMIN</div>
        </div>
        <h1>관리자 로그인</h1>
        <label htmlFor="email">이메일</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="pw">비밀번호</label>
        <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" className="btn-green" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
      </form>
    </div>
  );
}
