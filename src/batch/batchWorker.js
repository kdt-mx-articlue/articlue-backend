/**
 * 배치 자식 프로세스 진입점
 *
 *   node src/batch/batchWorker.js <JOB_NAME> <RUN_ID>
 *
 * API 서버(app.js)와 분리된 프로세스에서 실행되므로
 * 크롤링 중 예외·메모리 증가가 발생해도 API 서버에는 영향을 주지 않는다.
 * 종료 시 BATCH_RUN 상태를 기록하고, 프로세스가 끝나면 메모리는 모두 반환된다.
 */
require("dotenv").config({ quiet: true });

const { initOraclePool, getConnection, closeOraclePool } = require("../config/db");
const batchRunRepository = require("../repositories/batchRun.repository");
const { BATCH_JOBS } = require("./batchJobs");

const [jobName, runIdArg] = process.argv.slice(2);
const runId = Number(runIdArg);

async function finish(status, { summary = null, errorMessage = null } = {}) {
    let conn;
    try {
        conn = await getConnection();
        await batchRunRepository.finishRun({ runId, status, summary, errorMessage }, conn);
    } finally {
        if (conn) await conn.close();
    }
}

async function main() {
    const job = BATCH_JOBS[jobName];

    if (!job || !Number.isFinite(runId)) {
        throw new Error(`잘못된 배치 실행 인자: ${jobName} ${runIdArg}`);
    }

    await initOraclePool();

    console.log(`[Batch:${jobName}#${runId}] 시작`);

    try {
        const { summary, failedSources = [] } = await require(job.module).run({ runId });
        const status = failedSources.length > 0 ? "PARTIAL" : "SUCCESS";

        await finish(status, {
            summary,
            errorMessage: failedSources.length > 0
                ? failedSources.map((f) => `${f.source}: ${f.message}`).join("\n")
                : null,
        });

        console.log(`[Batch:${jobName}#${runId}] ${status}`, JSON.stringify(summary));
    } catch (error) {
        console.error(`[Batch:${jobName}#${runId}] FAILED`, error);
        await finish("FAILED", { errorMessage: error.stack || error.message });
        process.exitCode = 1;
    } finally {
        await closeOraclePool();
    }
}

main()
    .catch((error) => {
        // DB 연결 실패 등으로 상태 기록조차 못 한 경우 → 부모 프로세스가 FAILED 로 기록
        console.error(`[Batch:${jobName}#${runId}] 실행 불가`, error);
        process.exitCode = 1;
    })
    .finally(() => process.exit());
