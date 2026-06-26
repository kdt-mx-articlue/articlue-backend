const crypto = require('crypto');

// 의존성 모듈 로드
const { crawlList, crawlArticle } = require('../crawler/dbr.crawler');
const { cleanBody } = require('../services/articleFilter.service');
const storageUtil = require('../utils/articleStorage.util');

const articleSummaryService = require('../services/articleSummary.service');
const articleKeywordService = require('../services/articleKeyword.service');
const articleTrendService = require('../services/articleTrend.service');
const promptContextService = require('../services/promptContext.service');

function getArchiveFileName(publishedAtStr) {
    if (!publishedAtStr || !publishedAtStr.includes('.')) {
        const now = new Date();
        return `article_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}.json`;
    }
    const [year, month] = publishedAtStr.split('.');
    return `article_${year}_${month}.json`;
}

/**
 * 고유하고 변하지 않는 ID 생성을 위해 URL을 SHA-256으로 해싱합니다.
 */
function generateId(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
}

// ========================================================
// [Step 1] 기사 목록 수집 및 해시 기반 고유 ID 부여
// ========================================================
async function runStep1() {
    console.log('[Step 1] DBR 최신 기사 목록 수집 중...');
    const rawList = await crawlList(1, 20); 
    
    // 재실행해도 ID가 절대 변하지 않도록 URL 기반 해싱 적용
    const listWithIds = rawList.map(article => ({
        id: generateId(article.url),
        ...article
    }));

    await storageUtil.saveStaging('stage1_list.json', listWithIds);
    return listWithIds;
}

// ========================================================
// [Step 2] 본문 수집 (Playwright 연동)
// ========================================================
async function runStep2(limit = 5) {
    console.log(`[Step 2] 본문 수집 시작 (최대 ${limit}건)...`);
    const listWithIds = await storageUtil.loadStaging('stage1_list.json');
    if (!listWithIds || listWithIds.length === 0) throw new Error("Stage 1 데이터가 없습니다.");

    const targetArticles = listWithIds.slice(0, limit);
    const stage2Data = [];

    for (const article of targetArticles) {
        console.log(` - 본문 수집: "${article.title}"`);
        const rawBody = await crawlArticle(article.url);
        stage2Data.push({ ...article, body: rawBody });
    }

    await storageUtil.saveStaging('stage2_raw_body.json', stage2Data);
    return stage2Data;
}

// ========================================================
// [Step 3] 본문 전처리 (Filter)
// ========================================================
async function runStep3() {
    console.log('[Step 3] 본문 전처리 및 정제 시작...');
    const stage2Data = await storageUtil.loadStaging('stage2_raw_body.json');
    if (!stage2Data || stage2Data.length === 0) throw new Error("Stage 2 데이터가 없습니다.");

    const stage3Data = [];
    for (const article of stage2Data) {
        const filterResult = cleanBody(article.body, article.url);

        if (!filterResult.isValid) {
            console.log(`[Skip] 사유: ${filterResult.invalidReason} (URL: ${article.url})`);
            continue; 
        }

        stage3Data.push({
            id: article.id,
            title: article.title,
            preview: article.preview,
            source: article.source,
            publishedAt: article.publishedAt,
            url: article.url,
            thumbnail: article.thumbnail,
            body: filterResult.cleanBody, 
            meta: { 
                rawLength: filterResult.rawLength,
                cleanLength: filterResult.cleanLength,
                removedBlocks: filterResult.removedBlocks || [],
                invalidReason: filterResult.invalidReason
            }
        });
    }

    await storageUtil.saveStaging('stage3_clean_body.json', stage3Data);
    return stage3Data;
}

// ========================================================
// [Step 4] LLM 요약 (Summary)
// ========================================================
async function runStep4() {
    console.log('[Step 4] 기사 본문 LLM 요약 시작...');
    const stage3Data = await storageUtil.loadStaging('stage3_clean_body.json');
    if (!stage3Data || stage3Data.length === 0) {
        console.warn('[Warning] 전처리를 통과한 기사가 0건입니다.');
        return [];
    }

    const stage4Data = await articleSummaryService.generate(stage3Data);
    
    await storageUtil.saveStaging('stage4_summary.json', stage4Data);
    return stage4Data;
}

// ========================================================
// [Step 5] 키워드 추출 (Keyword)
// ========================================================
async function runStep5() {
    console.log('[Step 5] 핵심 키워드 추출 시작...');
    const articles = await storageUtil.loadStaging('stage4_summary.json');
    if (!articles || articles.length === 0) throw new Error("Stage 4 데이터가 없습니다.");

    const stage5Data = await articleKeywordService.extract(articles);
    
    // 오직 자신의 결과물만 저장
    await storageUtil.saveStaging('stage5_keywords.json', stage5Data);
    return stage5Data;
}

