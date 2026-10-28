/**
 * 배치 작업 목록
 *
 * - cron           : 정기 실행 주기 (Asia/Seoul). 환경변수로 덮어쓸 수 있음
 * - catchUpAfterMs : 마지막 정상 완료 후 이 시간이 지났으면 서버 기동 시 1회 실행
 *                    (서버가 꺼져 있어 정기 실행을 놓쳤거나, 실패 후 수정·재배포한 경우)
 * - timeoutMs      : 이 시간을 넘기면 배치 프로세스를 강제 종료
 */
const HOUR = 60 * 60 * 1000;

const BATCH_JOBS = {
    JOB_POSTING_CRAWL: {
        label: "채용공고 수집 (사람인·원티드·잡코리아)",
        module: "./jobs/jobPostingCrawl.job",
        cron: process.env.JOB_CRAWL_CRON || "0 4 * * 1", // 매주 월요일 04:00
        catchUpAfterMs: 7 * 24 * HOUR,
        timeoutMs: 2 * HOUR,
    },
    ARTICLE_CONTEXT: {
        label: "DBR 아티클 수집",
        module: "./jobs/articleContext.job",
        cron: process.env.ARTICLE_CRAWL_CRON || "0 0 * * *", // 매일 00:00
        catchUpAfterMs: 24 * HOUR,
        timeoutMs: 30 * 60 * 1000,
    },
};

module.exports = { BATCH_JOBS };
