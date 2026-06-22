const articleService = require('../services/article.service');

/**
 * GET /articles/today
 * 오늘의 IT 기사 Context 응답
 */
async function getTodayContext(req, res) {
    try {
        const contextData = await articleService.getTodayContext();

        if (!contextData) {
            return res.status(404).json({
                success: false,
                message: "오늘의 기사 데이터를 찾을 수 없습니다."
            });
        }

        return res.status(200).json({
            success: true,
            message: "오늘의 기사 조회 성공",
            data: contextData
        });

    } catch (error) {
        console.error(error);

        // 기존 프로젝트 예외 처리 규칙 적용
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode 
                ? error.message 
                : "서버 내부 오류가 발생했습니다."
        });
    }
}

module.exports = {
    getTodayContext
};