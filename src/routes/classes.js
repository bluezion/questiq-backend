// src/routes/classes.js
// ─────────────────────────────────────────────────────────────────────────────
// 클래스(학급) CRUD + 링크 관리
//
// 인증 필요:
//   GET    /api/v1/classes                 클래스 목록
//   POST   /api/v1/classes                 클래스 생성
//   GET    /api/v1/classes/:id             클래스 상세
//   PUT    /api/v1/classes/:id             클래스 수정
//   DELETE /api/v1/classes/:id             클래스 삭제
//   POST   /api/v1/classes/:id/regen-code  공유코드 재발급
//   PUT    /api/v1/classes/:id/link        링크 설정 변경
//   GET    /api/v1/classes/:id/submissions 제출 목록 조회
//   POST   /api/v1/classes/:id/submissions/:sid/approve  승인
//   POST   /api/v1/classes/:id/submissions/:sid/reject   거절
//   POST   /api/v1/classes/:id/submissions/bulk-approve  일괄 승인
//
// 공개(인증 불필요):
//   GET    /api/v1/classes/public/:shareCode  공유코드 → 클래스 정보
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const cls     = require('../services/classService');
const sub     = require('../services/submissionService');
const { requireAuth } = require('../middleware/auth');
const logger  = require('../utils/logger');

// ── 공개 엔드포인트 (인증 불필요) ────────────────────
router.get('/public/:shareCode', async (req, res) => {
  try {
    const classInfo = await cls.getClassByShareCode(req.params.shareCode);
    if (!classInfo) return res.status(404).json({ success: false, error: '유효하지 않은 공유 코드입니다.' });
    // 공개용: 교사 ID 등 민감정보 제거
    const { _teacherId, ...pub } = classInfo;
    return res.json({ success: true, data: pub });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── 이하 모든 라우트: JWT 인증 필수 ─────────────────
router.use(requireAuth);

// ── GET / ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const classes = await cls.listClasses(req.teacher.id);
    return res.json({ success: true, data: classes });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST / ────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, school, grade, subject, year, description } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name은 필수입니다.' });
  try {
    const newClass = await cls.createClass(req.teacher.id, { name, school, grade, subject, year, description });
    return res.status(201).json({ success: true, data: newClass });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── GET /:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const c = await cls.getClass(req.teacher.id, req.params.id);
    if (!c) return res.status(404).json({ success: false, error: '클래스를 찾을 수 없습니다.' });
    return res.json({ success: true, data: c });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /:id ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const updated = await cls.updateClass(req.teacher.id, req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: '클래스를 찾을 수 없습니다.' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── DELETE /:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const ok = await cls.deleteClass(req.teacher.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: '클래스를 찾을 수 없습니다.' });
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:id/regen-code ──────────────────────────────
router.post('/:id/regen-code', async (req, res) => {
  try {
    const updated = await cls.regenerateShareCode(req.teacher.id, req.params.id);
    if (!updated) return res.status(404).json({ success: false, error: '클래스를 찾을 수 없습니다.' });
    logger.info('공유코드 재발급', { classId: req.params.id, newCode: updated.shareCode });
    return res.json({ success: true, data: { shareCode: updated.shareCode } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /:id/link ─────────────────────────────────────
router.put('/:id/link', async (req, res) => {
  try {
    const updated = await cls.updateLinkSettings(req.teacher.id, req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: '클래스를 찾을 수 없습니다.' });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── GET /:id/submissions ──────────────────────────────
router.get('/:id/submissions', async (req, res) => {
  const { status, page=1, limit=50 } = req.query;
  try {
    const result = await sub.listSubmissions(req.teacher.id, req.params.id, {
      status, page: parseInt(page), limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:id/submissions/bulk-approve ────────────────
router.post('/:id/submissions/bulk-approve', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ success: false, error: 'ids 배열이 필요합니다.' });
  try {
    const result = await sub.bulkApprove(req.teacher.id, ids);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:id/submissions/:sid/approve ────────────────
router.post('/:id/submissions/:sid/approve', async (req, res) => {
  try {
    const result = await sub.approveSubmission(
      req.teacher.id, req.params.sid,
      { mergeToStudentId: req.body.mergeToStudentId }
    );
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── POST /:id/submissions/:sid/reject ─────────────────
router.post('/:id/submissions/:sid/reject', async (req, res) => {
  try {
    const result = await sub.rejectSubmission(
      req.teacher.id, req.params.sid, req.body.note
    );
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
