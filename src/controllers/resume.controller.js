const resumeService = require('../services/resume.service');

// 이력서 생성
async function createResume(req, res) {
    try {
        console.log("[RESUME CTRL] 요청 시작");
        console.log("[RESUME CTRL] body.memberId:", req.body.memberId || req.body.member_id);
        console.log("[RESUME CTRL] body.resumeTitle:", req.body.resumeTitle || req.body.resume_title);
        console.time("[RESUME CTRL] total");

        const result = await resumeService.createResumeAndAnalyze(req.body);

        console.timeEnd("[RESUME CTRL] total");
        console.log("[RESUME CTRL] 최종 응답 message:", result.message);
        console.log("[RESUME CTRL] 최종 응답 resumeId:", result.data?.resumeId);
        console.log("[RESUME CTRL] analysisStatus:", result.data?.analysisStatus);
        console.log(
            "[RESUME CTRL] savedCount:",
            JSON.stringify(result.data?.analysis?.savedResult?.savedCount, null, 2)
        );

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

