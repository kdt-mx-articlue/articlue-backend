const axios = require('axios');
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:5000';

async function generate(articles) {
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
        return [];
    }

    console.log(`[Summary Service] FastAPI 서버로 ${articles.length}건의 기사 요약을 요청합니다...`);

    try {
        const payload = {
            articles: articles.map(article => ({ 
                id: article.id, 
                title: article.title, 
                body: article.body 
            }))
        };

        const response = await axios.post(`${FASTAPI_BASE_URL}/crawler/summary`, payload, { 
            timeout: 120000 
        });

        if (!response.data || !Array.isArray(response.data.articles)) {
            throw new Error("Invalid FastAPI response format");
        }

        const summaryMap = new Map(response.data.articles.map(item => [item.id, item.summary]));

        return articles.map(article => {
            const summary = summaryMap.get(article.id);
            // 1. nullish coalescing(??)을 사용하여 FastAPI 응답이 null인 경우에도 완벽한 스키마 보장
            return {
                ...article,
                summary: summary ?? {
                    text: [],
                    model: null,
                    promptVersion: null,
                    createdAt: null,
                    error: "Summary not returned from FastAPI"
                }
            };
        });

    } catch (error) {
        console.error(`🚨 [Summary Service Error] FastAPI 호출 실패: ${error.message}`);
        
        // 전체 네트워크/서버 에러 발생 시에도 개별 기사의 스키마 유지
        return articles.map(article => ({
            ...article,
            summary: {
                text: [],
                model: null,
                promptVersion: null,
                createdAt: null,
                error: error.message
            }
        }));
    }
}

module.exports = { 
    generate 
};
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
