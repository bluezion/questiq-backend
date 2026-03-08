// src/models/DiagnosticSubmission.js
// ─────────────────────────────────────────────────────────────────────────────
// 학생이 공유 링크로 제출한 진단 결과 (인증 불필요 제출)
// 교사가 승인 후 → Student 레코드에 반영
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const constructScoreSchema = new mongoose.Schema({
  constructId:     { type: String, required: true,
    enum: ['awareness','generation','refinement','classification','inquiry','reflection'] },
  rawScores:       [{ type: Number, min: 1, max: 5 }],
  averageScore:    { type: Number },
  normalizedScore: { type: Number },
  level:           { type: String },
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  // 링크 추적
  classId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
  teacherId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
  shareCode:  { type: String, required: true, index: true },

  // 제출 학생 정보 (자기 기입)
  studentName:  { type: String, required: true, trim: true, maxlength: 50 },
  studentCode:  { type: String, trim: true },     // 학번 (옵션)
  grade:        { type: String, trim: true },

  // 진단 유형 + 결과
  diagnosticType: { type: String, enum: ['pre', 'post'], required: true },
  constructScores: [constructScoreSchema],
  totalAverage:    { type: Number },
  totalNormalized: { type: Number },
  totalLevel:      { type: String },
  durationSeconds: { type: Number },

  // 처리 상태
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'merged'],
    default: 'pending',
    index: true,
  },

  // 승인 후 연결된 Student._id (merged 상태에서 설정)
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },

  // 메타
  submittedAt:  { type: Date, default: Date.now },
  reviewedAt:   { type: Date },
  reviewNote:   { type: String },

  // 중복 제출 방지 fingerprint (브라우저 기반 - 완벽하지 않음)
  fingerprint:  { type: String },
  ipAddress:    { type: String },
}, {
  timestamps: { createdAt: 'submittedAt', updatedAt: false },
});

// 인덱스
submissionSchema.index({ classId: 1, status: 1 });
submissionSchema.index({ classId: 1, studentName: 1, diagnosticType: 1 });
submissionSchema.index({ submittedAt: -1 });

// 직렬화
submissionSchema.methods.toClientJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id; delete obj.__v;
  delete obj.ipAddress; delete obj.fingerprint;
  return obj;
};

module.exports = mongoose.model('DiagnosticSubmission', submissionSchema);
