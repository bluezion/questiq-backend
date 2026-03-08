// src/routes/classify.js
// ─────────────────────────────────────────────────────────────────────────────
// 질문 분류 라우터 - QuestIQ 핵심 엔드포인트
//
// POST /api/v1/classify          - 단일 질문 분류
// POST /api/v1/classify/batch    - 배치 질문 분류 (최대 10개)
// POST /api/v1/classify/qft      - QFT 세션 전체 분석
// POST /api/v1/classify/improve  - 질문 개선 제안
// GET  /api/v1/classify/examples - 질문 예시 목록
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const {
  classifyQuestion,
  classifyBatch,
  analyzeQftSession,
  generateImprovement,
} = require('../services/openaiService');

const {
  validate,
  classifySchema,
  batchClassifySchema,
  qftSessionSchema,
} = require('../utils/validator');

const { classifyRateLimiter } = require('../middleware');
const logger = require('../utils/logger');

// ══════════════════════════════════════════════════════════
//  POST /api/v1/classify
//  단일 질문 분류 (Bloom + 마르자노 + 열린/닫힌 + 점수)
// ══════════════════════════════════════════════════════════
router.post('/', classifyRateLimiter, validate(classifySchema), async (req, res) => {
  const { question, grade, subject, context } = req.body;

  logger.info('단일 분류 요청', {
    requestId: req.requestId,
    grade, subject,
    questionPreview: question.substring(0, 50),
  });

  try {
    const result = await classifyQuestion({ question, grade, subject, context });

    return res.status(200).json({
      ...result,
      request_id: req.requestId,
    });

  } catch (err) {
    logger.error('분류 라우트 오류', { requestId: req.requestId, error: err.message });
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || '질문 분류 중 오류가 발생했습니다.',
      request_id: req.requestId,
    });
  }
});


// ══════════════════════════════════════════════════════════
//  POST /api/v1/classify/batch
//  배치 질문 분류 (최대 10개)
// ══════════════════════════════════════════════════════════
router.post('/batch', classifyRateLimiter, validate(batchClassifySchema), async (req, res) => {
  const { questions } = req.body;

  logger.info('배치 분류 요청', {
    requestId: req.requestId,
    count: questions.length,
  });

  try {
    const result = await classifyBatch(questions);
    return res.status(200).json({
      ...result,
      request_id: req.requestId,
    });

  } catch (err) {
    logger.error('배치 분류 오류', { requestId: req.requestId, error: err.message });
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
      request_id: req.requestId,
    });
  }
});


// ══════════════════════════════════════════════════════════
//  POST /api/v1/classify/qft
//  QFT 세션 전체 분석 (질문 목록 → 통계 + AI 피드백)
// ══════════════════════════════════════════════════════════
router.post('/qft', classifyRateLimiter, validate(qftSessionSchema), async (req, res) => {
  const { session_id, questions, grade, subject, qft_step } = req.body;

  logger.info('QFT 세션 분석 요청', {
    requestId: req.requestId,
    sessionId: session_id,
    questionCount: questions.length,
  });

  try {
    const result = await analyzeQftSession({
      sessionId: session_id,
      questions,
      grade,
      subject,
      qftStep: qft_step,
    });

    return res.status(200).json({
      ...result,
      request_id: req.requestId,
    });

  } catch (err) {
    logger.error('QFT 분석 오류', { requestId: req.requestId, error: err.message });
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
      request_id: req.requestId,
    });
  }
});


// ══════════════════════════════════════════════════════════
//  POST /api/v1/classify/improve
//  특정 질문 개선 제안 (목표 블룸 레벨 지정 가능)
// ══════════════════════════════════════════════════════════
router.post('/improve', classifyRateLimiter, async (req, res) => {
  const { question, current_result, target_bloom_level } = req.body;

  if (!question || question.trim().length < 3) {
    return res.status(400).json({ success: false, error: '질문은 3자 이상이어야 합니다.' });
  }

  try {
    const result = await generateImprovement({
      question,
      currentResult: current_result || {},
      targetLevel: target_bloom_level,
    });

    return res.status(200).json({
      ...result,
      request_id: req.requestId,
    });

  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
      request_id: req.requestId,
    });
  }
});


// ══════════════════════════════════════════════════════════
//  GET /api/v1/classify/examples
//  학년별 질문 예시 목록 (API 키 불필요)
// ══════════════════════════════════════════════════════════
router.get('/examples', (req, res) => {
  const examples = {
    elementary: {
      grade: '초등학교',
      examples: [
        { question: '물은 몇 도에서 얼어요?', bloom_level: '기억', score: 2 },
        { question: '식물이 물 없이도 살 수 있을까요?', bloom_level: '이해', score: 4 },
        { question: '씨앗이 커지는 과정에서 무엇이 가장 중요할까요?', bloom_level: '분석', score: 6 },
      ],
    },
    middle: {
      grade: '중학교',
      examples: [
        { question: '산업혁명은 언제 시작됐나요?', bloom_level: '기억', score: 2 },
        { question: '민주주의와 독재의 차이는 무엇인가요?', bloom_level: '이해', score: 4 },
        { question: '경제 불평등이 사회 갈등을 어떻게 일으키나요?', bloom_level: '분석', score: 7 },
      ],
    },
    high: {
      grade: '고등학교',
      examples: [
        { question: '인터넷이 없어진다면 민주주의는 어떻게 변할까요?', bloom_level: '창의', score: 10 },
        { question: '이 정책이 과연 올바른 선택이었나요?', bloom_level: '평가', score: 8 },
        { question: '기후변화와 경제성장은 공존할 수 있을까요?', bloom_level: '평가', score: 9 },
      ],
    },
  };

  return res.status(200).json({ success: true, data: examples });
});


// ══════════════════════════════════════════════════════════
//  GET /api/v1/classify/session-id
//  새 QFT 세션 ID 발급
// ══════════════════════════════════════════════════════════
router.get('/session-id', (req, res) => {
  return res.status(200).json({
    success: true,
    session_id: uuidv4(),
    created_at: new Date().toISOString(),
  });
});


module.exports = router;
