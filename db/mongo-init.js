// db/mongo-init.js
// ─────────────────────────────────────────────────────────────────────────────
// MongoDB 초기화 스크립트 (컨테이너 최초 실행 시 자동 실행)
// ─────────────────────────────────────────────────────────────────────────────

// questiq DB 선택
db = db.getSiblingDB('questiq');

// ── 컬렉션 & 인덱스 생성 ──────────────────────────────

// teachers 컬렉션
db.createCollection('teachers');
db.teachers.createIndex({ email: 1 }, { unique: true });
db.teachers.createIndex({ createdAt: -1 });

// students 컬렉션
db.createCollection('students');
db.students.createIndex({ teacherId: 1, name: 1 });
db.students.createIndex({ teacherId: 1, group: 1 });
db.students.createIndex({ teacherId: 1, addedAt: -1 });
db.students.createIndex(
  { teacherId: 1, 'comparison.totalImprovement': -1 },
  { sparse: true }
);
db.students.createIndex(
  { teacherId: 1, 'post.totalAverage': -1 },
  { sparse: true }
);

// ── 데모 교사 계정 삽입 ──────────────────────────────
// 비밀번호: demo1234 (bcrypt hash, rounds=12)
const DEMO_TEACHER_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGzmArfTEznpBIqfQvqLdA.1tEa';

const demoTeacherId = new ObjectId();
db.teachers.insertOne({
  _id:          demoTeacherId,
  email:        'demo@questiq.kr',
  passwordHash: DEMO_TEACHER_HASH,
  name:         '김선생',
  school:       'QuestIQ 데모 학교',
  subject:      '사회',
  role:         'teacher',
  isActive:     true,
  createdAt:    new Date(),
  updatedAt:    new Date(),
});

print('✅ MongoDB 초기화 완료 — 데모 교사 계정: demo@questiq.kr / demo1234');
