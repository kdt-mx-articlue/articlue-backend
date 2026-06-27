const axios = require('axios');

const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:5000';

async function generate(articles, keywords) {
    if (!articles || articles.length === 0 || !keywords || Object.keys(keywords).length === 0) {
        return { 
            trends: [], 
            meta: {
                articleCount: articles ? articles.length : 0,
                keywordCount: keywords ? Object.keys(keywords).length : 0,
                model: null,
                promptVersion: null,
                createdAt: null,
                error: "Empty input data"
            } 
        };
    }

    console.log('[Trend Service] FastAPI 서버로 트렌드 분석을 요청합니다...');

    try {
        const payload = {
            articles: articles.map(article => ({
                id: article.id,
                title: article.title,
                summary: article.summary
            })),
            keywords: keywords
        };

        const response = await axios.post(`${FASTAPI_BASE_URL}/crawler/trend`, payload, {
            timeout: 0
        });

        if (!response.data || !Array.isArray(response.data.trends)) {
            throw new Error("Invalid FastAPI response format");
        }

        console.log(`[Trend Service] 트렌드 분석 완료: ${response.data.trends.length}건 도출됨`);
        return response.data; 

    } catch (error) {
        console.error(`🚨 [Trend Service Error] FastAPI 호출 실패: ${error.message}`);
        
        // 스키마 통일
        return { 
            trends: [], 
            meta: {
                articleCount: articles.length,
                keywordCount: Object.keys(keywords).length,
                model: null,
                promptVersion: null,
                createdAt: null,
                error: error.message
            }
        };
    }
}

module.exports = {
    generate
};
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
