const { crawlDBRFrontPage } = require('../crawler/dbr.crawler');
const contextUtil = require('../utils/articleContext.util');

const IT_KEYWORDS = [
    'ai', '인공지능', 'gpt', 'openai',
    'cloud', 'aws', 'azure', 'gcp',
    '데이터', '빅데이터',
    '머신러닝', '딥러닝',
    '플랫폼', 'api',
    'devops', 'docker', 'kubernetes',
    '스타트업', '디지털 전환', 'dx'
];

/**
 * Timezone 안전 KST 오늘 날짜 문자열(YYYY-MM-DD) 반환
 */
function getTodayString() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

/**
 * 날짜 문자열(YYYY.MM.DD)을 ISO 8601 형식(KST 자정 기준)으로 안전하게 변환
 * (문자열 조립 방식 - Timezone offset 변조 오류 원천 차단)
 */
function formatToISO(rawDate) {
    if (!rawDate) return null;

    const normalized = rawDate.replace(/\./g, '-');
    const [y, m, d] = normalized.split('-');

    // 월, 일이 1자리일 경우를 대비해 padStart 적용
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00+09:00`;
}

/**
 * title + summary 기반 IT 기사 판별
 */
function isItArticle(title, summary) {
    const targetText = `${title} ${summary}`.toLowerCase();
    return IT_KEYWORDS.some(keyword => targetText.includes(keyword.toLowerCase()));
}

/**
 * 오늘의 IT Context 데이터 갱신 파이프라인 (매일 00:00 호출)
 */
async function refreshTodayContext() {
    const today = getTodayString();
    
    try {
        // 1. 최대 20개의 기사만 1차 수집
        const rawArticles = await crawlDBRFrontPage();
        
        // 2. IT 필터 적용
        const filteredArticles = rawArticles.filter(article => 
            isItArticle(article.title, article.summary)
        );

        let finalContextData;

        if (filteredArticles.length === 0) {
            finalContextData = {
                crawlDate: today,
                status: "FAILED",
                message: "No IT articles found",
                totalCount: 0,
                articles: []
            };
        } else {
            // 3. 최대 5개 선택, 데이터 정합성(포맷팅) 확보 및 id 생성
            const topArticles = filteredArticles.slice(0, 5).map((article, index) => ({
                id: index + 1,
                title: article.title,
                summary: article.summary,
                url: article.url,
                thumbnail: article.thumbnail,
                source: article.source,
                publishedAt: formatToISO(article.publishedAt)
            }));

            finalContextData = {
                crawlDate: today,
                status: "SUCCESS",
                totalCount: topArticles.length,
                articles: topArticles
            };
        }

        // 4. Atomic Write 실행
        await contextUtil.writeContext(finalContextData);
        console.log(`[Context Updated] status: ${finalContextData.status}, count: ${finalContextData.totalCount}`);

    } catch (error) {
        console.error(`[Context Refresh Failed] 기존 파일을 유지합니다: ${error.message}`);
    }
}

/**
 * 서버 구동 시 초기화 및 검증 로직 (Docker 환경 대응)
 */
async function initializeContext() {
    const exists = await contextUtil.existsContext();
    const today = getTodayString();

    if (!exists) {
        console.log("[Service] today_articles.json 파일이 없습니다. 새 파일 생성을 시도합니다.");
        await refreshTodayContext();
        return;
    }

    const crawlDate = await contextUtil.getContextDate();
    if (crawlDate !== today) {
        console.log(`[Service] 기존 파일 날짜(${crawlDate})가 오늘(${today})과 다릅니다. 갱신을 시도합니다.`);
        await refreshTodayContext();
    } else {
        console.log("[Service] 최신 상태의 today_articles.json을 사용합니다.");
    }
}

module.exports = {
    initializeContext,
    refreshTodayContext
};