const cron = require("node-cron");

const batchRunRepository = require("../repositories/batchRun.repository");
const { BATCH_JOBS } = require("../batch/batchJobs");
const { triggerBatch, stopAllBatches, withConnection } = require("../batch/batchRunner");

// 기동 직후 AI 서버가 준비될 때까지 기다린 뒤 밀린 배치 실행
const CATCHUP_DELAY_MS = Number(process.env.BATCH_CATCHUP_DELAY_MS || 2 * 60 * 1000);

const scheduledTasks = [];
let catchUpTimer = null;

function isBatchEnabled() {
    return String(process.env.BATCH_ENABLED || "true").toLowerCase() !== "false";
}

async function safeTrigger(jobName, triggerType) {
    try {
        await triggerBatch(jobName, triggerType);
    } catch (error) {
        // 배치 실행 실패가 API 서버로 전파되지 않도록 여기서 종료
        console.error(`[Scheduler] ${jobName} ${triggerType} 실행 실패: ${error.message}`);
    }
}

/**
 * 마지막 정상 완료 후 catchUpAfterMs 가 지난 배치를 1회 실행
 * - 서버가 꺼져 있어 정기 실행을 놓친 경우
 * - 배치가 실패해 코드를 수정하고 재배포한 경우 (재배포 = 재기동 → 자동 재실행)
 */
async function runCatchUp() {
    for (const [jobName, job] of Object.entries(BATCH_JOBS)) {
        try {
            const lastCompletedAt = await withConnection((conn) =>
                batchRunRepository.findLastCompletedAt(jobName, conn)
            );

            const elapsed = lastCompletedAt ? Date.now() - new Date(lastCompletedAt).getTime() : Infinity;

            if (elapsed >= job.catchUpAfterMs) {
                console.log(`[Scheduler] ${jobName} 마지막 완료: ${lastCompletedAt || "없음"} → 보충 실행`);
                await safeTrigger(jobName, "CATCHUP");
            }
        } catch (error) {
            console.error(`[Scheduler] ${jobName} 보충 실행 확인 실패: ${error.message}`);
        }
    }
}

async function startScheduler() {
    try {
        const cleaned = await withConnection((conn) => batchRunRepository.failOrphanRuns(conn));
        if (cleaned > 0) {
            console.log(`[Scheduler] 중단된 배치 ${cleaned}건을 FAILED 로 정리했습니다.`);
        }
    } catch (error) {
        console.error(`[Scheduler] 중단된 배치 정리 실패 (BATCH_RUN 테이블 확인 필요): ${error.message}`);
    }

    if (!isBatchEnabled()) {
        console.log("[Scheduler] BATCH_ENABLED=false → 정기 배치 비활성화 (관리자 수동 실행만 가능)");
        return;
    }

    for (const [jobName, job] of Object.entries(BATCH_JOBS)) {
        if (!cron.validate(job.cron)) {
            console.error(`[Scheduler] ${jobName} cron 형식 오류: "${job.cron}" → 등록 생략`);
            continue;
        }

        scheduledTasks.push(
            cron.schedule(job.cron, () => safeTrigger(jobName, "SCHEDULE"), {
                name: jobName,
                timezone: "Asia/Seoul",
                noOverlap: true,
            })
        );

        console.log(`[Scheduler] ${job.label} 등록: "${job.cron}" (Asia/Seoul)`);
    }

    catchUpTimer = setTimeout(() => {
        runCatchUp().catch((error) => console.error(`[Scheduler] 보충 실행 실패: ${error.message}`));
    }, CATCHUP_DELAY_MS);
}

function stopScheduler() {
    if (catchUpTimer) clearTimeout(catchUpTimer);
    scheduledTasks.splice(0).forEach((task) => task.stop());
    stopAllBatches();
}

module.exports = {
    startScheduler,
    stopScheduler,
};
