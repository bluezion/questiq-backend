// src/utils/logger.js
// ─────────────────────────────────────────
// Winston 기반 구조화 로거
// ─────────────────────────────────────────
const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// logs 디렉토리 자동 생성
const logDir = path.dirname(config.log.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = createLogger({
  level: config.log.level,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'questiq-api' },
  transports: [
    new transports.File({ filename: config.log.file }),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
  ],
});

if (config.isDev) {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0
          ? '\n  ' + JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')
          : '';
        return `${timestamp} [${level}] ${message}${metaStr}`;
      })
    ),
  }));
}

module.exports = logger;
