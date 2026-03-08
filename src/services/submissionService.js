// src/services/submissionService.js
// ─────────────────────────────────────────────────────────────────────────────
// 학생 공유 링크 진단 제출 처리
// - 비인증 제출 (학생용)
// - 교사 검토/승인/거절/병합 (인증 필요)
// ─────────────────────────────────────────────────────────────────────────────
const DiagnosticSubmission = require('../models/DiagnosticSubmission');
const Class    = require('../models/Class');
const Student  = require('../models/Student');
const classSvc = require('./classService');
const studentSvc = require('./studentService');
const logger   = require('../utils/logger');

// ══════════════════════════════════════════════════════
//  학생 제출 (비인증)
// ══════════════════════════════════════════════════════

/**
 * 학생이 shareCode로 진단 결과 제출
 * 리턴: { submissionId, status:'pending', message }
 */
async function submitDiagnostic({ shareCode, studentName, studentCode, grade,
  diagnosticType, constructScores, totalAverage, totalNormalized, totalLevel,
  durationSeconds, fingerprint, ipAddress }) {

  // 1) 클래스 유효성 검사
  const cls = await Class.findOne({ shareCode: shareCode.toUpperCase(), isActive: true });
  if (!cls) throw makeErr('유효하지 않은 공유 코드입니다.', 404);

  const settings = cls.linkSettings;
  if (!settings.isOpen) throw makeErr('현재 진단 링크가 비활성화되어 있습니다.', 403);
  if (settings.expiresAt && new Date() > settings.expiresAt)
    throw makeErr('진단 링크가 만료되었습니다.', 403);
  if (diagnosticType === 'pre'  && !settings.allowPre)
    throw makeErr('사전 진단이 허용되지 않습니다.', 403);
  if (diagnosticType === 'post' && !settings.allowPost)
    throw makeErr('사후 진단이 허용되지 않습니다.', 403);
  if (settings.requireName && !studentName?.trim())
    throw makeErr('이름을 입력해주세요.', 400);

  // 2) maxSubmissions 체크
  if (settings.maxSubmissions) {
    const count = await DiagnosticSubmission.countDocuments({
      classId: cls._id, status: { $in: ['pending','approved','merged'] }
    });
    if (count >= settings.maxSubmissions)
      throw makeErr('최대 제출 수에 도달했습니다.', 429);
  }

  // 3) 저장
  const submission = await DiagnosticSubmission.create({
    classId:      cls._id,
    teacherId:    cls.teacherId,
    shareCode:    cls.shareCode,
    studentName:  studentName.trim(),
    studentCode:  studentCode?.trim(),
    grade:        grade?.trim() || cls.grade,
    diagnosticType,
    constructScores: constructScores.map(cs => ({
      constructId:     cs.constructId,
      rawScores:       cs.rawScores || [],
      averageScore:    cs.averageScore,
      normalizedScore: cs.normalizedScore,
      level:           cs.level,
    })),
    totalAverage, totalNormalized, totalLevel, durationSeconds,
    fingerprint, ipAddress,
    status: 'pending',
  });

  logger.info('진단 제출 완료', {
    submissionId: submission._id,
    classId: cls._id, shareCode, studentName, diagnosticType,
  });

  return {
    submissionId: submission._id.toString(),
    status: 'pending',
    message: '진단 결과가 제출되었습니다. 교사가 확인 후 반영합니다.',
  };
}

// ══════════════════════════════════════════════════════
//  교사 검토 (인증 필요)
// ══════════════════════════════════════════════════════

/** 클래스별 제출 목록 조회 */
async function listSubmissions(teacherId, classId, { status, page=1, limit=50 } = {}) {
  const query = { teacherId, classId };
  if (status) query.status = status;

  const [items, total] = await Promise.all([
    DiagnosticSubmission.find(query)
      .sort({ submittedAt: -1 })
      .skip((page-1)*limit).limit(limit).lean(),
    DiagnosticSubmission.countDocuments(query),
  ]);

  return {
    submissions: items.map(s => normalizeSubmission(s)),
    pagination: { page, limit, total, totalPages: Math.ceil(total/limit) },
  };
}

