// src/server.js
// ─────────────────────────────────────────────────────────────────────────────
// 서버 진입점 - MongoDB 연결 후 HTTP 서버 시작
// ─────────────────────────────────────────────────────────────────────────────
const app    = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { connectMongoDB, disconnectMongoDB } = require('./db/mongoose');

async function startServer() {
  // ── MongoDB 연결 ─────────────────────────────────────
  try {
    await connectMongoDB();
  } catch (err) {
    logger.warn('MongoDB 연결 실패 — DB 없이 시작합니다 (분류 기능만 사용 가능)', {
      error: err.message,
      hint: 'MONGODB_URI 환경변수를 설정하거나 MongoDB를 실행해 주세요.',
    });
  }

  // ── HTTP 서버 시작 ───────────────────────────────────
  const server = app.listen(config.port, () => {
    logger.info('🚀 QuestIQ API 서버 시작', {
      port: config.port,
      environment: config.nodeEnv,
      model: config.openai.model,
    });

    if (config.isDev) {
      console.log(`\n╔══════════════════════════════════════════════════════╗`);
      console.log(`║  🎯 QuestIQ API 서버 실행 중                          ║`);
      console.log(`╠══════════════════════════════════════════════════════╣`);
      console.log(`║  📡 http://localhost:${config.port}                          ║`);
      console.log(`║  🤖 AI Model: ${config.openai.model.padEnd(38)}║`);
      console.log(`╠══════════════════════════════════════════════════════╣`);
      console.log(`║  질문 분류:                                           ║`);
      console.log(`║   POST /api/v1/classify         단일 질문 분류        ║`);
      console.log(`║   POST /api/v1/classify/batch   배치 분류             ║`);
      console.log(`║  교사 인증:                                           ║`);
      console.log(`║   POST /api/v1/auth/register    회원가입              ║`);
      console.log(`║   POST /api/v1/auth/login       로그인                ║`);
      console.log(`║  학생 관리:                                           ║`);
      console.log(`║   GET  /api/v1/students         학생 목록             ║`);
      console.log(`║   POST /api/v1/students         학생 추가             ║`);
      console.log(`║   PUT  .../diagnostic/pre       사전 진단 저장        ║`);
      console.log(`║   PUT  .../diagnostic/post      사후 진단 저장        ║`);
      console.log(`║   GET  /api/v1/students/stats   클래스 통계           ║`);
      console.log(`╠══════════════════════════════════════════════════════╣`);
      console.log(`║  클래스 관리:                                         ║`);
      console.log(`║   GET  /api/v1/classes          클래스 목록           ║`);
      console.log(`║   POST /api/v1/classes          클래스 생성           ║`);
      console.log(`║   PUT  /api/v1/classes/:id/link 링크 설정 변경        ║`);
      console.log(`║  학생 공개 제출:                                      ║`);
      console.log(`║   GET  /api/v1/submit/info/:code   링크 정보          ║`);
      console.log(`║   POST /api/v1/submit/:code/pre    사전 진단 제출     ║`);
      console.log(`║   POST /api/v1/submit/:code/post   사후 진단 제출     ║`);
      console.log(`╚══════════════════════════════════════════════════════╝\n`);
    }
  });

  // ── 우아한 종료 ─────────────────────────────────────
  async function gracefulShutdown(signal) {
    logger.info(`${signal} 수신 — 서버 종료 시작`);
    server.close(async () => {
      await disconnectMongoDB();
      logger.info('서버 정상 종료');
      process.exit(0);
    });
    setTimeout(() => { logger.warn('강제 종료'); process.exit(1); }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('미처리 Promise 거부', { reason: reason?.message || reason });
  });
  process.on('uncaughtException', (err) => {
    logger.error('처리되지 않은 예외', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  return server;
}

startServer().catch(err => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});
