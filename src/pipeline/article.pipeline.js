const crypto = require('crypto');

// 의존성 모듈 로드 (크롤러, 필터 서비스, 스토리지 유틸)
const { crawlList, crawlArticle } = require('../crawler/dbr.crawler');
const { cleanBody } = require('../services/articleFilter.service');
const storageUtil = require('../utils/articleStorage.util');

// 후속 단계 서비스 임포트 (향후 구현 완료 시 주석 해제)
// const articleSummaryService = require('../services/articleSummary.service');
// const articleKeywordService = require('../services/articleKeyword.service');
// const articleTrendService = require('../services/articleTrend.service');
// const promptContextService = require('../services/promptContext.service');

/**
 * 아카이브용 파일명을 생성합니다. 기사의 publishedAt(YYYY.MM.DD) 정보를 기반으로 합니다.
 * 포맷 예시: 'article_2026_06.json'
 * @param {string} publishedAtStr - 'YYYY.MM.DD' 형태의 문자열
 * @returns {string} 아카이브 파일명
 */
function getArchiveFileName(publishedAtStr) {
    if (!publishedAtStr || !publishedAtStr.includes('.')) {
        const now = new Date();
        return `article_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}.json`;
    }
    const [year, month] = publishedAtStr.split('.');
    return `article_${year}_${month}.json`;
}

/**
 * [Pipeline] DBR 기사 수집 및 정제, 분석 전체 프로세스를 제어합니다.
 * @param {number} limit - 파이프라인에서 최종 처리할 타깃 기사 개수 (기본값: 5)
 * @returns {Promise<array>} 최종 처리가 완료된 오늘자 기사 배열
 */
async function runPipeline(limit = 5) {
    console.log('[Pipeline] Articlue Backend 수집 파이프라인 가동...');

    try {
        // ========================================================
        // Step 1: 기사 목록 수집 (List Crawling)
        // ========================================================
        console.log('[Step 1] DBR 최신 기사 목록 수집 중...');
        const rawList = await crawlList(1, 20); 
        
        await storageUtil.saveStaging('stage1_raw.json', rawList);

        // ========================================================
        // 파이프라인 제어 계층: 개수 제한(Limit) 처리 및 비즈니스 고유 ID 부여
        // ========================================================
        const targetArticles = rawList.slice(0, limit).map(article => ({
            id: crypto.randomUUID(),
            ...article
        }));

        const stage2BodyData = []; 
        const stage3CleanData = [];

        // ========================================================
        // Step 2 & 3: 본문 수집 및 Filter 정제 루프
        // ========================================================
        console.log(`[Step 2 & 3] 본문 수집 및 필터링 시작 (대상: ${targetArticles.length}건)`);
        
        for (const article of targetArticles) {
            console.log(`[기사 처리 시작] 제목: "${article.title}"`);

            const rawBody = await crawlArticle(article.url);
            stage2BodyData.push({ ...article, rawBody });

            const filterResult = cleanBody(rawBody, article.url);

            if (!filterResult.isValid) {
                console.log(`[Pipeline Skip] 스킵 사유: ${filterResult.invalidReason} (URL: ${article.url})`);
                continue; 
            }

            stage3CleanData.push({
                id: article.id,
                title: article.title,
                preview: article.preview,
                source: article.source,
                publishedAt: article.publishedAt,
                url: article.url,
                thumbnail: article.thumbnail,
                content: filterResult.cleanBody,
                meta: {
                    rawLength: filterResult.rawLength,
                    cleanLength: filterResult.cleanLength
                }
            });
        }

        await storageUtil.saveStaging('stage2_body.json', stage2BodyData);
        await storageUtil.saveStaging('stage3_clean.json', stage3CleanData);

        if (stage3CleanData.length === 0) {
            console.warn('[Pipeline Warning] 전처리(Filter)를 통과한 기사가 0건입니다. 파이프라인을 종료합니다.');
            return [];
        }

        // ========================================================
        // Step 4 ~ 7: 가공 서비스 레이어 순차 제어 (MOCK / TODO 영역)
        // ========================================================
        console.log('[Step 4 ~ 7] 분석 서비스 파이프라인 가동 (LLM 가공 및 컨텍스트 빌드)...');
        
        // TODO: [Step 4] Summary Service 연동
        const summarizedArticles = stage3CleanData.map(a => ({ ...a, summary: "[Mock] LLM 기사 요약본 데이터" }));

        // TODO: [Step 5] Keyword Service 연동
        const mockKeywords = { "AI": 5, "DT": 3, "Digital Transformation": 2 };

        // TODO: [Step 6] Trend Service 연동
        const mockTrends = [ { trendId: 1, topic: "[Mock] 주간 AI 비즈니스 활용 트렌드" } ];

        // TODO: [Step 7] Prompt Context Service 연동
        const mockPromptContext = { contextId: "ctx_2026_06", rawText: "[Mock] 최종 생성된 프롬프트 컨텍스트 스트링" };

        // ========================================================
        // Storage 최종 저장 계층 제어 (Current & Archive)
        // ========================================================
        console.log('[Storage] 최종 가공 완료 데이터 영속화 처리...');

        await storageUtil.saveCurrent('today_articles.json', summarizedArticles);
        await storageUtil.saveCurrent('today_keywords.json', mockKeywords);
        await storageUtil.saveCurrent('today_trends.json', mockTrends);
        await storageUtil.saveCurrent('today_prompt_context.json', mockPromptContext);

        // 아카이브 중복 제거 방어 로직 적용
        const archiveFileName = getArchiveFileName(summarizedArticles[0].publishedAt);
        const existingArchive = await storageUtil.loadArchive(archiveFileName) || [];
        
        const merged = [...existingArchive, ...summarizedArticles];
        
        // 중복 방지: 변하지 않는 고유 식별자인 URL을 기준으로 Map 생성 후 추출
        const updatedArchive = Array.from(
            new Map(merged.map(article => [article.url, article])).values()
        );
        
        await storageUtil.saveArchive(archiveFileName, updatedArchive);

        console.log('[Pipeline] 전체 파이프라인 스케줄이 성공적으로 완료되었습니다.');
        return summarizedArticles;

    } catch (error) {
        console.error(`[Pipeline Critical Error] 파이프라인 가동 중 치명적 예외 발생: ${error.message}`);
        throw error;
    }
}

module.exports = {
    runPipeline
};