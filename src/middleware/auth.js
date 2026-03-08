// src/middleware/auth.js
// ─────────────────────────────────────────────────────────────────────────────
// JWT 인증 미들웨어
// ─────────────────────────────────────────────────────────────────────────────
const { verifyToken } = require('../services/authService');

/**
 * requireAuth  — 유효한 JWT Bearer 토큰 필수
 * optionalAuth — 토큰 있으면 파싱, 없어도 통과
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: '인증 토큰이 필요합니다.' });
  }

  try {
    req.teacher = verifyToken(token);   // { id, role, iat, exp }
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? '토큰이 만료되었습니다. 다시 로그인해주세요.'
      : '유효하지 않은 토큰입니다.';
    return res.status(401).json({ success: false, error: msg });
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.teacher = verifyToken(token); } catch { /* ignore */ }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.teacher || req.teacher.role !== 'admin') {
    return res.status(403).json({ success: false, error: '관리자 권한이 필요합니다.' });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
