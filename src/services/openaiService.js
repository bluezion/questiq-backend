// src/services/openaiService.js
// ─────────────────────────────────────────────────────────────────────────────
// OpenAI API 서비스 계층
// 역할: API 호출 추상화, 재시도 로직, 에러 처리, 응답 파싱
// ─────────────────────────────────────────────────────────────────────────────
const OpenAI = require('openai');
const config = require('../config');
const logger = require('../utils/logger');
const {
  SYSTEM_PROMPT,
  FEW_SHOT_MESSAGES,
  BATCH_SYSTEM_PROMPT,
  QFT_FEEDBACK_PROMPT,
  buildUserMessage,
} = require('../config/prompts');

// ── OpenAI 클라이언트 초기화 ───────────────────────────
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  timeout: 30000,       // 30초 타임아웃
  maxRetries: 2,        // 자동 재시도 2회
});

// ── 블룸 레벨 이모지 매핑 ─────────────────────────────
const BLOOM_EMOJI = {
  '기억': '📝', '이해': '💡', '적용': '🔧',
  '분석': '🔍', '평가': '⚖️', '창의': '✨',
};

// ── 마르자노 타입 한글 매핑 ────────────────────────────
const MARZANO_KO = {
  detail: '세부사항', category: '범주',
  elaboration: '정교화', evidence: '증거',
};


/**
 * ┌─────────────────────────────────────────────────────────┐
 * │  1. 단일 질문 분류 (Few-Shot + Chain-of-Thought)        │
 * └─────────────────────────────────────────────────────────┘
 */
async function classifyQuestion({ question, grade = '기타', subject = '일반', context = '' }) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  logger.info('질문 분류 시작', { requestId, grade, subject, questionLength: question.length });

  try {
    // ── 메시지 구성 ────────────────────────────────────
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...FEW_SHOT_MESSAGES,
      {
        role: 'user',
        content: buildUserMessage({ question, grade, subject, context }),
      },
    ];

    // ── GPT-4o API 호출 ────────────────────────────────
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      temperature: config.openai.temperature,
      max_tokens: config.openai.maxTokens,
      response_format: { type: 'json_object' },
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) throw new Error('OpenAI 응답이 비어있습니다.');

    // ── JSON 파싱 및 후처리 ────────────────────────────
    const parsed = JSON.parse(rawContent);
    const result = postProcessResult(parsed, { question, grade, subject, requestId });

    const elapsed = Date.now() - startTime;
    logger.info('질문 분류 완료', {
      requestId,
      bloomLevel: result.bloom_level,
      score: result.score,
      tokensUsed: response.usage?.total_tokens,
      elapsedMs: elapsed,
    });

    return {
      success: true,
      data: result,
      meta: {
        request_id: requestId,
        model_used: response.model,
        tokens_used: response.usage?.total_tokens || 0,
        elapsed_ms: elapsed,
      },
    };

  } catch (err) {
    logger.error('질문 분류 실패', {
      requestId,
      error: err.message,
      errorType: err.constructor.name,
    });

    // ── 폴백: 경량 모델로 재시도 ──────────────────────
    if (err.status !== 400 && config.openai.model !== config.openai.fallbackModel) {
      logger.warn('폴백 모델로 재시도', { requestId, fallbackModel: config.openai.fallbackModel });
      try {
        return await classifyWithFallback({ question, grade, subject, requestId });
      } catch (fallbackErr) {
        logger.error('폴백 모델도 실패', { requestId, error: fallbackErr.message });
        throw buildApiError(fallbackErr);
      }
    }

    throw buildApiError(err);
  }
}


/**
 * ┌─────────────────────────────────────────────────────────┐
 * │  2. 배치 질문 분류 (최대 10개)                          │
 * └─────────────────────────────────────────────────────────┘
 */
async function classifyBatch(questions) {
  const requestId = `batch_${Date.now()}`;
  const startTime = Date.now();

  logger.info('배치 분류 시작', { requestId, count: questions.length });

  // ── 직렬화된 질문 목록 구성 ────────────────────────
  const questionList = questions
    .map((q, i) => `[${i}] 학년: ${q.grade || '기타'} | 교과: ${q.subject || '일반'} | 질문: "${q.question}"`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.fallbackModel, // 배치는 비용 절감을 위해 mini 사용
      messages: [
        { role: 'system', content: BATCH_SYSTEM_PROMPT },
        { role: 'user', content: `다음 ${questions.length}개의 질문을 분류해주세요:\n\n${questionList}` },
      ],
      temperature: 0,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    });

    const rawContent = response.choices[0]?.message?.content;
    const parsed = JSON.parse(rawContent);

    // 배열 형식 정규화
    const items = Array.isArray(parsed) ? parsed : parsed.results || parsed.items || [];

    const results = items.map((item, i) => ({
      index: item.index ?? i,
      original_question: questions[i]?.question || '',
      ...postProcessResult(item, {
        question: questions[i]?.question || '',
        grade: questions[i]?.grade || '기타',
        subject: questions[i]?.subject || '일반',
      }),
    }));

    logger.info('배치 분류 완료', {
      requestId,
      count: results.length,
      tokensUsed: response.usage?.total_tokens,
      elapsedMs: Date.now() - startTime,
    });

    return {
      success: true,
      data: results,
      meta: {
        request_id: requestId,
        total: results.length,
        tokens_used: response.usage?.total_tokens || 0,
        elapsed_ms: Date.now() - startTime,
      },
    };

  } catch (err) {
    logger.error('배치 분류 실패', { requestId, error: err.message });
    throw buildApiError(err);
  }
}


