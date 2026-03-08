// src/services/studentService.js
// ─────────────────────────────────────────────────────────────────────────────
// 학생 데이터 서비스 — CRUD + 통계 + 비교 계산
// ─────────────────────────────────────────────────────────────────────────────
const Student = require('../models/Student');
const logger  = require('../utils/logger');

const CONSTRUCTS = [
  'awareness','generation','refinement','classification','inquiry','reflection'
];

// ── 비교 분석 계산 (순수 함수) ────────────────────────
function buildComparison(pre, post) {
  const constructComparisons = CONSTRUCTS.map(id => {
    const preCS  = pre.constructScores.find(s => s.constructId === id);
    const postCS = post.constructScores.find(s => s.constructId === id);
    const preScore  = preCS?.averageScore  ?? 0;
    const postScore = postCS?.averageScore ?? 0;
    const improvement    = Math.round((postScore - preScore) * 100) / 100;
    const improvementPct = preScore > 0
      ? Math.round((improvement / preScore) * 100) : 0;
    return { constructId: id, preScore, postScore, improvement, improvementPct,
             isSignificant: Math.abs(improvement) >= 0.5 };
  });

  const totalImprovement =
    Math.round((post.totalAverage - pre.totalAverage) * 100) / 100;
  const totalImprovementPct = pre.totalAverage > 0
    ? Math.round((totalImprovement / pre.totalAverage) * 100) : 0;

  const sorted = [...constructComparisons].sort((a, b) => b.improvement - a.improvement);

  const growthLevel =
    totalImprovement >= 1.5 ? 'remarkable'  :
    totalImprovement >= 0.8 ? 'significant' :
    totalImprovement >= 0.3 ? 'moderate'    :
    totalImprovement >= 0   ? 'slight'      : 'declined';

  return {
    constructComparisons, totalImprovement, totalImprovementPct,
    mostImprovedConstruct:  sorted[0].constructId,
    leastImprovedConstruct: sorted[sorted.length - 1].constructId,
    overallGrowthLevel: growthLevel,
    summary: buildSummary(totalImprovement, sorted[0].constructId, growthLevel),
  };
}

function buildSummary(improvement, topId, level) {
  const labels = {
    awareness:'질문 인식', generation:'질문 생성', refinement:'질문 정교화',
    classification:'질문 분류', inquiry:'질문 탐구', reflection:'질문 성찰',
  };
  const growthLabels = {
    remarkable:'눈부신 성장', significant:'뚜렷한 성장', moderate:'꾸준한 성장',
    slight:'미미한 성장', declined:'재도전 필요',
  };
  if (improvement <= 0) return `${labels[topId] ?? topId} 영역을 중심으로 꾸준히 연습해보세요!`;
  return `${growthLabels[level]}을 이뤘습니다! 특히 ${labels[topId] ?? topId} 영역에서 가장 큰 발전을 보였습니다.`;
}

// ══════════════════════════════════════════════════════
//  학생 CRUD
// ══════════════════════════════════════════════════════

