const { aiClient } = require("../config/ai.config");

/**
 * POST /crawler/prompt-context
 * AI 서버에서 기사 + 트렌드 기반 LLM 프롬프트 컨텍스트 생성
 * @param {Array} articles - [{ id, title, summary, ... }]
 * @param {Array} trends - [{ trendId, topic, description }]
 * @returns {Object} - { rawText: string }
 */
async function create(articles, trends) {
    const res = await aiClient.post("/crawler/prompt-context", { articles, trends });
    return res.data?.promptContext ?? { rawText: "" };
}

module.exports = { create };
