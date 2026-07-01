# 🤖 Articlue — AI 커리어 매칭 플랫폼

> 이력서 한 번 입력으로 기업 매칭 · 자소서 생성 · AI 모의 면접까지 한 번에

---

## 📌 서비스 소개

**Articlue**는 취업 준비생을 위한 AI 기반 올인원 커리어 플랫폼입니다.  
커리어 프로필(이력서)을 등록하면 AI가 기업 적합도를 분석하고, 맞춤 자소서를 생성하며, 실전 모의 면접까지 제공합니다.

---

## 🖼️ 주요 화면

| 화면 | 설명 |
|------|------|
| **홈 대시보드** | 취업 준비도, AI 추천 기업 TOP3, 금주의 IT 인사이트 |
| **커리어 프로필** | GitHub 연동, 학력·경력·자격증·기술스택 등록 |
| **기업 매칭 분석** | 1차(이력서) · 2차(면접) 직무 적합도 레이더 차트 |
| **AI 모의 면접** | 챗봇 / 보이스(AI 아바타 아티) 2가지 모드 |
| **면접 리포트** | 5개 역량 점수 + 강점/보완점 + 추천 액션 플랜 |
| **마이페이지** | 활동 현황, 이용권, 자소서·면접 생성 기록 |

---

## ✨ 핵심 기능

| 기능 | 설명 |
|------|------|
| 커리어 프로필 | GitHub 연동, 학력·경력·자격증·기술스택·포트폴리오 등록 |
| 기업 매칭 | AI 벡터 검색 기반 직무 적합도 분석 (1차/2차) |
| 자소서 생성 | 기업·직무 맞춤 자소서 AI 자동 생성 |
| 모의 면접 | 챗봇/보이스 2가지 모드, 난이도·면접관 성향·질문 수 커스텀 |
| 면접 리포트 | 5개 역량 점수, 카테고리별 피드백, 추천 액션 플랜 |
| IT 인사이트 | 주간 IT 아티클 큐레이션 |
| 이용권 | 무료(Free) / 유료 멤버십 플랜 |

---

## 🛠️ 기술 스택

### Frontend
- **React** + Vite
- React Router, Zustand (전역 상태)
- Axios, Nginx (배포)

### Backend
- **Node.js** + Express
- Oracle DB (oracledb 드라이버 직접 사용)
- Kakao / Naver / GitHub 소셜 로그인

### AI
- **FastAPI** (Python 3.12)
- LangChain, ChromaDB (벡터 검색)
- OpenAI GPT (자소서 생성 · 면접 질문 · 피드백)
- HuggingFace Embeddings

### Infra
- **Docker Compose** 기반 멀티 컨테이너
- NCP (Naver Cloud Platform) 배포
- Nginx 리버스 프록시

---

## 🗂️ 프로젝트 구조

```
articlue/
├── articlue-frontend/   # React (Vite) — Nginx로 서빙, 포트 80
├── articlue-backend/    # Express API 서버, 포트 3000 (내부)
├── articlue-ai/         # FastAPI AI 서버, 포트 5000 (내부)
└── docker-compose.yml
```

### 컨테이너 통신 구조

```
외부 요청
    │
    ▼
[articlue-frontend : 80]  ← Nginx
    │  /api/* 프록시
    ▼
[articlue-backend : 3000]  ← Express
    │  AI 분석 요청
    ▼
[articlue-ai : 5000]  ← FastAPI
```

---

## 🚀 실행 방법

### 사전 준비
- Docker & Docker Compose 설치
- 각 서비스 `.env` 파일 구성 (`articlue-backend/.env`, `articlue-ai/.env`)

### 전체 실행

```bash
docker-compose up -d --build
```

### 특정 서비스만 재빌드

```bash
# 프론트엔드만
docker-compose up -d --build articlue-frontend

# 백엔드만
docker-compose up -d --build articlue-backend

# AI 서버만 (최초 실행 시 job 파싱 자동 수행)
docker-compose up -d --build articlue-ai
```

### 로그 확인

```bash
docker logs articlue-ai      # AI 서버 (job 파싱 상태 확인)
docker logs articlue-backend # 백엔드
docker logs articlue-frontend
```

> **참고**: AI 서버 최초 실행 시 벡터 DB가 없으면 job 파싱(`run_job_parsing`)이 자동 실행됩니다. 완료 후 `FastAPI 서버 시작...` 로그가 출력되면 정상입니다.

---

## 🌐 API 구조

| 서비스 | 주요 엔드포인트 |
|--------|----------------|
| 인증 | `POST /api/auth/login`, `/api/auth/kakao`, `/api/auth/naver` |
| 이력서 | `GET/POST/PUT /api/resumes` |
| 매칭 | `GET /api/matching/:jobPostingId` |
| 자소서 | `GET/POST /api/cover-letters` |
| 면접 | `POST /api/interviews/sessions`, `GET /api/interviews/sessions?memberId=` |
| 리포트 | `GET /api/interviews/report/:sessionId` |
| 기업 | `GET /api/job-postings`, `POST /api/favorites` |
| 프로필 | `GET /api/members/:id/profile` |

---

## 🎯 시연회 빠른 시작 (Demo Setup)

로그인 후 이력서가 없는 신규 유저는 `/demo-setup` 페이지로 자동 이동됩니다.

| 버튼 | 설명 |
|------|------|
| 프론트엔드 개발자로 시작 | React/Next.js 스택 샘플 이력서 자동 입력 |
| 백엔드 개발자로 시작 | Spring Boot/Node.js 스택 샘플 이력서 자동 입력 |
| AI 개발자로 시작 | LangChain/FastAPI 스택 샘플 이력서 자동 입력 |
| 직접 입력하기 | 빈 이력서 페이지로 이동 |

버튼 클릭 시 이력서 데이터가 자동으로 채워지고 `/resume`으로 이동합니다.  
GitHub URL과 포트폴리오는 사용자가 직접 입력합니다.

---

## ⚠️ 배포 시 주의사항

- AI 서버 최초 실행 시 벡터 DB 없으면 job 파싱 자동 실행 (수 분 소요), 완료 후 서비스 정상화
- 백엔드 `runPipeline`은 서버 시작과 무관하게 백그라운드 실행 — 파이프라인 실패해도 서버 영향 없음
- 배포 서버에 Playwright/Chrome 미설치 시 스케줄러 크롤링 에러 로그 발생 (서비스 영향 없음)
- `CORS_ORIGINS` 환경변수에 배포 도메인/IP 반드시 포함 필요

---

## 👥 팀

> Articlue 개발팀
