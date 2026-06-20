require("dotenv").config();

// 1. 프레임워크 load
const express = require("express");
const swaggerUi = require("swagger-ui-express");

// 2. 환경설정 load
const env = require("./config/env.js");
const { initOraclePool, closeOraclePool } = require("./config/db");
const corsMiddleware = require("./config/cors");

// DBR 기사 크롤링
const { initializeContext } = require("./services/article.service");
const { startScheduler, stopScheduler } = require("./scheduler/article.scheduler");
const articleRoutes = require("./routes/article.route");

// 라우팅포인트 load
const testRoutes = require("./routes/test.route.js");
const authRoutes = require("./routes/auth.route.js");
const memberRoutes = require("./routes/member.route.js");
const resumeRoutes = require("./routes/resume.route.js")
const githubRoutes = require("./routes/github.route.js");
const interviewRoutes = require("./routes/interview.route.js");
const jobPostingRotes = require("./routes/jobPosting.route.js");

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
// app.use("/api/member", memberRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/job-postings", jobPostingRotes);
app.use("/api/test", testRoutes);

// 서버 실행
async function startServer() {
    try {
        // 1. Oracle Pool 생성
        await initOraclePool();

        // 2. today_articles.json 초기화
        await initializeContext();

        // 3. Scheduler 시작
        startScheduler();

        // 4. 서버 시작
        app.listen(env.port, () => {
            console.log(`아티클루 백엔드가 http://localhost:${env.port} 에서 정상 작동 중입니다.`);
            console.log(`웹 명세서(Swagger) 주소: http://localhost:${env.port}/api-docs`);
        });

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