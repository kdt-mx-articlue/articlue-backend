const cron = require('node-cron');
const articleService = require('../services/article.service');

let dailyCrawlerJob = null;

function startScheduler() {
    if (dailyCrawlerJob) {
        console.log('[Scheduler] 아티클 크롤링 스케줄러가 이미 실행 중입니다.');
        return;
    }

    console.log('[Scheduler] 매일 00:00 KST 아티클 크롤링 스케줄러 등록 완료');
    console.log('[Scheduler] Next run timezone: Asia/Seoul'); // 운영 시 타임존 확인용 로그 추가

    dailyCrawlerJob = cron.schedule('0 0 * * *', async () => {
        console.log('\n[Scheduler] Start crawling - 오늘의 IT Context 갱신 시작');
        try {
            await articleService.refreshTodayContext();
            console.log('[Scheduler] Finished - 오늘의 IT Context 갱신 완료');
        } catch (error) {
            console.error(`[Scheduler] Failed - 크롤링 스케줄러 실행 중 오류: ${error.message}`);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Seoul" 
    });
}

function stopScheduler() {
    if (dailyCrawlerJob) {
        dailyCrawlerJob.stop();
        dailyCrawlerJob = null;
        console.log('[Scheduler] 아티클 크롤링 스케줄러 정지 완료');
    }
}

module.exports = {
    startScheduler,
    stopScheduler
};