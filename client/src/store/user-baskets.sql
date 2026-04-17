-- Supabase SQL: user_baskets 테이블 (마켓 preset 즐겨찾기)
-- Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE user_baskets (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  preset_id  UUID REFERENCES market_presets(id) ON DELETE CASCADE NOT NULL,
  added_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, preset_id)
);

-- 인덱스
CREATE INDEX idx_user_baskets_user_id ON user_baskets(user_id);

-- RLS: 본인 바구니만 접근
ALTER TABLE user_baskets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_basket" ON user_baskets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "insert_own_basket" ON user_baskets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_basket" ON user_baskets
  FOR DELETE USING (auth.uid() = user_id);
