const memberService = require("../services/member.service");

function sendError(res, error, fallback) {
    console.error(error);
    return res.status(error.status || 500).json({
        success: false,
        message: error.message || fallback,
    });
}

async function getProfile(req, res) {
    try {
        const memberId = req.query.memberId;
        if (!memberId) {
            return res.status(400).json({ success: false, message: "memberId가 필요합니다." });
        }
        const result = await memberService.getProfile(memberId);
        return res.status(200).json(result);
    } catch (error) {
        return sendError(res, error, "프로필 조회 실패");
    }
}

async function updateProfile(req, res) {
    try {
        const memberId = req.query.memberId || req.body.memberId;
        if (!memberId) {
            return res.status(400).json({ success: false, message: "memberId가 필요합니다." });
        }
        const result = await memberService.updateProfile(memberId, req.body);
        return res.status(200).json(result);
    } catch (error) {
        return sendError(res, error, "프로필 수정 실패");
    }
}

async function getMe(req, res) {
    try {
        const memberId = req.query.memberId;
        if (!memberId) {
            return res.status(400).json({ success: false, message: "memberId가 필요합니다." });
        }
        const result = await memberService.getMe(memberId);
        return res.status(200).json(result);
    } catch (error) {
        return sendError(res, error, "회원 정보 조회 실패");
    }
}

module.exports = { getProfile, updateProfile, getMe };
