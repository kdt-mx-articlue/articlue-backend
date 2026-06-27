const { aiClient } = require("../config/ai.config");

/**
 * POST /crawler/keyword
 * AI 서버에서 기사 목록 기반 핵심 키워드 추출
 * @param {Array} articles - [{ id, title, body, summary, ... }]
 * @returns {Object} - { keyword: count } 형태의 키워드 맵
 */
async function extract(articles) {
    const res = await aiClient.post("/crawler/keyword", { articles });
    return res.data?.keywords ?? {};
}

module.exports = { extract };