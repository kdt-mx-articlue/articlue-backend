const axios = require('axios');

const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:5000';

async function generate(articles) {
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
        return { 
            keywords: {}, 
            meta: {
                articleCount: 0,
                model: null,
                promptVersion: null,
                createdAt: null,
                error: "Empty input data"
            } 
        };
    }

    console.log('[Keyword Service] FastAPI 서버로 핵심 키워드 추출을 요청합니다...');

    try {
        const payload = {
            articles: articles.map(article => ({
                id: article.id,
                title: article.title,
                summary: article.summary
            }))
        };

        const response = await axios.post(`${FASTAPI_BASE_URL}/crawler/keyword`, payload, {
            timeout: 60000 
        });

        if (!response.data || typeof response.data.keywords !== 'object') {
            throw new Error("Invalid FastAPI response format");
        }

        console.log(`[Keyword Service] 키워드 추출 완료`);
        return response.data; 

    } catch (error) {
        console.error(`🚨 [Keyword Service Error] FastAPI 호출 실패: ${error.message}`);
        
        // 스키마 통일
        return { 
            keywords: {}, 
            meta: { 
                articleCount: articles.length,
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