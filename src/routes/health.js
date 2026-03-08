// src/routes/health.js
// ─────────────────────────────────────────────────────────
// 헬스체크 & API 정보 엔드포인트
// ─────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const config = require('../config');

// GET /health - 기본 헬스체크
router.get('/', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    service: 'QuestIQ Question Classifier API',
    version: '1.0.0',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// GET /health/detailed - 상세 헬스체크 (의존성 포함)
router.get('/detailed', async (req, res) => {
  const checks = {
    server: 'ok',
    openai: 'unknown',
    memory: 'ok',
  };

  // OpenAI API 키 존재 여부 확인
  checks.openai = config.openai.apiKey && !config.openai.apiKey.includes('your-') ? 'ok' : 'not_configured';

  // 메모리 사용량 확인
  const memUsage = process.memoryUsage();
  const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
  checks.memory = heapUsedMb < 512 ? 'ok' : 'warning';

  const allOk = Object.values(checks).every(v => v === 'ok');

  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    system: {
      node_version: process.version,
      memory_heap_used_mb: heapUsedMb,
      uptime_seconds: Math.floor(process.uptime()),
    },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
