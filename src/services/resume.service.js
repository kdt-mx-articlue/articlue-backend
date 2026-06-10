const { getConnection } = require("../config/db");
const resumeRepository = require("../repositories/resume.respository");
const { createError } = require("../utils/error.util");

/**
 * 이력서 등록
 */
async function createResume(resume, conn) {

    const conn = await getConnection();

    try {

        if (!resume.memberId) {
            throw createError("회원번호가 없습니다.", 400);
        }

        if (!resume.resumeTitle) {
            throw createError("이력서 제목을 입력하세요.", 400);
        }

        if (!resume.desiredJob) {
            throw createError("희망 직무를 입력하세요.", 400);
        }

        if (!resume.introduction) {
            throw createError("한줄 소개를 입력하세요.", 400);
        }

        await resumeRepository.createResume(
            resume,
            conn
        );

        await conn.commit();

        return {
            success: true,
            message: "이력서 등록 완료"
        };

    } catch (error) {

        await conn.rollback();

        throw error;

    } finally {

        await conn.close();

    }
}

// ===========================================

async function createEducation(education, resumeId, conn) {
    /**
     * TODO LIST
     * 1. 이력서 관련 섹션 서비스 완성
     */ 
}

module.exports = {
    createResume
};