const { runPipeline } = require("../../pipeline/article.pipeline");
const storageUtil = require("../../utils/articleStorage.util");
const articleService = require("../../services/article.service");

const ARTICLE_LIMIT = Number(process.env.ARTICLE_CRAWL_LIMIT || 5);

/**
 * DBR 최신 기사 수집 → 요약/키워드/트렌드 → 화면용 today_articles.json 갱신
 */
async function run() {
    await runPipeline(ARTICLE_LIMIT);
    await articleService.refreshTodayContext();

    const articles = (await storageUtil.loadCurrent("today_articles.json")) || [];

    return {
        summary: { articleCount: articles.length },
        failedSources: [],
    };
}

module.exports = { run };