// ========================================================
// [Step 6] 트렌드 생성 (Trend)
// ========================================================
async function runStep6() {
    console.log('[Step 6] 주간 트렌드 분석 시작...');
    const articles = await storageUtil.loadStaging('stage4_summary.json');
    const keywords = await storageUtil.loadStaging('stage5_keywords.json');
    if (!articles || !keywords) throw new Error("이전 단계 데이터가 없습니다.");

    const stage6Data = await articleTrendService.generate(articles, keywords);
    
    await storageUtil.saveStaging('stage6_trends.json', stage6Data);
    return stage6Data;
}

// ========================================================
// [Step 7] 프롬프트 컨텍스트 생성 (Prompt)
// ========================================================
async function runStep7() {
    console.log('[Step 7] LLM 프롬프트 컨텍스트 생성 시작...');
    const articles = await storageUtil.loadStaging('stage4_summary.json');
    const trends = await storageUtil.loadStaging('stage6_trends.json');
    if (!articles || !trends) throw new Error("이전 단계 데이터가 없습니다.");

    const stage7Data = await promptContextService.create(articles, trends);
    
    await storageUtil.saveStaging('stage7_prompt.json', stage7Data);
    return stage7Data;
}

// ========================================================
// [Step 8] 최종 영속화 (Current & Archive Storage Sync)
// ========================================================
async function runStep8() {
    console.log('[Step 8] 최종 데이터 Storage 영속화 조립 시작...');
    
    // 각 Stage 결과물을 개별적으로 로드 (의존성 분리)
    const articles = await storageUtil.loadStaging('stage4_summary.json');
    const keywords = await storageUtil.loadStaging('stage5_keywords.json');
    const trends = await storageUtil.loadStaging('stage6_trends.json');
    const promptContext = await storageUtil.loadStaging('stage7_prompt.json');

    if (!articles || articles.length === 0) {
        throw new Error("[Error] 영속화를 위한 필수 데이터(stage4)가 없습니다.");
    }

    // Current 저장 (존재하는 데이터만 유연하게 저장)
    await storageUtil.saveCurrent('today_articles.json', articles);
    if (keywords) await storageUtil.saveCurrent('today_keywords.json', keywords);
    if (trends) await storageUtil.saveCurrent('today_trends.json', trends);
    if (promptContext) await storageUtil.saveCurrent('today_prompt_context.json', promptContext);

    // Archive 저장 (고유 ID 기반 중복 제거)
    const archiveFileName = getArchiveFileName(articles[0]?.publishedAt);
    const existingArchive = await storageUtil.loadArchive(archiveFileName) || [];
    
    const merged = [...existingArchive, ...articles];
    const updatedArchive = Array.from(new Map(merged.map(a => [a.id, a])).values());
    
    await storageUtil.saveArchive(archiveFileName, updatedArchive);
    console.log('[Storage] Storage 영속화가 성공적으로 완료되었습니다.');
}

// ========================================================
// [Main] 전체 파이프라인 (스케줄러용)
// ========================================================
async function runPipeline(limit = 5) {
    console.log('\n[Pipeline] Articlue Backend 전체 파이프라인 가동...');
    try {
        await runStep1();
        await runStep2(limit);
        await runStep3();
        await runStep4();
        await runStep5();
        await runStep6();
        await runStep7();
        await runStep8();
        console.log('\n[Pipeline] 스케줄이 성공적으로 완료되었습니다.');
    } catch (error) {
        console.error(`\n[Pipeline Error] 파이프라인 예외 발생: ${error.message}`);
        throw error;
    }
}

// ========================================================
// [Recovery] 특정 단계부터 재시작하는 복구용 (CLI 지원용)
// ========================================================
async function resumePipeline(startStep = 4, limit = 5) {
    console.log(`\n[Pipeline Resume] Step ${startStep}부터 파이프라인을 재가동합니다 (limit: ${limit})...`);
    try {
        if (startStep <= 1) await runStep1();
        if (startStep <= 2) await runStep2(limit); 
        if (startStep <= 3) await runStep3();
        if (startStep <= 4) await runStep4();
        if (startStep <= 5) await runStep5();
        if (startStep <= 6) await runStep6();
        if (startStep <= 7) await runStep7();
        if (startStep <= 8) await runStep8();
        console.log('\n[Pipeline Resume] 복구 파이프라인이 성공적으로 완료되었습니다.');
    } catch (error) {
        console.error(`\n[Pipeline Error] 복구 가동 중 예외 발생: ${error.message}`);
        throw error;
    }
}

module.exports = {
    runPipeline,
    resumePipeline,
    runStep1, runStep2, runStep3, runStep4, runStep5, runStep6, runStep7, runStep8
};