/**
 * ┌─────────────────────────────────────────────────────────┐
 * │  3. QFT 세션 분석                                       │
 * └─────────────────────────────────────────────────────────┘
 */
async function analyzeQftSession({ sessionId, questions, grade, subject, qftStep }) {
  const requestId = `qft_${Date.now()}`;
  logger.info('QFT 세션 분석 시작', { requestId, sessionId, questionCount: questions.length });

  try {
    // 먼저 각 질문 개별 분류 (병렬 처리)
    const classifyPromises = questions.map(q =>
      classifyQuestion({ question: q, grade, subject })
        .then(r => r.data)
        .catch(() => ({ question: q, score: 1, bloom_level: '기억', open_closed: 'closed' }))
    );
    const classifiedQuestions = await Promise.all(classifyPromises);

    // QFT 전체 분석
    const qftResponse = await openai.chat.completions.create({
      model: config.openai.fallbackModel,
      messages: [
        { role: 'system', content: QFT_FEEDBACK_PROMPT },
        {
          role: 'user',
          content: `QFT 단계: ${qftStep}단계\n학년: ${grade}\n교과: ${subject}\n\n질문 목록:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const qftAnalysis = JSON.parse(qftResponse.choices[0].message.content);

    // 통계 계산
    const stats = calculateQftStats(classifiedQuestions);

    logger.info('QFT 세션 분석 완료', { requestId, sessionId });

    return {
      success: true,
      data: {
        session_id: sessionId,
        questions: classifiedQuestions,
        qft_analysis: qftAnalysis.qft_analysis || qftAnalysis,
        statistics: stats,
        qft_step: qftStep,
        analyzed_at: new Date().toISOString(),
      },
    };

  } catch (err) {
    logger.error('QFT 분석 실패', { requestId, error: err.message });
    throw buildApiError(err);
  }
}


/**
 * ┌─────────────────────────────────────────────────────────┐
 * │  4. 개선 제안 생성 (심화 피드백)                        │
 * └─────────────────────────────────────────────────────────┘
 */
async function generateImprovement({ question, currentResult, targetLevel }) {
  const targetBloom = targetLevel || Math.min(6, (currentResult.bloom_level_num || 1) + 1);

  const bloomNames = ['', '기억', '이해', '적용', '분석', '평가', '창의'];

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.fallbackModel,
      messages: [
        {
          role: 'system',
          content: `당신은 질문 코칭 전문가입니다. 학생의 질문을 블룸 분류학 ${bloomNames[targetBloom]}(Level ${targetBloom}) 수준으로 발전시키는 구체적인 지도 방법을 제공하세요.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            original_question: question,
            current_bloom_level: currentResult.bloom_level,
            current_score: currentResult.score,
            target_bloom_level: bloomNames[targetBloom],
            current_feedback: currentResult.feedback,
          }),
        },
      ],
      temperature: 0.4,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    });

    const improvement = JSON.parse(response.choices[0].message.content);
    return {
      success: true,
      data: {
        original_question: question,
        target_bloom_level: bloomNames[targetBloom],
        target_bloom_num: targetBloom,
        ...improvement,
      },
    };
  } catch (err) {
    throw buildApiError(err);
  }
}


// ═══════════════════════════════════════════════════════════
//  헬퍼 함수들
// ═══════════════════════════════════════════════════════════

/**
 * OpenAI 응답 후처리 - 점수 보정 및 메타데이터 추가
 */
