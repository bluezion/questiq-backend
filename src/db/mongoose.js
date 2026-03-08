// src/db/mongoose.js
// ─────────────────────────────────────────────────────────────────────────────
// MongoDB 연결 관리 (Mongoose)
// 재연결 로직, 연결 풀, graceful shutdown 포함
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/questiq';

const CONN_OPTIONS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
};

let isConnected = false;

async function connectMongoDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(MONGO_URI, CONN_OPTIONS);
    isConnected = true;
    logger.info('✅ MongoDB 연결 성공', { uri: MONGO_URI.replace(/:\/\/.*@/, '://***@') });
  } catch (err) {
    logger.error('❌ MongoDB 연결 실패', { error: err.message });
    throw err;
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('MongoDB 연결 해제됨 — 재연결 시도...');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  logger.info('MongoDB 재연결 성공');
});

async function disconnectMongoDB() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB 연결 종료');
}

function getConnectionStatus() {
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  return {
    state: states[mongoose.connection.readyState] || 'unknown',
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
}

module.exports = { connectMongoDB, disconnectMongoDB, getConnectionStatus };
