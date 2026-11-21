import { createClient } from '@supabase/supabase-js';

// 공개 키(anon)는 브라우저에 노출되도록 설계된 키입니다.
// 데이터 보호는 DB의 RLS 정책과 주문 검증 트리거가 담당합니다.
const SUPABASE_URL = 'https://yookspgooyewhnkobckw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlvb2tzcGdvb3lld2hua29iY2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDc2MTYsImV4cCI6MjEwMTkyMzYxNn0.CO6lAn0LpXpA3lBvBEgTgnhes68PDoUVolU5z0f9zYM';

// 예전 관리자 페이지(메뉴 관리·매출)와 로그인을 함께 쓰도록 기본 저장 키를 그대로 씁니다.
// 예전 페이지는 'bottega_admin_remember' 표시가 있어야 로그인을 localStorage에 유지해서, 새 관리자에서 켜 둡니다.
try {
  if (location.pathname.includes('/admin')) localStorage.setItem('bottega_admin_remember', '1');
} catch {
  /* 저장 불가 환경은 무시 */
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
