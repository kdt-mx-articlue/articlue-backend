const { aiClient } = require("../config/ai.config");

/**
 * POST /crawler/summary
 * AI 서버에서 각 기사 본문을 LLM으로 요약
 * @param {Array} articles - [{ id, title, body, ... }]
 * @returns {Array} - 원본 articles에 summary 필드 병합된 배열
 */
async function generate(articles) {
    const res = await aiClient.post("/crawler/summary", { articles });
    const summaryMap = {};
    (res.data?.articles ?? []).forEach(a => {
        summaryMap[a.id] = a.summary ?? null;
    });
    return articles.map(a => ({ ...a, summary: summaryMap[a.id] ?? null }));
}

module.exports = { generate };
