const { getConnection } = require("../config/db");
const aiConfig = require("../config/ai.config");
const aiClient = aiConfig.aiClient || aiConfig;
const coverLetterRepo = require("../repositories/coverLetter.repository");
const resumeService = require("./resume.service");

/**
 * 자소서 생성 + 저장
 */
async function generateAndSave({ memberId, resumeId, jobPostingId, companyName, jobTitle, jobDescription }) {
    // 1. 이력서 상세 데이터 조회 (resume.service 재사용)
    const resumeDetailResult = await resumeService.getResumeDetail(resumeId);
    const resumeDetail = resumeDetailResult?.data ?? {};

    // 2. AI 자소서 생성 요청
    const aiResponse = await aiClient.post("/cover-letter/generate", {
        resumeData:     resumeDetail ?? {},
        companyName,
        jobTitle,
        jobDescription: jobDescription ?? "",
    });

    const items = aiResponse.data?.items;
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("AI 자소서 생성 실패");
    }

    // 3. DB 저장
    conn = await getConnection();
    try {
        const coverLetterId = await coverLetterRepo.createCoverLetter(
            { resumeId, jobPostingId, companyName, jobTitle, items },
            conn
        );
        await conn.commit();
        return { coverLetterId, items };
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        await conn.close();
    }
}

/**
 * 자소서 목록 조회
 */
async function getCoverLetters(memberId) {
    const conn = await getConnection();
    try {
        return await coverLetterRepo.findCoverLettersByMember(memberId, conn);
    } finally {
        await conn.close();
    }
}

/**
 * 자소서 상세 조회
 */
async function getCoverLetterDetail(coverLetterId) {
    const conn = await getConnection();
    try {
        const row = await coverLetterRepo.findCoverLetterById(coverLetterId, conn);
        if (!row) throw Object.assign(new Error("자소서를 찾을 수 없습니다."), { status: 404 });

        // CLOB → JSON parse
        const rawContent = typeof row.content === "object" && row.content?.getData
            ? await row.content.getData()
            : row.content;

        const items = JSON.parse(rawContent || "[]");

        return {
            coverLetterId: row.coverLetterId,
            title:         row.title,
            companyName:   row.companyName,
            jobTitle:      row.jobTitle,
            createdAt:     row.createdAt,
            items: items.map((item, idx) => ({
                coverLetterItemId: idx + 1,
                question: item.question,
                answer:   item.answer,
            })),
        };
    } finally {
        await conn.close();
    }
}

/**
 * 자소서 수정
 */
async function updateCoverLetter(coverLetterId, items) {
    const conn = await getConnection();
    try {
        await coverLetterRepo.updateCoverLetterContent(coverLetterId, items, conn);
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        await conn.close();
    }
}

module.exports = { generateAndSave, getCoverLetters, getCoverLetterDetail, updateCoverLetter };
