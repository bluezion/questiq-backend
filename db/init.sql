-- db/init.sql
-- QuestIQ 데이터베이스 초기화 스크립트
-- ─────────────────────────────────────────────────

-- 확장 기능
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 질문 분류 결과 저장 테이블 ──────────────────────
CREATE TABLE IF NOT EXISTS question_classifications (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         VARCHAR(128),                     -- 사용자 ID (Firebase UID 등)
  session_id      UUID,                             -- QFT 세션 ID
  original_question TEXT NOT NULL,
  grade           VARCHAR(20),
  subject         VARCHAR(20),

  -- 분류 결과
  open_closed     VARCHAR(10) CHECK (open_closed IN ('open', 'closed')),
  bloom_level     VARCHAR(10),
  bloom_level_num SMALLINT CHECK (bloom_level_num BETWEEN 1 AND 6),
  marzano_type    VARCHAR(20),
  score           SMALLINT CHECK (score BETWEEN 1 AND 10),
  level_badge     VARCHAR(20),

  -- AI 피드백
  feedback        TEXT,
  improved_question TEXT,
  improvement_tip TEXT,

  -- 메타데이터
  model_used      VARCHAR(30),
  tokens_used     INTEGER,
  elapsed_ms      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  -- 인덱스
  CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES qft_sessions(id) ON DELETE SET NULL
);

-- ── QFT 세션 테이블 ──────────────────────────────────
CREATE TABLE IF NOT EXISTS qft_sessions (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         VARCHAR(128),
  grade           VARCHAR(20),
  subject         VARCHAR(20),
  qft_step        SMALLINT DEFAULT 5,
  total_questions INTEGER DEFAULT 0,
  open_ratio      SMALLINT,                         -- 열린 질문 비율 (%)
  average_score   NUMERIC(4,2),
  status          VARCHAR(20) DEFAULT 'active',     -- active | completed
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ── 사용자 진단 기록 테이블 ──────────────────────────
CREATE TABLE IF NOT EXISTS user_diagnostics (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         VARCHAR(128) NOT NULL,
  diagnostic_type VARCHAR(20),                      -- pre | post
  scores          JSONB,                            -- 6구인 점수 JSON
  total_score     NUMERIC(5,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 인덱스 생성 ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_classifications_user_id ON question_classifications(user_id);
CREATE INDEX IF NOT EXISTS idx_classifications_session_id ON question_classifications(session_id);
CREATE INDEX IF NOT EXISTS idx_classifications_created_at ON question_classifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON qft_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_diagnostics_user_id ON user_diagnostics(user_id);

-- ── 통계 뷰 ──────────────────────────────────────────
CREATE OR REPLACE VIEW user_question_stats AS
SELECT
  user_id,
  COUNT(*)                                AS total_questions,
  ROUND(AVG(score), 2)                    AS avg_score,
  SUM(CASE WHEN open_closed = 'open' THEN 1 ELSE 0 END) AS open_count,
  ROUND(
    SUM(CASE WHEN open_closed = 'open' THEN 1 ELSE 0 END)::NUMERIC
    / COUNT(*) * 100, 1
  )                                       AS open_ratio,
  MODE() WITHIN GROUP (ORDER BY bloom_level) AS most_common_bloom,
  MAX(score)                              AS max_score,
  MIN(created_at)                         AS first_question_at,
  MAX(created_at)                         AS last_question_at
FROM question_classifications
WHERE user_id IS NOT NULL
GROUP BY user_id;
