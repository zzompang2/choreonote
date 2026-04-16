-- Supabase SQL: notes 테이블 (클라우드 저장)
-- Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE notes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title      TEXT NOT NULL DEFAULT '새 안무 노트',
  note_json  JSONB NOT NULL,
  music_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_notes_user_id ON notes(user_id);

-- RLS: 본인 노트만 접근
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_notes" ON notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "insert_own_notes" ON notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_notes" ON notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "delete_own_notes" ON notes
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