function postProcessResult(parsed, { question, grade, subject, requestId }) {
  // 점수 안전 처리
  const rawScore = parseInt(parsed.score, 10) || 1;
  const score = Math.max(1, Math.min(10, rawScore));

  // 블룸 레벨 번호 정규화
  const bloomNum = parseInt(parsed.bloom_level_num, 10) || 1;

  // 레벨 배지 자동 산출 (AI 응답이 없을 때 폴백)
  const levelBadge = parsed.level_badge || computeLevelBadge(score);
  const levelBadgeEmoji = parsed.level_badge_emoji || computeLevelBadgeEmoji(score);

  return {
    // ── 분류 결과 ──────────────────────────
    open_closed: parsed.open_closed || 'closed',
    open_closed_ko: parsed.open_closed === 'open' ? '열린 질문' : '닫힌 질문',
    open_closed_reason: parsed.open_closed_reason || '',

    // ── 블룸 분류학 ────────────────────────
    bloom_level: parsed.bloom_level || '기억',
    bloom_level_num: bloomNum,
    bloom_emoji: BLOOM_EMOJI[parsed.bloom_level] || '📝',
    bloom_reason: parsed.bloom_reason || '',

    // ── 마르자노 ───────────────────────────
    marzano_type: parsed.marzano_type || 'detail',
    marzano_type_ko: MARZANO_KO[parsed.marzano_type] || '세부사항',
    marzano_reason: parsed.marzano_reason || '',

    // ── 점수 및 레벨 ───────────────────────
    score,
    level_badge: levelBadge,
    level_badge_emoji: levelBadgeEmoji,

    // ── 피드백 ─────────────────────────────
    feedback: parsed.feedback || '',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improved_question: parsed.improved_question || '',
    improvement_tip: parsed.improvement_tip || '',
    next_bloom_suggestion: parsed.next_bloom_suggestion || '',
    hint: parsed.hint || '',
    qft_connection: parsed.qft_connection || '',

    // ── 메타데이터 ─────────────────────────
    original_question: question,
    grade,
    subject,
    analyzed_at: new Date().toISOString(),
    ...(requestId && { request_id: requestId }),
  };
}

/**
 * 점수 기반 레벨 배지 계산
 */
function computeLevelBadge(score) {
  if (score <= 3) return '씨앗형';
  if (score <= 5) return '새싹형';
  if (score <= 7) return '꽃봉오리형';
  if (score <= 9) return '꽃형';
  return '열매형';
}

function computeLevelBadgeEmoji(score) {
  if (score <= 3) return '🌱';
  if (score <= 5) return '🌿';
  if (score <= 7) return '🌸';
  if (score <= 9) return '🌺';
  return '🍎';
}

/**
 * QFT 세션 통계 계산
 */
function calculateQftStats(classifiedQuestions) {
  const total = classifiedQuestions.length;
  if (total === 0) return {};

  const openCount = classifiedQuestions.filter(q => q.open_closed === 'open').length;
  const scores = classifiedQuestions.map(q => q.score || 1);
  const avgScore = scores.reduce((a, b) => a + b, 0) / total;

  const bloomCounts = {};
  classifiedQuestions.forEach(q => {
    bloomCounts[q.bloom_level] = (bloomCounts[q.bloom_level] || 0) + 1;
  });

  const marzanoCounts = {};
  classifiedQuestions.forEach(q => {
    marzanoCounts[q.marzano_type] = (marzanoCounts[q.marzano_type] || 0) + 1;
  });

  const topQuestion = classifiedQuestions.reduce(
    (best, q) => (q.score > (best?.score || 0) ? q : best), null
  );

  return {
    total_questions: total,
    open_count: openCount,
    closed_count: total - openCount,
    open_ratio: Math.round((openCount / total) * 100),
    average_score: Math.round(avgScore * 10) / 10,
    max_score: Math.max(...scores),
    min_score: Math.min(...scores),
    bloom_distribution: bloomCounts,
    marzano_distribution: marzanoCounts,
    top_question: topQuestion?.original_question || '',
    top_question_score: topQuestion?.score || 0,
  };
}

/**
 * 폴백 분류 (경량 모델 사용)
 */
async function classifyWithFallback({ question, grade, subject, requestId }) {
  const response = await openai.chat.completions.create({
    model: config.openai.fallbackModel,
    messages: [
      {
        role: 'system',
        content: '학생의 질문을 분석하세요. JSON 형식: {"open_closed":"open"|"closed","bloom_level":"기억"|"이해"|"적용"|"분석"|"평가"|"창의","bloom_level_num":1-6,"marzano_type":"detail"|"category"|"elaboration"|"evidence","score":1-10,"feedback":"...","improved_question":"..."}',
      },
      {
        role: 'user',
        content: `학년: ${grade}\n교과: ${subject}\n질문: "${question}"`,
      },
    ],
    temperature: 0,
    max_tokens: 600,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return {
    success: true,
    data: postProcessResult(parsed, { question, grade, subject, requestId }),
    meta: {
      request_id: requestId,
      model_used: config.openai.fallbackModel,
      fallback_used: true,
      tokens_used: response.usage?.total_tokens || 0,
    },
  };
}

/**
 * OpenAI 에러를 클라이언트 친화적 에러로 변환
 */
function buildApiError(err) {
  const error = new Error();

  if (err.status === 401) {
    error.message = 'OpenAI API 키가 유효하지 않습니다.';
    error.statusCode = 503;
  } else if (err.status === 429) {
    error.message = 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
    error.statusCode = 429;
  } else if (err.status === 400) {
    error.message = '잘못된 요청입니다. 질문 내용을 확인해주세요.';
    error.statusCode = 400;
  } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    error.message = 'AI 분석 시간이 초과되었습니다. 다시 시도해주세요.';
    error.statusCode = 504;
  } else {
    error.message = '질문 분석 중 오류가 발생했습니다.';
    error.statusCode = 500;
  }

  error.originalError = err.message;
  return error;
}

module.exports = {
  classifyQuestion,
  classifyBatch,
  analyzeQftSession,
  generateImprovement,
};