/** 학생 목록 조회 (필터/정렬/페이지) */
async function listStudents(teacherId, { page=1, limit=50, group, search, sortField='addedAt', sortDir='desc', classId } = {}) {
  const query = { teacherId, isActive: true };
  if (classId) query.classId = classId;
  if (group)   query.group = group;
  if (search)  query.name  = { $regex: search, $options: 'i' };

  const sortMap = {
    name: { name: sortDir === 'asc' ? 1 : -1 },
    improvement: { 'comparison.totalImprovement': sortDir === 'asc' ? 1 : -1 },
    postScore: { 'post.totalAverage': sortDir === 'asc' ? 1 : -1 },
    addedAt: { addedAt: sortDir === 'asc' ? 1 : -1 },
  };
  const sort = sortMap[sortField] || sortMap.addedAt;

  const [students, total] = await Promise.all([
    Student.find(query).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Student.countDocuments(query),
  ]);

  return {
    students: students.map(normalizeStudent),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** 학생 단건 조회 */
async function getStudent(teacherId, studentId) {
  const student = await Student.findOne({ _id: studentId, teacherId, isActive: true }).lean();
  if (!student) return null;
  return normalizeStudent(student);
}

/** 학생 생성 */
async function createStudent(teacherId, data) {
  const student = await Student.create({ teacherId, ...sanitizeStudentInput(data) });
  logger.info('학생 생성', { teacherId, studentId: student._id, name: student.name });
  return normalizeStudent(student.toObject());
}

/** 학생 정보 수정 */
async function updateStudent(teacherId, studentId, data) {
  const updated = await Student.findOneAndUpdate(
    { _id: studentId, teacherId, isActive: true },
    { $set: { ...sanitizeStudentInput(data), updatedAt: new Date() } },
    { new: true, lean: true }
  );
  if (!updated) return null;
  return normalizeStudent(updated);
}

/** 학생 삭제 (soft delete) */
async function deleteStudent(teacherId, studentId) {
  const result = await Student.findOneAndUpdate(
    { _id: studentId, teacherId },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  return !!result;
}

/** 학생 일괄 삭제 */
async function bulkDeleteStudents(teacherId, studentIds) {
  const result = await Student.updateMany(
    { _id: { $in: studentIds }, teacherId },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  return result.modifiedCount;
}

// ══════════════════════════════════════════════════════
//  진단 결과 저장
// ══════════════════════════════════════════════════════

/** 사전 진단 결과 저장 */
async function saveDiagnosticPre(teacherId, studentId, diagnosticResult) {
  const student = await Student.findOne({ _id: studentId, teacherId, isActive: true });
  if (!student) throw Object.assign(new Error('학생을 찾을 수 없습니다.'), { statusCode: 404 });

  student.pre = sanitizeDiagnosticResult(diagnosticResult, 'pre');
  // 사전 결과 갱신 시 이전 사후 비교도 재계산
  if (student.post) {
    student.comparison = buildComparison(student.pre, student.post);
  }
  student.updatedAt = new Date();
  await student.save();

  logger.info('사전 진단 저장', { studentId, totalAverage: student.pre.totalAverage });
  return normalizeStudent(student.toObject());
}

/** 사후 진단 결과 저장 + 비교 자동 계산 */
async function saveDiagnosticPost(teacherId, studentId, diagnosticResult) {
  const student = await Student.findOne({ _id: studentId, teacherId, isActive: true });
  if (!student) throw Object.assign(new Error('학생을 찾을 수 없습니다.'), { statusCode: 404 });
  if (!student.pre) throw Object.assign(new Error('사전 진단이 없습니다. 사전 진단을 먼저 저장하세요.'), { statusCode: 400 });

  student.post = sanitizeDiagnosticResult(diagnosticResult, 'post');
  student.comparison = buildComparison(student.pre, student.post);
  student.updatedAt = new Date();
  await student.save();

  logger.info('사후 진단 저장 + 비교 계산 완료', {
    studentId, totalImprovement: student.comparison.totalImprovement,
  });
  return normalizeStudent(student.toObject());
}

/** AI 코멘트 저장 */
async function saveAiComment(teacherId, studentId, comment) {
  const updated = await Student.findOneAndUpdate(
    { _id: studentId, teacherId, isActive: true },
    { $set: { aiComment: { ...comment, generatedAt: new Date() }, updatedAt: new Date() } },
    { new: true, lean: true }
  );
  if (!updated) throw Object.assign(new Error('학생을 찾을 수 없습니다.'), { statusCode: 404 });
  return normalizeStudent(updated);
}

// ══════════════════════════════════════════════════════
//  클래스 통계
// ══════════════════════════════════════════════════════

async function getClassStats(teacherId) {
  const students = await Student.find({ teacherId, isActive: true }).lean();

  const withBoth = students.filter(s => s.comparison && s.pre && s.post);
  const withPre  = students.filter(s => s.pre);

  // 구인별 평균
  const constructAvgPre  = {};
  const constructAvgPost = {};
  CONSTRUCTS.forEach(id => {
    const preScores  = withBoth.map(s => s.pre.constructScores.find(c => c.constructId === id)?.averageScore ?? 0);
    const postScores = withBoth.map(s => s.post.constructScores.find(c => c.constructId === id)?.averageScore ?? 0);
    constructAvgPre[id]  = preScores.length  ? avg(preScores)  : 0;
    constructAvgPost[id] = postScores.length ? avg(postScores) : 0;
  });

  const improvements = CONSTRUCTS.map(id => ({
    id, diff: (constructAvgPost[id] ?? 0) - (constructAvgPre[id] ?? 0),
  }));
  const topImprovedConstruct = improvements.reduce((a, b) => a.diff > b.diff ? a : b).id;

  const avgPreTotal  = withBoth.length ? avg(withBoth.map(s => s.pre.totalAverage))  : 0;
  const avgPostTotal = withBoth.length ? avg(withBoth.map(s => s.post.totalAverage)) : 0;

  return {
    totalStudents: students.length,
    completedBoth: withBoth.length,
    completedPre:  withPre.length,
    avgPreTotal:   round(avgPreTotal),
    avgPostTotal:  round(avgPostTotal),
    avgImprovement: round(avgPostTotal - avgPreTotal),
    constructAvgPre, constructAvgPost,
    topImprovedConstruct,
  };
}

/** 그룹(모둠) 목록 조회 */
async function getGroups(teacherId) {
  const groups = await Student.distinct('group', { teacherId, isActive: true, group: { $ne: null } });
  return groups.filter(Boolean).sort();
}

// ══════════════════════════════════════════════════════
//  내부 헬퍼
// ══════════════════════════════════════════════════════

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
function round(n) { return Math.round(n * 100) / 100; }

function normalizeStudent(s) {
  const out = { ...s };
  out.id = (s._id || s.id).toString();
  delete out._id;
  delete out.__v;
  return out;
}

function sanitizeStudentInput(data) {
  const allowed = ['name','grade','group','studentCode','classId'];
  return Object.fromEntries(
    Object.entries(data).filter(([k]) => allowed.includes(k))
  );
}

function sanitizeDiagnosticResult(result, type) {
  return {
    resultId:        result.id || result.resultId,
    type,
    constructScores: (result.constructScores || []).map(cs => ({
      constructId:     cs.constructId,
      rawScores:       cs.rawScores || [],
      averageScore:    cs.averageScore,
      normalizedScore: cs.normalizedScore,
      level:           cs.level,
      improvement:     cs.improvement,
    })),
    totalAverage:    result.totalAverage,
    totalNormalized: result.totalNormalized,
    totalLevel:      result.totalLevel,
    completedAt:     result.completedAt ? new Date(result.completedAt) : new Date(),
    durationSeconds: result.durationSeconds,
  };
}

module.exports = {
  listStudents, getStudent, createStudent, updateStudent, deleteStudent, bulkDeleteStudents,
  saveDiagnosticPre, saveDiagnosticPost, saveAiComment,
  getClassStats, getGroups,
};
