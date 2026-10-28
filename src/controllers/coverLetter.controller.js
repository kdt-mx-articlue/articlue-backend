const { getConnection } = require("../config/db");
const aiConfig = require("../config/ai.config");
const aiClient = aiConfig.aiClient || aiConfig;
const coverLetterService = require("../services/coverLetter.service");
const coverLetterRepo = require("../repositories/coverLetter.repository");

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

async function list(req, res) {
    const { memberId } = req.query;
    if (!memberId) return res.status(400).json({ success: false, message: "memberId 필요" });
    const conn = await getConnection();
    try {
        const items = await coverLetterRepo.findCoverLettersByMember(memberId, conn);
        return res.json({ success: true, data: items });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: e.message });
    } finally {
        await conn.close();
    }
}

async function getDetail(req, res) {
    const { coverLetterId } = req.params;
    const conn = await getConnection();
    try {
        const row = await coverLetterRepo.findCoverLetterById(coverLetterId, conn);
        if (!row) return res.status(404).json({ success: false, message: "자소서 없음" });
        const rawContent = row.content;
        const content = typeof rawContent?.getData === "function"
            ? await rawContent.getData()
            : rawContent;
        const items = JSON.parse(content ?? "[]");
        const { content: _, ...rest } = row;
        return res.json({ success: true, data: { ...rest, items } });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: e.message });
    } finally {
        await conn.close();
    }
}

async function update(req, res) {
    const { coverLetterId } = req.params;
    const { items } = req.body;
    const conn = await getConnection();
    try {
        await coverLetterRepo.updateCoverLetterContent(coverLetterId, items, conn);
        await conn.commit();
        return res.json({ success: true });
    } catch (e) {
        await conn.rollback();
        console.error(e);
        return res.status(500).json({ success: false, message: e.message });
    } finally {
        await conn.close();
    }
}

async function extractQuestions(req, res) {
    try {
        const { jobDescription } = req.body;
        const aiResponse = await aiClient.post("/cover-letter/extract-questions", { jobDescription });
        return res.json({ success: true, data: aiResponse.data });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: e.message });
    }
}

module.exports = { generate, list, getDetail, update, extractQuestions };
