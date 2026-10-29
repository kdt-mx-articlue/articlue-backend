const interviewService = require("../services/interview.service");
const interviewQuotaService = require("../services/interviewQuota.service");

async function startInterview(req, res) {
    try {
        const data = await interviewService.startInterview(req.body);

        return res.status(201).json({
            success: true,
            message: "면접 세션이 시작되었습니다.",
            data,
        });

    } catch (error) {
        return sendError(res, error, "면접 세션 시작 실패");
    }
}

async function submitAnswer(req, res) {
    try {
        const data = await interviewService.submitAnswer(
            req.params,
            req.body,
            req.file
        );

        return res.status(200).json({
            success: true,
            message: "답변이 저장되었습니다.",
            data,
        });

    } catch (error) {
        return sendError(res, error, "답변 제출 실패");
    }
}

async function finishInterview(req, res) {
    try {
        const data = await interviewService.finishInterview(req.params);

        return res.status(200).json({
            success: true,
            message: "면접이 종료되었습니다.",
            data,
        });

    } catch (error) {
        return sendError(res, error, "면접 종료 실패");
    }
}

function sendError(res, error, fallbackMessage) {
    console.error(error);

    return res.status(error.status || 500).json({
        success: false,
        code: error.code,
        message: error.message || fallbackMessage,
    });
}


async function getSessions(req, res) {
    try {
        const result = await interviewService.getSessionsByMemberId(req.memberId);
        return res.status(200).json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "면접 세션 목록 조회 실패" });
    }
}


async function getHistory(req, res) {
    try {
        const { interviewSessionId } = req.params;
        const result = await interviewService.getInterviewHistory(interviewSessionId);
        return res.status(200).json(result);
    } catch (error) {
        console.error(error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "면접 이력 조회 실패"
        });
    }
}

async function getReport(req, res) {
    try {
        const { interviewSessionId } = req.params;
        const result = await interviewService.getInterviewReport(interviewSessionId);
        return res.status(200).json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "면접 리포트 조회 실패" });
    }
}

/**
 * GET /api/interviews/quota — 로그인한 회원의 모의 면접 남은 횟수 / 음성 면접 가능 여부
 */
async function getQuota(req, res) {
    try {
        const data = await interviewQuotaService.getQuota({ memberId: req.memberId });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return sendError(res, error, "면접 이용 한도 조회 실패");
    }
}

module.exports = {
    getQuota,
    getHistory,
    getReport,
    getSessions,
    startInterview,
    submitAnswer,
    finishInterview,
};