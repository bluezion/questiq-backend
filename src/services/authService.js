// src/services/authService.js
// ─────────────────────────────────────────────────────────────────────────────
// 교사 인증 서비스 (JWT 기반)
// ─────────────────────────────────────────────────────────────────────────────
const jwt     = require('jsonwebtoken');
const Teacher = require('../models/Teacher');
const config  = require('../config');
const logger  = require('../utils/logger');

const JWT_SECRET  = process.env.JWT_SECRET  || 'questiq_dev_secret_change_in_prod_min32';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** 교사 회원가입 */
async function register({ email, password, name, school, subject }) {
  const exists = await Teacher.findOne({ email });
  if (exists) throw Object.assign(new Error('이미 등록된 이메일입니다.'), { statusCode: 409 });

  const teacher = await Teacher.create({
    email, passwordHash: password, name, school, subject,
  });

  logger.info('교사 회원가입', { email, name });
  const token = signToken({ id: teacher._id.toString(), role: teacher.role });
  return { token, teacher: teacher.toPublic() };
}

/** 교사 로그인 */
async function login({ email, password }) {
  const teacher = await Teacher.findOne({ email, isActive: true });
  if (!teacher) throw Object.assign(new Error('이메일 또는 비밀번호가 올바르지 않습니다.'), { statusCode: 401 });

  const valid = await teacher.verifyPassword(password);
  if (!valid) throw Object.assign(new Error('이메일 또는 비밀번호가 올바르지 않습니다.'), { statusCode: 401 });

  teacher.lastLoginAt = new Date();
  await teacher.save();

  logger.info('교사 로그인', { email });
  const token = signToken({ id: teacher._id.toString(), role: teacher.role });
  return { token, teacher: teacher.toPublic() };
}

/** 토큰 갱신 */
async function refreshToken(oldToken) {
  let payload;
  try {
    payload = verifyToken(oldToken);
  } catch {
    throw Object.assign(new Error('유효하지 않은 토큰입니다.'), { statusCode: 401 });
  }
  const teacher = await Teacher.findById(payload.id);
  if (!teacher || !teacher.isActive)
    throw Object.assign(new Error('계정을 찾을 수 없습니다.'), { statusCode: 401 });

  const token = signToken({ id: teacher._id.toString(), role: teacher.role });
  return { token, teacher: teacher.toPublic() };
}

/** 프로필 조회 */
async function getProfile(teacherId) {
  const teacher = await Teacher.findById(teacherId).lean();
  if (!teacher) throw Object.assign(new Error('계정을 찾을 수 없습니다.'), { statusCode: 404 });
  const { passwordHash, ...pub } = teacher;
  pub.id = pub._id.toString();
  delete pub._id; delete pub.__v;
  return pub;
}

module.exports = { register, login, refreshToken, getProfile, verifyToken, signToken };
