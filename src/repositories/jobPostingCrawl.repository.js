const { oracledb } = require("../config/db");

/**
 * 채용공고 수집 배치 전용 쿼리
 *
 * CONTENT_HASH: 목록 기준 해시. AI 벡터 반영(ingest)이 끝난 뒤에만 기록한다.
 *   → 목록 해시가 같으면 다음 수집에서 건너뛰고, 다르거나 NULL(신규·반영 실패)이면 다시 수집·반영
 */

function clip(value, max) {
    if (value === undefined || value === null || value === "") return null;
    const text = String(value);
    return text.length > max ? text.slice(0, max) : text;
}

async function findBySourceIds(conn, source, sourceJobIds) {
    const found = new Map();

    // Oracle IN 절 1000개 제한 → 500개씩
    for (let i = 0; i < sourceJobIds.length; i += 500) {
        const chunk = sourceJobIds.slice(i, i + 500);
        const binds = { source };
        const placeholders = chunk.map((id, index) => {
            binds[`id${index}`] = id;
            return `:id${index}`;
        });

        const result = await conn.execute(
            `
            SELECT SOURCE_JOB_ID AS "sourceJobId",
                   MAX(JOB_POSTING_ID) AS "jobPostingId",
                   MAX(CONTENT_HASH) AS "contentHash"
              FROM JOB_POSTING
             WHERE SOURCE = :source
               AND SOURCE_JOB_ID IN (${placeholders.join(", ")})
             GROUP BY SOURCE_JOB_ID
            `,
            binds,
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        for (const row of result.rows) {
            found.set(row.sourceJobId, row);
        }
    }

    return found;
}

async function findOrCreateCompany(conn, companyName, workLocation) {
    const name = clip(companyName, 150);

    const existing = await conn.execute(
        `SELECT COMPANY_ID AS "companyId" FROM COMPANY WHERE COMPANY_NAME = :name`,
        { name },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (existing.rows.length > 0) {
        return existing.rows[0].companyId;
    }

    const result = await conn.execute(
        `
        INSERT INTO COMPANY (COMPANY_ID, COMPANY_NAME, WORK_LOCATION)
        VALUES (SEQ_COMPANY.NEXTVAL, :name, :workLocation)
        RETURNING COMPANY_ID INTO :companyId
        `,
        {
            name,
            workLocation: clip(workLocation, 200),
            companyId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        }
    );

    return result.outBinds.companyId[0];
}

function postingBinds(posting, companyId) {
    return {
        companyId,
        postingTitle: clip(posting.title, 300),
        jobName: clip(posting.jobName || posting.title, 100),
        careerCondition: clip(posting.careerCondition, 100),
        employmentType: clip(posting.employmentType, 100),
        workLocation: clip(posting.workLocation, 200),
        mainTask: posting.mainTask || null,
        qualification: posting.qualification || null,
        preferredQualification: posting.preferredQualification || null,
        talentProfile: posting.talentProfile || null,
        originalUrl: clip(posting.originalUrl, 1000),
        deadlineDate: posting.deadlineDate || null,
    };
}

async function insertPosting(conn, posting, companyId) {
    const result = await conn.execute(
        `
        INSERT INTO JOB_POSTING (
            JOB_POSTING_ID, COMPANY_ID, POSTING_TITLE, JOB_NAME, CAREER_CONDITION,
            EMPLOYMENT_TYPE, WORK_LOCATION, MAIN_TASK, QUALIFICATION, PREFERRED_QUALIFICATION,
            TALENT_PROFILE, ORIGINAL_URL, DEADLINE_DATE, POSTING_STATUS,
            SOURCE, SOURCE_JOB_ID, CREATED_DATE
        ) VALUES (
            SEQ_JOB_POSTING.NEXTVAL, :companyId, :postingTitle, :jobName, :careerCondition,
            :employmentType, :workLocation, :mainTask, :qualification, :preferredQualification,
            :talentProfile, :originalUrl, :deadlineDate, 'ACTIVE',
            :source, :sourceJobId, SYSDATE
        )
        RETURNING JOB_POSTING_ID INTO :jobPostingId
        `,
        {
            ...postingBinds(posting, companyId),
            source: posting.source,
            sourceJobId: posting.sourceJobId,
            jobPostingId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        }
    );

    return result.outBinds.jobPostingId[0];
}

async function updatePosting(conn, jobPostingId, posting, companyId) {
    await conn.execute(
        `
        UPDATE JOB_POSTING
           SET COMPANY_ID = :companyId,
               POSTING_TITLE = :postingTitle,
               JOB_NAME = :jobName,
               CAREER_CONDITION = :careerCondition,
               EMPLOYMENT_TYPE = :employmentType,
               WORK_LOCATION = :workLocation,
               MAIN_TASK = :mainTask,
               QUALIFICATION = :qualification,
               PREFERRED_QUALIFICATION = :preferredQualification,
               TALENT_PROFILE = :talentProfile,
               ORIGINAL_URL = :originalUrl,
               DEADLINE_DATE = :deadlineDate,
               POSTING_STATUS = 'ACTIVE',
               CONTENT_HASH = NULL,
               UPDATED_DATE = SYSDATE
         WHERE JOB_POSTING_ID = :jobPostingId
        `,
        { ...postingBinds(posting, companyId), jobPostingId }
    );
}

async function markIngested(conn, entries) {
    if (entries.length === 0) return;

    await conn.executeMany(
        `UPDATE JOB_POSTING SET CONTENT_HASH = :contentHash, UPDATED_DATE = SYSDATE WHERE JOB_POSTING_ID = :jobPostingId`,
        entries.map(({ jobPostingId, contentHash }) => ({ jobPostingId, contentHash })),
        { autoCommit: true }
    );
}

/**
 * 마감일이 지난 "수집 공고"만 CLOSED 처리 (시드 데모 공고는 유지)
 */
async function closeExpiredCrawledPostings(conn) {
    const result = await conn.execute(
        `
        SELECT JOB_POSTING_ID AS "jobPostingId"
          FROM JOB_POSTING
         WHERE CONTENT_HASH IS NOT NULL
           AND POSTING_STATUS = 'ACTIVE'
           AND DEADLINE_DATE < TRUNC(SYSDATE)
        `,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const ids = result.rows.map((row) => row.jobPostingId);

    if (ids.length > 0) {
        await conn.executeMany(
            `UPDATE JOB_POSTING SET POSTING_STATUS = 'CLOSED', UPDATED_DATE = SYSDATE WHERE JOB_POSTING_ID = :id`,
            ids.map((id) => ({ id })),
            { autoCommit: true }
        );
    }

    return ids;
}

module.exports = {
    findBySourceIds,
    findOrCreateCompany,
    insertPosting,
    updatePosting,
    markIngested,
    closeExpiredCrawledPostings,
};
