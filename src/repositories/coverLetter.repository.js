const oracledb = require("oracledb");

/**
 * 자소서 저장 (GENERATED_DOCUMENT)
 */
async function createCoverLetter({ resumeId, jobPostingId, companyName, jobTitle, items }, conn) {
    const title = `${companyName} ${jobTitle} 자기소개서`;
    const content = JSON.stringify(items);

    const sql = `
        INSERT INTO GENERATED_DOCUMENT (
            GENERATED_DOCUMENT_ID,
            RESUME_ID,
            JOB_POSTING_ID,
            DOCUMENT_TYPE,
            DOCUMENT_TITLE,
            DOCUMENT_CONTENT,
            CREATED_DATE,
            SAVE_STATUS
        ) VALUES (
            SEQ_GENERATED_DOCUMENT.NEXTVAL,
            :resumeId,
            :jobPostingId,
            'COVER_LETTER',
            :title,
            :content,
            SYSDATE,
            'SAVED'
        )
        RETURNING GENERATED_DOCUMENT_ID INTO :docId
    `;
    const result = await conn.execute(sql, {
        resumeId:     Number(resumeId),
        jobPostingId: Number(jobPostingId),
        title,
        content,
        docId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    }, { autoCommit: false });

    return result.outBinds.docId[0];
}

/**
 * 회원의 자소서 목록 조회
 */
async function findCoverLettersByMember(memberId, conn) {
    const sql = `
        SELECT
            gd.GENERATED_DOCUMENT_ID   AS "coverLetterId",
            gd.DOCUMENT_TITLE          AS "title",
            jp.JOB_NAME                AS "jobTitle",
            c.COMPANY_NAME             AS "companyName",
            gd.CREATED_DATE            AS "createdAt"
        FROM GENERATED_DOCUMENT gd
        JOIN JOB_POSTING jp ON gd.JOB_POSTING_ID = jp.JOB_POSTING_ID
        JOIN COMPANY c      ON jp.COMPANY_ID      = c.COMPANY_ID
        JOIN RESUME r       ON gd.RESUME_ID       = r.RESUME_ID
        WHERE r.MEMBER_ID = :memberId
          AND gd.DOCUMENT_TYPE = 'COVER_LETTER'
        ORDER BY gd.CREATED_DATE DESC
    `;
    const result = await conn.execute(
        sql,
        { memberId: Number(memberId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows;
}

/**
 * 자소서 단건 조회
 */
async function findCoverLetterById(coverLetterId, conn) {
    const sql = `
        SELECT
            gd.GENERATED_DOCUMENT_ID   AS "coverLetterId",
            gd.DOCUMENT_TITLE          AS "title",
            gd.DOCUMENT_CONTENT        AS "content",
            jp.JOB_NAME                AS "jobTitle",
            c.COMPANY_NAME             AS "companyName",
            gd.CREATED_DATE            AS "createdAt"
        FROM GENERATED_DOCUMENT gd
        JOIN JOB_POSTING jp ON gd.JOB_POSTING_ID = jp.JOB_POSTING_ID
        JOIN COMPANY c      ON jp.COMPANY_ID      = c.COMPANY_ID
        WHERE gd.GENERATED_DOCUMENT_ID = :coverLetterId
          AND gd.DOCUMENT_TYPE = 'COVER_LETTER'
    `;
    const result = await conn.execute(
        sql,
        { coverLetterId: Number(coverLetterId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0] ?? null;
}

/**
 * 동일 이력서+공고의 기존 자소서 삭제 (재생성 시 중복 방지)
 */
async function deleteCoverLetterByResumeJob(resumeId, jobPostingId, conn) {
    const sql = `
        DELETE FROM GENERATED_DOCUMENT
        WHERE RESUME_ID      = :resumeId
          AND JOB_POSTING_ID = :jobPostingId
          AND DOCUMENT_TYPE  = 'COVER_LETTER'
    `;
    await conn.execute(sql, {
        resumeId:     Number(resumeId),
        jobPostingId: Number(jobPostingId),
    }, { autoCommit: false });
}

/**
 * 자소서 내용 수정
 */
async function updateCoverLetterContent(coverLetterId, items, conn) {
    const sql = `
        UPDATE GENERATED_DOCUMENT
        SET DOCUMENT_CONTENT = :content
        WHERE GENERATED_DOCUMENT_ID = :coverLetterId
    `;
    return await conn.execute(sql, {
        coverLetterId: Number(coverLetterId),
        content: JSON.stringify(items),
    }, { autoCommit: false });
}

module.exports = {
    createCoverLetter,
    findCoverLettersByMember,
    findCoverLetterById,
    updateCoverLetterContent,
    deleteCoverLetterByResumeJob,
};
