const coverLetterService = require("../services/coverLetter.service");

async function generate(req, res) {
    try {
        const { memberId, resumeId, jobPostingId, companyName, jobTitle, jobDescription, questions } = req.body;
        if (!resumeId || !jobPostingId || !companyName || !jobTitle) {
            return res.status(400).json({ success: false, message: "필수 파라미터 누락" });
        }
        const result = await coverLetterService.generateAndSave({
            memberId, resumeId, jobPostingId, companyName, jobTitle, jobDescription, questions,
        });
        return res.status(201).json({ success: true, data: result });
    } catch (e) {
        console.error(e);
        return res.status(e.status || 500).json({ success: false, message: e.message || "자소서 생성 실패" });
    }
}

module.exports = { generate };
