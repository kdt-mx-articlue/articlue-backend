const coverLetterService = require("../services/coverLetter.service");

async function generate(req, res) {
    try {
        const { memberId, resumeId, jobPostingId, companyName, jobTitle, jobDescription } = req.body;
        if (!resumeId || !jobPostingId || !companyName || !jobTitle) {
            return res.status(400).json({ success: false, message: "필수 파라미터 누락" });
        }
        const result = await coverLetterService.generateAndSave({
            memberId, resumeId, jobPostingId, companyName, jobTitle, jobDescription,
        });
        return res.status(201).json({ success: true, data: result });
    } catch (e) {
        console.error(e);
        return res.status(e.status || 500).json({ success: false, message: e.message || "자소서 생성 실패" });
    }
}

async function getList(req, res) {
    try {
        const { memberId } = req.query;
        if (!memberId) return res.status(400).json({ success: false, message: "memberId 필요" });
        const list = await coverLetterService.getCoverLetters(memberId);
        return res.status(200).json({ success: true, data: list });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "자소서 목록 조회 실패" });
    }
}

async function getDetail(req, res) {
    try {
        const { coverLetterId } = req.params;
        const detail = await coverLetterService.getCoverLetterDetail(coverLetterId);
        return res.status(200).json({ success: true, data: detail });
    } catch (e) {
        console.error(e);
        return res.status(e.status || 500).json({ success: false, message: e.message || "자소서 조회 실패" });
    }
}

async function update(req, res) {
    try {
        const { coverLetterId } = req.params;
        const { items } = req.body;
        if (!Array.isArray(items)) return res.status(400).json({ success: false, message: "items 필요" });
        await coverLetterService.updateCoverLetter(coverLetterId, items);
        return res.status(200).json({ success: true, message: "수정 완료" });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "수정 실패" });
    }
}

module.exports = { generate, getList, getDetail, update };
