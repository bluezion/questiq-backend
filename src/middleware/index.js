// src/middleware/index.js
// ─────────────────────────────────────────────────────────
// 공통 미들웨어 설정 (보안, 속도 제한, CORS, 로깅)
// ─────────────────────────────────────────────────────────
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const config = require('../config');
const logger = require('../utils/logger');

// ── CORS 설정 ──────────────────────────────────────────
const corsOptions = {
  origin: (origin, callback) => {
    // 개발 환경에서는 모든 origin 허용
    if (config.isDev || !origin) return callback(null, true);

    if (config.cors.origins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS 정책 위반: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400, // 24시간 preflight 캐시
};

// ── 전역 속도 제한 ────────────────────────────────────
const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '요청이 너무 많습니다. 15분 후 다시 시도해주세요.',
    retry_after: Math.ceil(config.rateLimit.windowMs / 1000),
  },
  skip: (req) => config.isDev && req.ip === '::1',
});

// ── 질문 분류 전용 속도 제한 (더 엄격) ───────────────
const classifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: config.rateLimit.classifyMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
  message: {
    success: false,
    error: `AI 분류 요청은 15분에 ${config.rateLimit.classifyMax}회로 제한됩니다.`,
  },
});

// ── Morgan HTTP 로거 스트림 ───────────────────────────
const morganStream = {
  write: (message) => logger.http(message.trim()),
};

// ── 모든 미들웨어 적용 함수 ───────────────────────────
function applyMiddleware(app) {
  // 1. 보안 헤더
  app.use(helmet({
    contentSecurityPolicy: config.isDev ? false : undefined,
  }));

  // 2. CORS
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // 3. Gzip 압축
  app.use(compression());

  // 4. JSON 파싱 (최대 10KB)
  app.use(require('express').json({ limit: '10kb' }));
  app.use(require('express').urlencoded({ extended: false, limit: '10kb' }));

  // 5. HTTP 요청 로깅
  app.use(morgan(
    config.isDev ? 'dev' : ':method :url :status :res[content-length] - :response-time ms',
    { stream: morganStream }
  ));

  // 6. 전역 Rate Limiting
  app.use('/api/', globalRateLimiter);

  // 7. 요청 ID 주입
  app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
    res.setHeader('X-Request-ID', req.requestId);
    next();
  });
}

module.exports = {
  applyMiddleware,
  classifyRateLimiter,
};
