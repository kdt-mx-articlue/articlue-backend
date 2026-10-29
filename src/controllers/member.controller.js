const memberService = require("../services/member.service");

function sendError(res, error, fallback) {
    console.error(error);
    return res.status(error.status || 500).json({
        success: false,
        message: error.message || fallback,
    });
}

// memberId 는 모두 로그인 세션(req.memberId) 기준 — member.route 의 requireAuth
async function getProfile(req, res) {
    try {
        const memberId = req.memberId;
        const result = await memberService.getProfile(memberId);
        return res.status(200).json(result);
    } catch (error) {
        return sendError(res, error, "프로필 조회 실패");
    }
}

async function updateProfile(req, res) {
    try {
        const memberId = req.memberId;
        const result = await memberService.updateProfile(memberId, req.body);
        return res.status(200).json(result);
    } catch (error) {
        return sendError(res, error, "프로필 수정 실패");
    }
}

async function getMe(req, res) {
    try {
        const memberId = req.memberId;
        const result = await memberService.getMe(memberId);
        return res.status(200).json(result);
    } catch (error) {
        return sendError(res, error, "회원 정보 조회 실패");
    }
}

module.exports = { getProfile, updateProfile, getMe };
