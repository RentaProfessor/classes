-- Run this ONCE in your Supabase Dashboard → SQL Editor
-- This creates all tables needed for SyllaBoard

CREATE TABLE IF NOT EXISTS semesters (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id BIGSERIAL PRIMARY KEY,
  semester_id BIGINT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  class_key TEXT NOT NULL,
  icon TEXT DEFAULT '📚',
  color_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assignments (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  end_date TEXT,
  type TEXT NOT NULL DEFAULT 'due',
  completed BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_semesters_user ON semesters(user_id);
CREATE INDEX IF NOT EXISTS idx_classes_semester ON classes(semester_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);

ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own semesters" ON semesters
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own classes" ON classes
  FOR ALL USING (semester_id IN (SELECT id FROM semesters WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own assignments" ON assignments
  FOR ALL USING (class_id IN (SELECT id FROM classes WHERE semester_id IN (SELECT id FROM semesters WHERE user_id = auth.uid())));
