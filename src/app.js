require("dotenv").config();

// 1. 프레임워크 load
const express = require("express");
const swaggerUi = require("swagger-ui-express");

// 2. 환경설정 load
const env = require("./config/env.js");
const { initOraclePool, closeOraclePool } = require("./config/db");
const corsMiddleware = require("./config/cors");

// 배치 스케줄러 (DBR 아티클 매일 / 채용공고 매주) — 배치는 자식 프로세스로 실행
const { startScheduler, stopScheduler } = require("./scheduler/batch.scheduler");
const articleRoutes = require("./routes/article.route");
const { hashLegacyPasswords } = require("./services/auth.service");

// 라우팅포인트 load
const authRoutes = require("./routes/auth.route.js");
const memberRoutes = require("./routes/member.route.js");
const resumeRoutes = require("./routes/resume.route.js")
const githubRoutes = require("./routes/github.route.js");
const interviewRoutes = require("./routes/interview.route.js");
const jobPostingRotes = require("./routes/jobPosting.route.js");
const pipelineRouter = require("./routes/pipeline.route");
const coverLetterRoutes = require("./routes/coverLetter.route.js");
const adminRoutes = require("./routes/admin.route.js");

const app = express();

app.use(corsMiddleware);

// JSON Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 기사 크롤링 REST API Router
app.use("/api/articles", articleRoutes);

// Swagger API 문서
// app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// RESTful API Router
app.use("/api/auth", authRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/member", memberRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/job-postings", jobPostingRotes);
app.use("/api/cover-letters", coverLetterRoutes);
app.use("/api/admin", adminRoutes);


// 서버 실행
async function startServer() {
    try {
        // 1. Oracle Pool 생성
        await initOraclePool();

        // 1-1. 평문으로 남아 있는 기존 비밀번호를 해시로 변환 (DB 만 사용, 실패해도 기동은 계속)
        await hashLegacyPasswords();

        // 2. 배치 스케줄러 시작 (실패해도 API 서버는 계속 기동)
        //    DBR 아티클은 기동마다 돌리지 않고, 마지막 완료 후 하루가 지났을 때만 보충 실행
        await startScheduler();

        // 4. 서버 시작
        const server = app.listen(env.port, () => {
            console.log(`아티클루 백엔드가 http://localhost:${env.port} 에서 정상 작동 중입니다.`);
            console.log(`웹 명세서(Swagger) 주소: http://localhost:${env.port}/api-docs`);
        });

        // AI 분석 등 장시간 요청을 위해 소켓 타임아웃 무기한으로 설정
        server.setTimeout(0);

    } catch (error) {
        console.error("서버 시작 실패:", error);
        process.exit(1);
    }
}

async function shutdown(signal) {
    console.log(`${signal} received. Closing server resources...`);

    stopScheduler();

    await closeOraclePool();

    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", async (error) => {
    console.error("Uncaught Exception:", error);

    await closeOraclePool();

    process.exit(1);
});

startServer();