// src/models/Student.js
// ─────────────────────────────────────────────────────────────────────────────
// 학생 MongoDB 모델
// 사전/사후 진단 결과 + AI 코멘트 + 교사 연결 포함
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

// ── 구인 점수 서브도큐먼트 ────────────────────────────
const constructScoreSchema = new mongoose.Schema({
  constructId:     { type: String, required: true,
    enum: ['awareness','generation','refinement','classification','inquiry','reflection'] },
  rawScores:       [{ type: Number, min: 1, max: 5 }],
  averageScore:    { type: Number, min: 1, max: 5 },
  normalizedScore: { type: Number, min: 0, max: 100 },
  level:           { type: String, enum: ['very_low','low','medium','high','very_high'] },
  improvement:     { type: Number },   // 사후 시에만 존재
}, { _id: false });

// ── 진단 결과 서브도큐먼트 ────────────────────────────
const diagnosticResultSchema = new mongoose.Schema({
  resultId:        { type: String, default: () => require('crypto').randomUUID() },
  type:            { type: String, enum: ['pre', 'post'], required: true },
  constructScores: [constructScoreSchema],
  totalAverage:    { type: Number, min: 1, max: 5 },
  totalNormalized: { type: Number, min: 0, max: 100 },
  totalLevel:      { type: String, enum: ['very_low','low','medium','high','very_high'] },
  completedAt:     { type: Date, default: Date.now },
  durationSeconds: { type: Number },
}, { _id: false });

// ── 구인 비교 서브도큐먼트 ────────────────────────────
const constructComparisonSchema = new mongoose.Schema({
  constructId:     { type: String, required: true },
  preScore:        { type: Number },
  postScore:       { type: Number },
  improvement:     { type: Number },
  improvementPct:  { type: Number },
  isSignificant:   { type: Boolean },
}, { _id: false });

// ── AI 코멘트 서브도큐먼트 ────────────────────────────
const aiCommentSchema = new mongoose.Schema({
  summary:      { type: String },
  strengths:    [{ type: String }],
  improvements: [{ type: String }],
  nextSteps:    [{ type: String }],
  teacherTips:  [{ type: String }],
  generatedAt:  { type: Date, default: Date.now },
  model:        { type: String },
  tokensUsed:   { type: Number },
}, { _id: false });

// ── 메인 학생 스키마 ──────────────────────────────────
const studentSchema = new mongoose.Schema({
  teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class',   default: null, index: true },
  name:         { type: String, required: true, trim: true, maxlength: 50 },
  grade:        { type: String, required: true, trim: true },
  group:        { type: String, trim: true },     // 모둠/반
  studentCode:  { type: String, trim: true },     // 학번 (선택)

  // 진단 결과
  pre:  { type: diagnosticResultSchema, default: null },
  post: { type: diagnosticResultSchema, default: null },

  // 비교 분석 (pre+post 완료 시 자동 계산)
  comparison: {
    constructComparisons:    [constructComparisonSchema],
    totalImprovement:        { type: Number },
    totalImprovementPct:     { type: Number },
    mostImprovedConstruct:   { type: String },
    leastImprovedConstruct:  { type: String },
    overallGrowthLevel:      { type: String,
      enum: ['remarkable','significant','moderate','slight','declined'] },
    summary:                 { type: String },
  },

  aiComment:  { type: aiCommentSchema, default: null },

  isActive:   { type: Boolean, default: true },
  addedAt:    { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'addedAt', updatedAt: 'updatedAt' },
});

// ── 복합 인덱스 ───────────────────────────────────────
studentSchema.index({ teacherId: 1, classId: 1 });
studentSchema.index({ teacherId: 1, name: 1 });
studentSchema.index({ teacherId: 1, group: 1 });
studentSchema.index({ teacherId: 1, addedAt: -1 });
studentSchema.index({ teacherId: 1, 'comparison.totalImprovement': -1 });

// ── 직렬화 헬퍼 ──────────────────────────────────────
studentSchema.methods.toClientJSON = function () {
  const obj = this.toObject({ virtuals: true });
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  delete obj.teacherId;
  return obj;
};

module.exports = mongoose.model('Student', studentSchema);
