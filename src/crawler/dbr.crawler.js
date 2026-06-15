// [엄격한 규칙]
// fs, path 모듈 사용 금지
// articleContext.util.js 호출 금지
// storage 접근 금지

/**
 * DBR 1면 기사 크롤링
 * @returns {Promise<Array>} 기사 객체 배열 (id 제외)
 */
async function crawlDBRFrontPage() {
    try {
        // 실제 구현 시 axios, cheerio, puppeteer 등을 사용하여 파싱
        // ... 크롤링 로직 ...

        // 파싱된 결과를 반드시 아래의 배열 형태로 조립하여 반환
        // (피드백 반영: id는 여기서 만들지 않고 Service에 위임합니다)
        const articles = [
            {
                title: "[Mock] AI 시대, 조직의 변화와 리더십",
                summary: "생성형 AI 도입 시 조직 내 발생하는 비즈니스 임팩트와 리더의 역할을 분석합니다.",
                url: "https://dbr.donga.com/article/view/01",
                thumbnail: "https://dbr.donga.com/images/thumb01.jpg",
                source: "DBR", 
                publishedAt: "2026-06-15T09:00:00+09:00" // ISO 형식 및 타임존 통일
            },
            {
                title: "[Mock] 클라우드 인프라 최적화 전략",
                summary: "수시 채용 트렌드 속에서 실무형 테크 인재들이 갖춰야 할 필수 비즈니스 리터러시.",
                url: "https://dbr.donga.com/article/view/02",
                thumbnail: null, // 썸네일 이미지가 없는 경우 null 허용
                source: "DBR",
                publishedAt: "2026-06-15T10:30:00+09:00"
            }
        ];

        return articles;
    } catch (error) {
        throw new Error(`DBR 크롤링 실패: ${error.message}`);
    }
}

module.exports = {
    crawlDBRFrontPage
};