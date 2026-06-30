require("dotenv").config();

// 1. 프레임워크 load
const express = require("express");
const swaggerUi = require("swagger-ui-express");

// 2. 환경설정 load
const env = require("./config/env.js");
const { initOraclePool, closeOraclePool } = require("./config/db");
const corsMiddleware = require("./config/cors");

// DBR 기사 크롤링
// const { initializeContext } = require("./services/article.service");
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
const { runPipeline } = require("./pipeline/article.pipeline");
const pipelineRouter = require("./routes/pipeline.route");
const coverLetterRoutes = require("./routes/coverLetter.route.js");

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
app.use("/api/test", testRoutes);

// ⚠️ 임시 디버그
app.get("/api/debug/jp-count", async (req, res) => {
    const { getConnection } = require("./config/db");
    const oracledb = require("oracledb");
    let conn;
    try {
        conn = await getConnection();
        const r1 = await conn.execute("SELECT COUNT(*) AS CNT FROM JOB_POSTING", {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const r2 = await conn.execute("SELECT COUNT(*) AS CNT FROM COMPANY", {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const r3 = await conn.execute(
            "SELECT jp.job_posting_id, c.company_name, jp.job_name FROM job_posting jp JOIN company c ON jp.company_id = c.company_id WHERE ROWNUM <= 3",
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ jobPostingCount: r1.rows[0].CNT, companyCount: r2.rows[0].CNT, sample: r3.rows });
    } catch(e) { res.status(500).json({ error: e.message }); }
    finally { if (conn) await conn.close(); }
});


// 서버 실행
async function startServer() {
    try {
        // 1. Oracle Pool 생성
        await initOraclePool();

        // 2. today_articles.json 초기화
        // await initializeContext();

        runPipeline(5).catch(err =>
            console.error("[Pipeline] 백그라운드 파이프라인 실패:", err)
        );

        // 3. Scheduler 시작
        startScheduler();

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