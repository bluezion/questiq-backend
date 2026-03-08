// src/routes/students.js
// ─────────────────────────────────────────────────────────────────────────────
// 학생 데이터 CRUD + 진단 결과 + 통계 라우터
//
// GET    /api/v1/students                   — 목록 조회 (필터/정렬/페이지)
// POST   /api/v1/students                   — 학생 생성
// GET    /api/v1/students/stats             — 클래스 통계
// GET    /api/v1/students/groups            — 모둠 목록
// GET    /api/v1/students/:id               — 단건 조회
// PUT    /api/v1/students/:id               — 정보 수정
// DELETE /api/v1/students/:id               — 삭제 (soft)
// POST   /api/v1/students/bulk-delete       — 일괄 삭제
// PUT    /api/v1/students/:id/diagnostic/pre  — 사전 진단 저장
// PUT    /api/v1/students/:id/diagnostic/post — 사후 진단 저장
// PUT    /api/v1/students/:id/ai-comment    — AI 코멘트 저장
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const svc      = require('../services/studentService');
const { requireAuth } = require('../middleware/auth');
const logger   = require('../utils/logger');

// 모든 학생 라우트는 JWT 인증 필수
router.use(requireAuth);

// ── GET /stats ────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const stats = await svc.getClassStats(req.teacher.id);
    return res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('클래스 통계 조회 오류', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /groups ───────────────────────────────────────
router.get('/groups', async (req, res) => {
  try {
    const groups = await svc.getGroups(req.teacher.id);
    return res.json({ success: true, data: groups });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET / (목록) ──────────────────────────────────────
router.get('/', async (req, res) => {
  const { page=1, limit=50, group, search, sortField='addedAt', sortDir='desc' } = req.query;
  try {
    const result = await svc.listStudents(req.teacher.id, {
      page: parseInt(page), limit: Math.min(parseInt(limit), 200),
      group, search, sortField, sortDir,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('학생 목록 조회 오류', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST / (생성) ─────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, grade, group, studentCode } = req.body;
  if (!name || !grade) {
    return res.status(400).json({ success: false, error: 'name, grade는 필수입니다.' });
  }
  try {
    const student = await svc.createStudent(req.teacher.id, { name, grade, group, studentCode });
    return res.status(201).json({ success: true, data: student });
  } catch (err) {
    logger.error('학생 생성 오류', { error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── POST /bulk-delete ─────────────────────────────────
router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'ids 배열이 필요합니다.' });
  }
  try {
    const count = await svc.bulkDeleteStudents(req.teacher.id, ids);
    return res.json({ success: true, data: { deletedCount: count } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const student = await svc.getStudent(req.teacher.id, req.params.id);
    if (!student) return res.status(404).json({ success: false, error: '학생을 찾을 수 없습니다.' });
    return res.json({ success: true, data: student });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /:id ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const student = await svc.updateStudent(req.teacher.id, req.params.id, req.body);
    if (!student) return res.status(404).json({ success: false, error: '학생을 찾을 수 없습니다.' });
    return res.json({ success: true, data: student });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── DELETE /:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const ok = await svc.deleteStudent(req.teacher.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: '학생을 찾을 수 없습니다.' });
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /:id/diagnostic/pre ───────────────────────────
router.put('/:id/diagnostic/pre', async (req, res) => {
  const { diagnosticResult } = req.body;
  if (!diagnosticResult) {
    return res.status(400).json({ success: false, error: 'diagnosticResult가 필요합니다.' });
  }
  try {
    const student = await svc.saveDiagnosticPre(req.teacher.id, req.params.id, diagnosticResult);
    return res.json({ success: true, data: student });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── PUT /:id/diagnostic/post ──────────────────────────
router.put('/:id/diagnostic/post', async (req, res) => {
  const { diagnosticResult } = req.body;
  if (!diagnosticResult) {
    return res.status(400).json({ success: false, error: 'diagnosticResult가 필요합니다.' });
  }
  try {
    const student = await svc.saveDiagnosticPost(req.teacher.id, req.params.id, diagnosticResult);
    return res.json({ success: true, data: student });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── PUT /:id/ai-comment ───────────────────────────────
router.put('/:id/ai-comment', async (req, res) => {
  const { comment } = req.body;
  if (!comment) {
    return res.status(400).json({ success: false, error: 'comment가 필요합니다.' });
  }
  try {
    const student = await svc.saveAiComment(req.teacher.id, req.params.id, comment);
    return res.json({ success: true, data: student });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
