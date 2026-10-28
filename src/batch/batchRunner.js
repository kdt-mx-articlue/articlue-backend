const path = require("path");
const { fork } = require("child_process");

const { getConnection } = require("../config/db");
const batchRunRepository = require("../repositories/batchRun.repository");
const { BATCH_JOBS } = require("./batchJobs");

const WORKER_PATH = path.join(__dirname, "batchWorker.js");

// 배치 프로세스 메모리 상한 (MB) — 넘으면 해당 배치만 종료되고 API 서버는 유지
const WORKER_MAX_OLD_SPACE_MB = Number(process.env.BATCH_MAX_OLD_SPACE_MB || 256);

// jobName → { runId, child, startedAt }
const runningJobs = new Map();

async function withConnection(fn) {
    let conn;
    try {
        conn = await getConnection();
        return await fn(conn);
    } finally {
        if (conn) await conn.close();
    }
}

/**
 * 배치를 자식 프로세스로 실행한다. 실행 완료를 기다리지 않고 runId 만 반환.
 * 같은 배치가 이미 실행 중이면 새로 실행하지 않는다.
 */
async function triggerBatch(jobName, triggerType) {
    const job = BATCH_JOBS[jobName];

    if (!job) {
        const error = new Error(`알 수 없는 배치입니다: ${jobName}`);
        error.status = 400;
        throw error;
    }

    const running = runningJobs.get(jobName);
    if (running) {
        return { started: false, runId: running.runId, message: "이미 실행 중입니다." };
    }

    const runId = await withConnection((conn) =>
        batchRunRepository.createRun({ jobName, triggerType }, conn)
    );

    const child = fork(WORKER_PATH, [jobName, String(runId)], {
        execArgv: [`--max-old-space-size=${WORKER_MAX_OLD_SPACE_MB}`],
        env: {
            ...process.env,
            ORACLE_POOL_MIN: "0",
            ORACLE_POOL_MAX: "2",
        },
    });

    runningJobs.set(jobName, { runId, child, startedAt: new Date() });

    const timeout = setTimeout(() => {
        console.error(`[Batch:${jobName}#${runId}] 제한 시간 초과 → 강제 종료`);
        child.kill("SIGKILL");
    }, job.timeoutMs);

    child.on("exit", (code, signal) => {
        clearTimeout(timeout);
        runningJobs.delete(jobName);

        // 워커가 정상적으로 상태를 기록했다면 RUNNING 이 아니므로 아래 UPDATE 는 영향 없음
        withConnection((conn) =>
            batchRunRepository.finishRun(
                {
                    runId,
                    status: "FAILED",
                    errorMessage: `배치 프로세스 비정상 종료 (code=${code}, signal=${signal})`,
                },
                conn
            )
        ).catch((error) =>
            console.error(`[Batch:${jobName}#${runId}] 종료 상태 기록 실패: ${error.message}`)
        );
    });

    child.on("error", (error) => {
        console.error(`[Batch:${jobName}#${runId}] 프로세스 오류: ${error.message}`);
    });

    console.log(`[Batch:${jobName}#${runId}] ${triggerType} 실행 시작 (pid=${child.pid})`);

    return { started: true, runId };
}

function getRunningJobs() {
    return [...runningJobs.entries()].map(([jobName, info]) => ({
        jobName,
        runId: info.runId,
        startedAt: info.startedAt,
    }));
}

function stopAllBatches() {
    for (const { child } of runningJobs.values()) {
        child.kill("SIGTERM");
    }
}

module.exports = {
    triggerBatch,
    getRunningJobs,
    stopAllBatches,
    withConnection,
};
