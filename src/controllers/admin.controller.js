const batchRunRepository = require("../repositories/batchRun.repository");
const { BATCH_JOBS } = require("../batch/batchJobs");
const { triggerBatch, getRunningJobs, withConnection } = require("../batch/batchRunner");

/**
 * GET /api/admin/batches
 * 배치 목록(주기) + 실행 중 배치 + 최근 실행 이력
 */
async function getBatchStatus(req, res) {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const recentRuns = await withConnection((conn) =>
            batchRunRepository.findRecentRuns(limit, conn)
        );

        return res.json({
            success: true,
            data: {
                jobs: Object.entries(BATCH_JOBS).map(([jobName, job]) => ({
                    jobName,
                    label: job.label,
                    cron: job.cron,
                })),
                running: getRunningJobs(),
                recentRuns,
            },
        });
    } catch (error) {
        console.error("[Admin] 배치 상태 조회 실패:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * POST /api/admin/batches/:jobName/run
 * 관리자 수동 실행 — 실행 완료를 기다리지 않고 바로 응답
 */
async function runBatch(req, res) {
    try {
        const result = await triggerBatch(req.params.jobName, "MANUAL");

        return res.status(result.started ? 202 : 409).json({
            success: result.started,
            message: result.started ? "배치 실행을 시작했습니다." : result.message,
            data: { runId: result.runId },
        });
    } catch (error) {
        console.error("[Admin] 배치 수동 실행 실패:", error);
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
}

module.exports = {
    getBatchStatus,
    runBatch,
};
