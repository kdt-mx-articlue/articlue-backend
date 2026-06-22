const jobPostingService = require("../services/jobPosting.service");

async function getJobPostings(req, res) {
    try {
        const data = await jobPostingService.getJobPostings(req.query);

        return res.status(200).json({
            success: true,
            message: "채용공고 목록 조회 성공",
            data,
        });

    } catch (error) {
        return sendError(res, error, "채용공고 목록 조회 실패");
    }
}

async function getJobPostingDetail(req, res) {
    try {
        const data = await jobPostingService.getJobPostingDetail(
            req.params.jobPostingId
        );

        return res.status(200).json({
            success: true,
            message: "채용공고 상세 조회 성공",
            data,
        });

    } catch (error) {
        return sendError(res, error, "채용공고 상세 조회 실패");
    }
}

async function getJobPostingContext(req, res) {
    try {
        const data = await jobPostingService.getJobPostingContext(
            req.params.jobPostingId
        );

        return res.status(200).json({
            success: true,
            message: "채용공고 컨텍스트 조회 성공",
            data,
        });

    } catch (error) {
        return sendError(res, error, "채용공고 컨텍스트 조회 실패");
    }
}

function sendError(res, error, fallbackMessage) {
    console.error(error);

    return res.status(error.status || 500).json({
        success: false,
        message: error.message || fallbackMessage,
    });
}

module.exports = {
    getJobPostings,
    getJobPostingDetail,
    getJobPostingContext,
};