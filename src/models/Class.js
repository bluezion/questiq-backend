// src/models/Class.js
// ─────────────────────────────────────────────────────────────────────────────
// 클래스(학급) 모델
// 교사 1 : 클래스 N  /  클래스 1 : 학생 N
// 학생 진단 링크(shareCode) + 멀티 클래스 지원
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const crypto   = require('crypto');

const classSchema = new mongoose.Schema({
  teacherId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },

  // 학급 기본 정보
  name:        { type: String, required: true, trim: true, maxlength: 80 },
  school:      { type: String, trim: true },
  grade:       { type: String, trim: true },        // 예: 중학교 2학년
  subject:     { type: String, trim: true },        // 예: 국어
  year:        { type: Number, default: () => new Date().getFullYear() },
  description: { type: String, trim: true, maxlength: 300 },

  // 학생 진단 링크 공유 코드 (UUID prefix 6자 → 가독성 있는 8자리 코드)
  shareCode:   {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(4).toString('hex').toUpperCase(), // 예: A3F1C9B2
  },

  // 링크 설정
  linkSettings: {
    isOpen:          { type: Boolean, default: true },   // 링크 활성/비활성
    allowPre:        { type: Boolean, default: true },   // 사전 진단 허용
    allowPost:       { type: Boolean, default: true },   // 사후 진단 허용
    requireName:     { type: Boolean, default: true },   // 이름 입력 필수
    requireStudentId:{ type: Boolean, default: false },  // 학번 입력 필수
    expiresAt:       { type: Date, default: null },      // null = 만료없음
    maxSubmissions:  { type: Number, default: null },    // null = 무제한
  },

  // 통계 캐시 (주기적 갱신)
  statsCache: {
    totalStudents:  { type: Number, default: 0 },
    completedPre:   { type: Number, default: 0 },
    completedPost:  { type: Number, default: 0 },
    avgImprovement: { type: Number, default: 0 },
    updatedAt:      { type: Date },
  },

  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
});

// 복합 인덱스
classSchema.index({ teacherId: 1, isActive: 1 });
classSchema.index({ shareCode: 1 }, { unique: true });

// 공개 직렬화
classSchema.methods.toClientJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id; delete obj.__v;
  return obj;
};

// shareCode로 공개 진단 링크 조회용 (인증 불필요)
classSchema.statics.findByShareCode = function (code) {
  return this.findOne({ shareCode: code.toUpperCase(), isActive: true });
};

module.exports = mongoose.model('Class', classSchema);
