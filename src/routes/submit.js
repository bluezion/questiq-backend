// src/routes/submit.js
// ─────────────────────────────────────────────────────────────────────────────
// 학생 공개 제출 라우터 (인증 불필요)
//
//   POST /api/v1/submit/:shareCode/pre   사전 진단 제출
//   POST /api/v1/submit/:shareCode/post  사후 진단 제출
//   GET  /api/v1/submit/:shareCode/info  링크 정보 조회
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const sub     = require('../services/submissionService');
const cls     = require('../services/classService');
const logger  = require('../utils/logger');

// 공개 Rate Limit (학생 제출 남용 방지)
const rateLimit = require('express-rate-limit');
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10분
  max: 20,
  message: { success: false, error: '너무 많은 요청입니다. 10분 후에 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── GET /info/:shareCode ──────────────────────────────
router.get('/info/:shareCode', async (req, res) => {
  try {
    const classInfo = await cls.getClassByShareCode(req.params.shareCode);
    if (!classInfo) return res.status(404).json({ success: false, error: '유효하지 않은 공유 코드입니다.' });

    const { _teacherId, ...pub } = classInfo;
    return res.json({ success: true, data: pub });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── POST /:shareCode/pre ──────────────────────────────
router.post('/:shareCode/pre', submitLimiter, async (req, res) => {
  const { shareCode } = req.params;
  const { studentName, studentCode, grade,
    constructScores, totalAverage, totalNormalized, totalLevel,
    durationSeconds } = req.body;

  if (!studentName?.trim())
    return res.status(400).json({ success: false, error: '이름을 입력해주세요.' });
  if (!constructScores?.length)
    return res.status(400).json({ success: false, error: '진단 결과가 없습니다.' });

  try {
    const result = await sub.submitDiagnostic({
      shareCode, studentName, studentCode, grade,
      diagnosticType: 'pre',
      constructScores, totalAverage, totalNormalized, totalLevel,
      durationSeconds,
      fingerprint: req.body.fingerprint,
      ipAddress:   req.ip,
    });
    logger.info('사전 진단 공개 제출', { shareCode, studentName });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.warn('공개 제출 오류', { shareCode, error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── POST /:shareCode/post ─────────────────────────────
router.post('/:shareCode/post', submitLimiter, async (req, res) => {
  const { shareCode } = req.params;
  const { studentName, studentCode, grade,
    constructScores, totalAverage, totalNormalized, totalLevel,
    durationSeconds } = req.body;

  if (!studentName?.trim())
    return res.status(400).json({ success: false, error: '이름을 입력해주세요.' });
  if (!constructScores?.length)
    return res.status(400).json({ success: false, error: '진단 결과가 없습니다.' });

  try {
    const result = await sub.submitDiagnostic({
      shareCode, studentName, studentCode, grade,
      diagnosticType: 'post',
      constructScores, totalAverage, totalNormalized, totalLevel,
      durationSeconds,
      fingerprint: req.body.fingerprint,
      ipAddress:   req.ip,
    });
    logger.info('사후 진단 공개 제출', { shareCode, studentName });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.warn('공개 제출 오류', { shareCode, error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
