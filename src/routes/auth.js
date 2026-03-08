// src/routes/auth.js
// ─────────────────────────────────────────────────────────────────────────────
// 교사 인증 라우터
// POST /api/v1/auth/register  — 회원가입
// POST /api/v1/auth/login     — 로그인
// POST /api/v1/auth/refresh   — 토큰 갱신
// GET  /api/v1/auth/me        — 내 프로필
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const auth     = require('../services/authService');
const { requireAuth } = require('../middleware/auth');
const logger   = require('../utils/logger');

// ── POST /register ────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, name, school, subject } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ success: false, error: 'email, password, name은 필수입니다.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: '비밀번호는 8자 이상이어야 합니다.' });
  }

  try {
    const result = await auth.register({ email, password, name, school, subject });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.warn('회원가입 실패', { email, error: err.message });
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ── POST /login ───────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'email, password는 필수입니다.' });
  }

  try {
    const result = await auth.login({ email, password });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    logger.warn('로그인 실패', { email, error: err.message });
    return res.status(err.statusCode || 401).json({ success: false, error: err.message });
  }
});

// ── POST /refresh ─────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'token은 필수입니다.' });

  try {
    const result = await auth.refreshToken(token);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 401).json({ success: false, error: err.message });
  }
});

// ── GET /me ───────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const teacher = await auth.getProfile(req.teacher.id);
    return res.status(200).json({ success: true, data: teacher });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
