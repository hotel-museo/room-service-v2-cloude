import { createClient } from '@supabase/supabase-js';

// 공개 키(anon)는 브라우저에 노출되도록 설계된 키입니다.
// 데이터 보호는 DB의 RLS 정책과 주문 검증 트리거가 담당합니다.
const SUPABASE_URL = 'https://yookspgooyewhnkobckw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlvb2tzcGdvb3lld2hua29iY2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDc2MTYsImV4cCI6MjEwMTkyMzYxNn0.CO6lAn0LpXpA3lBvBEgTgnhes68PDoUVolU5z0f9zYM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storageKey: 'ph-admin-auth' },
});
