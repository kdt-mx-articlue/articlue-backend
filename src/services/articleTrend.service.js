const { aiClient } = require("../config/ai.config");

/**
 * POST /crawler/trend
 * AI 서버에서 기사 + 키워드 기반 주간 트렌드 생성
 * @param {Array} articles - [{ id, title, summary, ... }]
 * @param {Object} keywords - { keyword: count }
 * @returns {Array} - [{ trendId, topic, description }]
 */
async function generate(articles, keywords) {
    const res = await aiClient.post("/crawler/trend", { articles, keywords });
    return res.data?.trends ?? [];
}

module.exports = { generate };
