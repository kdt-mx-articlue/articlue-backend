const { getConnection } = require("../config/db");
const aiConfig = require("../config/ai.config");
const aiClient = aiConfig.aiClient || aiConfig;
const resumeService = require("./resume.service");
const coverLetterRepo = require("../repositories/coverLetter.repository");

/**
 * 자소서 생성 + GENERATED_DOCUMENT 저장
 * 동일 이력서+공고 기존 자소서 삭제 후 재생성
 */
async function generateAndSave({ memberId, resumeId, jobPostingId, companyName, jobTitle, jobDescription, questions }) {
    // 1. 이력서 상세 데이터 조회
    const resumeDetailResult = await resumeService.getResumeDetail(resumeId);
    const resumeDetail = resumeDetailResult?.data ?? {};

    // 2. AI 자소서 생성 요청
    const aiResponse = await aiClient.post("/cover-letter/generate", {
        resumeData:     resumeDetail,
        companyName,
        jobTitle,
        jobDescription: jobDescription ?? "",
        questions:      Array.isArray(questions) && questions.length > 0 ? questions : undefined,
    });

    const items = aiResponse.data?.items;
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("AI 자소서 생성 실패");
    }

    // 3. GENERATED_DOCUMENT 저장
    const conn = await getConnection();
    try {
        await coverLetterRepo.deleteCoverLetterByResumeJob(resumeId, jobPostingId, conn);
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

module.exports = { generateAndSave };
