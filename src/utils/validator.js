// src/utils/validator.js
// ─────────────────────────────────────────────────────────
// Joi 기반 요청 데이터 검증 스키마
// ─────────────────────────────────────────────────────────
const Joi = require('joi');

// ── 학년 목록 ──────────────────────────────────────────
const VALID_GRADES = [
  '초등 1학년', '초등 2학년', '초등 3학년',
  '초등 4학년', '초등 5학년', '초등 6학년',
  '중학 1학년', '중학 2학년', '중학 3학년',
  '고등 1학년', '고등 2학년', '고등 3학년',
  '기타',
];

// ── 교과 목록 ──────────────────────────────────────────
const VALID_SUBJECTS = [
  '국어', '영어', '수학', '과학', '사회', '역사', '도덕/윤리',
  '음악', '미술', '체육', '기술/가정', '정보', '한문',
  '통합교과', '일반', '기타',
];

/**
 * 단일 질문 분류 요청 스키마
 */
const classifySchema = Joi.object({
  question: Joi.string()
    .trim()
    .min(3)
    .max(500)
    .required()
    .messages({
      'string.min': '질문은 최소 3자 이상 입력해주세요.',
      'string.max': '질문은 500자 이내로 입력해주세요.',
      'any.required': '질문(question) 필드는 필수입니다.',
    }),

  grade: Joi.string()
    .valid(...VALID_GRADES)
    .default('기타')
    .messages({
      'any.only': `학년은 다음 중 하나여야 합니다: ${VALID_GRADES.join(', ')}`,
    }),

  subject: Joi.string()
    .valid(...VALID_SUBJECTS)
    .default('일반')
    .messages({
      'any.only': `교과는 다음 중 하나여야 합니다: ${VALID_SUBJECTS.join(', ')}`,
    }),

  context: Joi.string()
    .trim()
    .max(200)
    .optional()
    .allow('')
    .messages({
      'string.max': '추가 맥락은 200자 이내로 입력해주세요.',
    }),
});

/**
 * 배치 질문 분류 요청 스키마 (최대 10개)
 */
const batchClassifySchema = Joi.object({
  questions: Joi.array()
    .items(
      Joi.object({
        question: Joi.string().trim().min(3).max(500).required(),
        grade: Joi.string().valid(...VALID_GRADES).default('기타'),
        subject: Joi.string().valid(...VALID_SUBJECTS).default('일반'),
      })
    )
    .min(1)
    .max(10)
    .required()
    .messages({
      'array.min': '최소 1개 이상의 질문이 필요합니다.',
      'array.max': '한 번에 최대 10개까지 분류 가능합니다.',
      'any.required': 'questions 배열은 필수입니다.',
    }),
});

/**
 * QFT 세션 분석 요청 스키마
 */
const qftSessionSchema = Joi.object({
  session_id: Joi.string().uuid().required(),
  questions: Joi.array()
    .items(Joi.string().trim().min(1).max(500))
    .min(3)
    .max(30)
    .required()
    .messages({
      'array.min': 'QFT 분석을 위해 최소 3개의 질문이 필요합니다.',
      'array.max': '최대 30개 질문까지 분석 가능합니다.',
    }),
  grade: Joi.string().valid(...VALID_GRADES).default('기타'),
  subject: Joi.string().valid(...VALID_SUBJECTS).default('일반'),
  qft_step: Joi.number().integer().min(1).max(5).default(5),
});

/**
 * 검증 미들웨어 생성 헬퍼
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: '입력값 검증 오류',
        details: error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      });
    }

    req.body = value; // 정제된 값으로 교체
    return next();
  };
}

module.exports = {
  validate,
  classifySchema,
  batchClassifySchema,
  qftSessionSchema,
  VALID_GRADES,
  VALID_SUBJECTS,
};
