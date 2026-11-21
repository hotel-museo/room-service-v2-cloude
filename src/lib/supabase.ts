import { createClient } from '@supabase/supabase-js';

// 공개 키(anon)는 브라우저에 노출되도록 설계된 키입니다.
// 데이터 보호는 DB의 RLS 정책과 주문 검증 트리거가 담당합니다.
const SUPABASE_URL = 'https://yookspgooyewhnkobckw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlvb2tzcGdvb3lld2hua29iY2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDc2MTYsImV4cCI6MjEwMTkyMzYxNn0.CO6lAn0LpXpA3lBvBEgTgnhes68PDoUVolU5z0f9zYM';

// 로그인 저장 방식
// - 자동 로그인 켬: localStorage에 저장 → 브라우저를 껐다 켜도 로그인 유지
// - 자동 로그인 끔: sessionStorage에 저장 → 브라우저(탭)를 닫으면 로그아웃
// 예전 관리자 페이지(메뉴 관리·매출)도 같은 키와 'bottega_admin_remember' 표시를 쓰므로 로그인을 함께 씁니다.
export const AUTO_LOGIN_KEY = 'bottega_admin_remember';

export function autoLoginOn(): boolean {
  try {
    return localStorage.getItem(AUTO_LOGIN_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAutoLogin(on: boolean) {
  try {
    localStorage.setItem(AUTO_LOGIN_KEY, on ? '1' : '0');
  } catch {
    /* 무시 */
  }
}

const authStorage = {
  getItem(key: string) {
    try {
      return sessionStorage.getItem(key) ?? localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      if (autoLoginOn()) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch {
      /* 무시 */
    }
  },
  removeItem(key: string) {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch {
      /* 무시 */
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: authStorage },
});
