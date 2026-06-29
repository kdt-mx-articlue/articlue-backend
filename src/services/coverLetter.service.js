const { getConnection } = require("../config/db");
const aiConfig = require("../config/ai.config");
const aiClient = aiConfig.aiClient || aiConfig;
const resumeRepo = require("../repositories/resume.repository");
const resumeService = require("./resume.service");

/**
 * 자소서 생성 + COVER_LETTER_ITEM UPSERT
 * 기존 항목 삭제 후 AI 생성 항목으로 교체
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

    // 3. COVER_LETTER_ITEM UPSERT
    const conn = await getConnection();
    try {
        let coverLetterId = await resumeRepo.findCoverLetterByResumeId(resumeId, conn);

        if (!coverLetterId) {
            // 없으면 새로 생성
            coverLetterId = await resumeRepo.createCoverLetter(resumeId, conn);
        } else {
            // 있으면 기존 항목 전체 삭제 후 타임스탬프 갱신
            await resumeRepo.deleteAllCoverLetterItems(coverLetterId, conn);
            await resumeRepo.updateCoverLetterTimestamp(coverLetterId, conn);
        }

        // 새 항목 INSERT
        for (let i = 0; i < items.length; i++) {
            await resumeRepo.createCoverLetterItem(
                {
                    questionOrder: i + 1,
                    subTitle:      items[i].question ?? `문항 ${i + 1}`,
                    content:       items[i].answer   ?? "",
                },
                coverLetterId,
                conn
            );
        }

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
