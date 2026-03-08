// src/app.js
// ─────────────────────────────────────────────────────────────────────────────
// Express 앱 설정 - 라우터 등록, 에러 핸들러
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const config = require('./config');
const { applyMiddleware } = require('./middleware');
const logger = require('./utils/logger');

// ── 라우터 임포트 ──────────────────────────────────────
const classifyRouter  = require('./routes/classify');
const healthRouter    = require('./routes/health');
const authRouter      = require('./routes/auth');
const studentsRouter  = require('./routes/students');
const classesRouter   = require('./routes/classes');
const submitRouter    = require('./routes/submit');

const app = express();

// ── 미들웨어 적용 ──────────────────────────────────────
applyMiddleware(app);

// ── API 라우터 등록 ────────────────────────────────────
const API_PREFIX = `/api/${config.apiVersion}`;

app.use(`${API_PREFIX}/classify`,  classifyRouter);
app.use(`${API_PREFIX}/auth`,      authRouter);
app.use(`${API_PREFIX}/students`,  studentsRouter);
app.use(`${API_PREFIX}/classes`,   classesRouter);
app.use(`${API_PREFIX}/submit`,    submitRouter);
app.use('/health',                 healthRouter);

// ── API 문서 (루트) ────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'QuestIQ Question Classifier API',
    version: '1.0.0',
    description: 'AI 기반 학생 질문 역량 진단 및 분류 API',
    documentation: 'https://github.com/questiq/api-docs',
    endpoints: {
      classify: {
        'POST /api/v1/classify': '단일 질문 분류',
        'POST /api/v1/classify/batch': '배치 질문 분류 (최대 10개)',
        'POST /api/v1/classify/qft': 'QFT 세션 전체 분석',
        'POST /api/v1/classify/improve': '질문 개선 제안',
        'GET /api/v1/classify/examples': '학년별 질문 예시',
        'GET /api/v1/classify/session-id': '새 QFT 세션 ID 발급',
      },
      health: {
        'GET /health': '기본 헬스체크',
        'GET /health/detailed': '상세 헬스체크',
      },
    },
    educational_framework: [
      "Bloom's Revised Taxonomy (2001)",
      "Marzano's Question Continuum (2007)",
      "Question Formulation Technique - QFT (Right Question Institute)",
      "열린 질문 vs 닫힌 질문 분류",
    ],
  });
});

// ── 404 핸들러 ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `엔드포인트를 찾을 수 없습니다: ${req.method} ${req.path}`,
    available_endpoints: [
      'POST /api/v1/classify',
      'POST /api/v1/classify/batch',
      'POST /api/v1/classify/qft',
      'GET /health',
    ],
  });
});

// ── 전역 에러 핸들러 ───────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('전역 에러 핸들러', {
    requestId: req.requestId,
    error: err.message,
    stack: config.isDev ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // CORS 에러
  if (err.message?.includes('CORS 정책 위반')) {
    return res.status(403).json({
      success: false,
      error: '허용되지 않은 도메인에서의 요청입니다.',
    });
  }

  return res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || '서버 내부 오류가 발생했습니다.',
    ...(config.isDev && { stack: err.stack }),
  });
});

module.exports = app;
