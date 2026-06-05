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
        return res.status(error.statusCode).json({
            success: false,
            message: error.statusCode ? error.message : "서버 내부 오류가 발생했습니다."
        });
    }

}

module.exports = {
    createResume,
}

