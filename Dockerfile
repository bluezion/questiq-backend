FROM node:20-alpine

WORKDIR /app

# 의존성 설치 레이어 (캐시 최적화)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 소스 코드 복사
COPY src/ ./src/

# 비루트 사용자로 실행 (보안)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S questiq -u 1001 -G nodejs && \
    mkdir -p logs && chown questiq:nodejs logs

USER questiq

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
