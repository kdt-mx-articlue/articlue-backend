const interviewService = require("../services/interview.service");

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
        message: error.message || fallbackMessage,
    });
}

module.exports = {
    startInterview,
    submitAnswer,
    finishInterview,
};