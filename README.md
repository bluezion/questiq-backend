# QuestIQ 백엔드 API

AI 기반 학생 질문 역량 진단 플랫폼 — Node.js + Express + MongoDB

## 빠른 시작

```bash
cp .env.example .env
# .env에서 OPENAI_API_KEY, JWT_SECRET 설정
npm install
npm start
```

## Railway 배포 환경변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `OPENAI_API_KEY` | OpenAI API 키 | `sk-...` |
| `JWT_SECRET` | JWT 서명 키 (32자+) | `my_secret_32chars_xxxxx` |
| `MONGODB_URI` | MongoDB 연결 문자열 | Railway MongoDB URL |
| `NODE_ENV` | 실행 환경 | `production` |
| `ALLOWED_ORIGINS` | 프론트엔드 URL | `https://xxx.railway.app` |

## API 엔드포인트

- `POST /api/v1/auth/register` — 교사 회원가입
- `POST /api/v1/auth/login` — 로그인
- `GET  /api/v1/students` — 학생 목록
- `GET  /api/v1/classes` — 클래스 목록
- `POST /api/v1/submit/:code/pre` — 학생 사전진단 제출 (공개)
- `POST /api/v1/submit/:code/post` — 학생 사후진단 제출 (공개)
- `GET  /health` — 헬스체크
