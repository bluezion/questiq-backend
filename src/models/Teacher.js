// src/models/Teacher.js
// ─────────────────────────────────────────────────────────────────────────────
// 교사 계정 MongoDB 모델
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const teacherSchema = new mongoose.Schema({
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:{ type: String, required: true },
  name:        { type: String, required: true, trim: true },
  school:      { type: String, trim: true },
  subject:     { type: String, trim: true },
  role:        { type: String, enum: ['teacher', 'admin'], default: 'teacher' },
  isActive:    { type: Boolean, default: true },
  lastLoginAt: { type: Date },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
});

// 비밀번호 해시 (Mongoose 9+ async 미들웨어)
teacherSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

teacherSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// 응답 직렬화 (비밀번호 제외)
teacherSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

// email: unique: true 로 이미 인덱스 선언됨 → 중복 제거
// teacherSchema.index({ email: 1 }); ← 제거

module.exports = mongoose.model('Teacher', teacherSchema);
