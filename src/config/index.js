// src/config/index.js
// ─────────────────────────────────────────────────────
// 전역 설정 모듈 - 환경변수 검증 및 설정 통합 관리
// ─────────────────────────────────────────────────────
require('dotenv').config();

const config = {
  // 서버
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    fallbackModel: process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1500', 10),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0'),
  },

  // 데이터베이스
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'questiq',
    user: process.env.DB_USER || 'questiq_user',
    password: process.env.DB_PASSWORD || '',
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10),
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    classifyMax: parseInt(process.env.CLASSIFY_RATE_LIMIT_MAX || '30', 10),
  },

  // CORS
  cors: {
    origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(','),
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // 로깅
  log: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
};

// ── 필수 환경변수 검증 ──────────────────────────────
function validateConfig() {
  const errors = [];

  if (!config.openai.apiKey || config.openai.apiKey === 'sk-your-openai-api-key-here') {
    errors.push('OPENAI_API_KEY가 설정되지 않았습니다.');
  }

  if (config.nodeEnv === 'production') {
    if (!config.db.password) errors.push('DB_PASSWORD가 설정되지 않았습니다.');
    if (config.jwt.secret === 'dev_secret_change_in_production') {
      errors.push('JWT_SECRET을 안전한 값으로 변경해주세요.');
    }
  }

  if (errors.length > 0) {
    console.error('⚠️  환경변수 설정 오류:');
    errors.forEach(e => console.error(`   - ${e}`));
    if (config.nodeEnv === 'production') process.exit(1);
  }
}

validateConfig();

module.exports = config;
