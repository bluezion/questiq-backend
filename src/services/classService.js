// src/services/classService.js
// ─────────────────────────────────────────────────────────────────────────────
// 클래스(학급) CRUD + 통계 캐시 갱신
// ─────────────────────────────────────────────────────────────────────────────
const Class   = require('../models/Class');
const Student = require('../models/Student');
const logger  = require('../utils/logger');

// ══════════════════════════════════════════════════════
//  클래스 CRUD
// ══════════════════════════════════════════════════════

/** 클래스 목록 조회 */
async function listClasses(teacherId) {
  const classes = await Class.find({ teacherId, isActive: true })
    .sort({ createdAt: -1 }).lean();
  return classes.map(normalizeClass);
}

/** 클래스 단건 조회 */
async function getClass(teacherId, classId) {
  const cls = await Class.findOne({ _id: classId, teacherId, isActive: true }).lean();
  if (!cls) return null;
  return normalizeClass(cls);
}

/** shareCode로 공개 조회 (인증 불필요) */
async function getClassByShareCode(shareCode) {
  const cls = await Class.findOne({ shareCode: shareCode.toUpperCase(), isActive: true }).lean();
  if (!cls) return null;
  // 공개 정보만 반환
  return {
    id:          cls._id.toString(),
    name:        cls.name,
    school:      cls.school,
    grade:       cls.grade,
    subject:     cls.subject,
    shareCode:   cls.shareCode,
    linkSettings: cls.linkSettings,
    teacherId:   cls._id.toString(), // 교사 ID (학생 매칭용)
    _teacherId:  cls.teacherId,      // 실제 ObjectId (내부용)
  };
}

/** 클래스 생성 */
async function createClass(teacherId, data) {
  const cls = await Class.create({ teacherId, ...sanitizeClassInput(data) });
  logger.info('클래스 생성', { teacherId, classId: cls._id, name: cls.name });
  return normalizeClass(cls.toObject());
}

/** 클래스 수정 */
async function updateClass(teacherId, classId, data) {
  const updated = await Class.findOneAndUpdate(
    { _id: classId, teacherId, isActive: true },
    { $set: { ...sanitizeClassInput(data), updatedAt: new Date() } },
    { new: true, lean: true }
  );
  if (!updated) return null;
  return normalizeClass(updated);
}

/** 클래스 삭제 (soft) */
async function deleteClass(teacherId, classId) {
  const result = await Class.findOneAndUpdate(
    { _id: classId, teacherId },
    { $set: { isActive: false, updatedAt: new Date() } }
  );
  return !!result;
}

/** 공유 코드 재발급 */
async function regenerateShareCode(teacherId, classId) {
  const crypto = require('crypto');
  const newCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const updated = await Class.findOneAndUpdate(
    { _id: classId, teacherId, isActive: true },
    { $set: { shareCode: newCode, updatedAt: new Date() } },
    { new: true, lean: true }
  );
  if (!updated) return null;
  return normalizeClass(updated);
}

/** 링크 설정 변경 */
async function updateLinkSettings(teacherId, classId, settings) {
  const allowed = ['isOpen','allowPre','allowPost','requireName','requireStudentId','expiresAt','maxSubmissions'];
  const patch = {};
  for (const [k, v] of Object.entries(settings)) {
    if (allowed.includes(k)) patch[`linkSettings.${k}`] = v;
  }
  const updated = await Class.findOneAndUpdate(
    { _id: classId, teacherId, isActive: true },
    { $set: { ...patch, updatedAt: new Date() } },
    { new: true, lean: true }
  );
  return updated ? normalizeClass(updated) : null;
}

// ══════════════════════════════════════════════════════
//  통계 캐시 갱신
// ══════════════════════════════════════════════════════

async function refreshStatsCache(classId) {
  const students = await Student.find({ classId, isActive: true }).lean();
  const statsCache = {
    totalStudents:  students.length,
    completedPre:   students.filter(s => s.pre).length,
    completedPost:  students.filter(s => s.post).length,
    avgImprovement: (() => {
      const withBoth = students.filter(s => s.comparison?.totalImprovement != null);
      if (!withBoth.length) return 0;
      return Math.round(
        withBoth.reduce((a, s) => a + (s.comparison.totalImprovement || 0), 0) /
        withBoth.length * 100
      ) / 100;
    })(),
    updatedAt: new Date(),
  };
  await Class.findByIdAndUpdate(classId, { $set: { statsCache } });
  return statsCache;
}

// ══════════════════════════════════════════════════════
//  헬퍼
// ══════════════════════════════════════════════════════

function normalizeClass(c) {
  const out = { ...c };
  out.id = (c._id || c.id).toString();
  delete out._id; delete out.__v;
  if (out.teacherId) out.teacherId = out.teacherId.toString();
  return out;
}

function sanitizeClassInput(data) {
  const allowed = ['name','school','grade','subject','year','description'];
  return Object.fromEntries(
    Object.entries(data).filter(([k]) => allowed.includes(k))
  );
}

module.exports = {
  listClasses, getClass, getClassByShareCode,
  createClass, updateClass, deleteClass,
  regenerateShareCode, updateLinkSettings,
  refreshStatsCache,
};