/**
 * 단건 승인 + Student 자동 병합
 * - 동일 이름 학생이 이미 있으면 → 해당 학생에 진단 결과 추가
 * - 없으면 → 신규 학생 생성 후 진단 결과 추가
 */
async function approveSubmission(teacherId, submissionId, { mergeToStudentId } = {}) {
  const sub = await DiagnosticSubmission.findOne({ _id: submissionId, teacherId });
  if (!sub) throw makeErr('제출 항목을 찾을 수 없습니다.', 404);
  if (sub.status !== 'pending') throw makeErr(`이미 ${sub.status} 상태입니다.`, 409);

  let studentId = mergeToStudentId;

  // 기존 학생 자동 매칭 (같은 클래스 + 이름 일치)
  if (!studentId) {
    const existing = await Student.findOne({
      teacherId, classId: sub.classId, isActive: true,
      name: { $regex: `^${sub.studentName.trim()}$`, $options: 'i' },
    });
    if (existing) studentId = existing._id.toString();
  }

  // 학생 없으면 신규 생성
  if (!studentId) {
    const newStudent = await studentSvc.createStudent(teacherId, {
      name:        sub.studentName,
      grade:       sub.grade,
      studentCode: sub.studentCode,
      classId:     sub.classId.toString(),
    });
    studentId = newStudent.id;
  }

  // 진단 결과 병합
  const diagResult = {
    id: sub._id.toString(),
    type: sub.diagnosticType,
    constructScores:  sub.constructScores,
    totalAverage:     sub.totalAverage,
    totalNormalized:  sub.totalNormalized,
    totalLevel:       sub.totalLevel,
    completedAt:      sub.submittedAt.toISOString(),
    durationSeconds:  sub.durationSeconds,
  };

  if (sub.diagnosticType === 'pre') {
    await studentSvc.saveDiagnosticPre(teacherId, studentId, diagResult);
  } else {
    await studentSvc.saveDiagnosticPost(teacherId, studentId, diagResult);
  }

  // 제출 상태 업데이트
  await DiagnosticSubmission.findByIdAndUpdate(submissionId, {
    $set: { status: 'merged', studentId, reviewedAt: new Date() }
  });

  // 클래스 통계 캐시 갱신 (비동기)
  classSvc.refreshStatsCache(sub.classId).catch(() => {});

  logger.info('제출 승인 완료', { submissionId, studentId, diagnosticType: sub.diagnosticType });

  return { submissionId, studentId, status: 'merged' };
}

/** 일괄 승인 */
async function bulkApprove(teacherId, submissionIds) {
  const results = await Promise.allSettled(
    submissionIds.map(id => approveSubmission(teacherId, id))
  );
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed    = results.filter(r => r.status === 'rejected').length;
  return { succeeded, failed };
}

/** 거절 */
async function rejectSubmission(teacherId, submissionId, note = '') {
  const result = await DiagnosticSubmission.findOneAndUpdate(
    { _id: submissionId, teacherId, status: 'pending' },
    { $set: { status: 'rejected', reviewedAt: new Date(), reviewNote: note } },
    { new: true }
  );
  if (!result) throw makeErr('제출 항목을 찾을 수 없거나 이미 처리되었습니다.', 404);
  return normalizeSubmission(result.toObject());
}

/** 대기 중 제출 수 조회 */
async function getPendingCount(teacherId) {
  const counts = await DiagnosticSubmission.aggregate([
    { $match: { teacherId: new (require('mongoose').Types.ObjectId)(teacherId), status: 'pending' } },
    { $group: { _id: '$classId', count: { $sum: 1 } } },
  ]);
  return counts;
}

// ══════════════════════════════════════════════════════
//  헬퍼
// ══════════════════════════════════════════════════════

function normalizeSubmission(s) {
  const out = { ...s };
  out.id        = (s._id || s.id).toString();
  out.classId   = s.classId?.toString();
  out.teacherId = s.teacherId?.toString();
  out.studentId = s.studentId?.toString() || null;
  delete out._id; delete out.__v;
  return out;
}

function makeErr(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

module.exports = {
  submitDiagnostic, listSubmissions,
  approveSubmission, bulkApprove, rejectSubmission,
  getPendingCount,
};
