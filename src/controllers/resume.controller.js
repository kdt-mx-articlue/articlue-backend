const resumeService = require('../services/resume.service');

// 이력서 생성
async function createResume(req, res) {
    try {
        const result = await resumeService.createResume(req.body);

        return res.status(200).json({
            success: true,
            message: result.message
        })        
        
    } catch (error) {
        
        console.error(error);

        // 서버 오류
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "서버 내부 오류가 발생했습니다."
        });
    }
}

/**
 * GET /api/resumes/:resumeId
 * 특정 이력서 전체 상세 조회
 */
async function getResumeDetail(req, res) {
    try {
        const result = await resumeService.getResumeDetail(
            req.params.resumeId
        );

        return res.status(200).json(result);

    } catch (error) {
        console.error(error);

        // 서버 오류
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "서버 내부 오류가 발생했습니다."
        });
    }
}

module.exports = {
    // 생성요청
    createResume,

    // 조회요청
    getResumeDetail
}

