const axios = require('axios');
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:5000';

async function generate(articles, trends) {
    if (!articles || articles.length === 0 || !trends || trends.length === 0) {
        return { 
            promptContext: {
                rawText: ""
            }, 
            meta: {
                articleCount: articles ? articles.length : 0,
                trendCount: trends ? trends.length : 0,
                length: 0,
                model: null,
                promptVersion: null,
                createdAt: null,
                error: "Empty input data"
            } 
        };
    }

    console.log('[Prompt Context Service] FastAPI 서버로 배경지식(Context) 생성을 요청합니다...');

    try {
        const payload = {
            articles: articles.map(a => ({ id: a.id, title: a.title, summary: a.summary })),
            trends: trends
        };

        const response = await axios.post(`${FASTAPI_BASE_URL}/crawler/prompt-context`, payload, {
            timeout: 60000 
        });

        if (
           !response.data ||
            typeof response.data.promptContext?.rawText !== "string"
        ) {
            throw new Error("Invalid FastAPI response format");
        }

        console.log(`[Prompt Context Service] 배경지식 생성 완료`);
        return response.data; 

    } catch (error) {
        console.error(`🚨 [Prompt Context Error] FastAPI 호출 실패: ${error.message}`);
        
        // 스키마 통일 및 Fail-Safe 구조 보장
        return { 
            promptContext: {
                rawText: ""
            }, 
            meta: {
                articleCount: articles.length,
                trendCount: trends.length,
                length: 0,
                model: null,
                promptVersion: null,
                createdAt: null,
                error: error.message
            }
        };
    }
}

module.exports = { generate };
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
