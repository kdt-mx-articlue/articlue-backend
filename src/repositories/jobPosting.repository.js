const oracledb = require("oracledb");

async function findAll(conn, filters = {}) {
    const page = Number(filters.page || 1);
    const size = Number(filters.size || 20);
    const offset = (page - 1) * size;

    const binds = {
        offset,
        limit: size,
    };

    let whereSql = "WHERE 1 = 1";

    if (filters.keyword) {
        whereSql += `
            AND (
                LOWER(jp.posting_title) LIKE '%' || LOWER(:keyword) || '%'
                OR LOWER(jp.job_name) LIKE '%' || LOWER(:keyword) || '%'
                OR LOWER(c.company_name) LIKE '%' || LOWER(:keyword) || '%'
            )
        `;
        binds.keyword = filters.keyword;
    }

    if (filters.jobName) {
        whereSql += `
            AND LOWER(jp.job_name) LIKE '%' || LOWER(:jobName) || '%'
        `;
        binds.jobName = filters.jobName;
    }

    const sql = `
        SELECT *
        FROM (
            SELECT
                inner_query.*,
                ROWNUM AS rn
            FROM (
                SELECT
                    jp.job_posting_id AS "jobPostingId",
                    jp.company_id AS "companyId",
                    c.company_name AS "companyName",
                    c.industry_category AS "industryCategory",
                    jp.posting_title AS "postingTitle",
                    jp.job_name AS "jobName",
                    jp.career_condition AS "careerCondition",
                    jp.employment_type AS "employmentType",
                    jp.work_location AS "workLocation",
                    jp.deadline_date AS "deadlineDate",
                    jp.posting_status AS "postingStatus",
                    jp.original_url AS "originalUrl"
                FROM job_posting jp
                JOIN company c
                    ON c.company_id = jp.company_id
                ${whereSql}
                ORDER BY jp.job_posting_id
            ) inner_query
            WHERE ROWNUM <= :offset + :limit
        )
        WHERE rn > :offset
    `;

    const result = await conn.execute(
        sql,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows;
}

async function countAll(conn, filters = {}) {
    const binds = {};
    let whereSql = "WHERE 1 = 1";

    if (filters.keyword) {
        whereSql += `
            AND (
                LOWER(jp.posting_title) LIKE '%' || LOWER(:keyword) || '%'
                OR LOWER(jp.job_name) LIKE '%' || LOWER(:keyword) || '%'
                OR LOWER(c.company_name) LIKE '%' || LOWER(:keyword) || '%'
            )
        `;
        binds.keyword = filters.keyword;
    }

    if (filters.jobName) {
        whereSql += `
            AND LOWER(jp.job_name) LIKE '%' || LOWER(:jobName) || '%'
        `;
        binds.jobName = filters.jobName;
    }

    const sql = `
        SELECT COUNT(*) AS "totalCount"
        FROM job_posting jp
        JOIN company c
            ON c.company_id = jp.company_id
        ${whereSql}
    `;

    const result = await conn.execute(
        sql,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0]?.totalCount || 0;
}

async function findById(conn, jobPostingId) {
    const sql = `
        SELECT
            jp.job_posting_id AS "jobPostingId",
            jp.company_id AS "companyId",
            c.company_name AS "companyName",
            c.industry_category AS "industryCategory",
            c.company_size AS "companySize",
            DBMS_LOB.SUBSTR(c.company_description, 4000, 1) AS "companyDescription",
            c.homepage_url AS "homepageUrl",
            c.average_salary AS "averageSalary",
            DBMS_LOB.SUBSTR(c.welfare_info, 4000, 1) AS "welfareInfo",
            c.work_location AS "companyWorkLocation",

            jp.posting_title AS "postingTitle",
            jp.job_name AS "jobName",
            jp.career_condition AS "careerCondition",
            jp.employment_type AS "employmentType",
            jp.work_location AS "workLocation",
            DBMS_LOB.SUBSTR(jp.main_task, 4000, 1) AS "mainTask",
            DBMS_LOB.SUBSTR(jp.qualification, 4000, 1) AS "qualification",
            DBMS_LOB.SUBSTR(jp.preferred_qualification, 4000, 1) AS "preferredQualification",
            DBMS_LOB.SUBSTR(jp.talent_profile, 4000, 1) AS "talentProfile",
            jp.original_url AS "originalUrl",
            jp.deadline_date AS "deadlineDate",
            jp.posting_status AS "postingStatus"
        FROM job_posting jp
        JOIN company c
            ON c.company_id = jp.company_id
        WHERE jp.job_posting_id = :jobPostingId
    `;

    const result = await conn.execute(
        sql,
        { jobPostingId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0] || null;
}

async function findContextById(conn, jobPostingId) {
    const jobPosting = await findById(conn, jobPostingId);

    if (!jobPosting) {
        return null;
    }

    const contextText = [
        "[기업정보]",
        `기업명: ${jobPosting.companyName || ""}`,
        `산업분류: ${jobPosting.industryCategory || ""}`,
        `기업규모: ${jobPosting.companySize || ""}`,
        `기업소개: ${jobPosting.companyDescription || ""}`,
        `복지정보: ${jobPosting.welfareInfo || ""}`,
        "",
        "[채용공고]",
        `공고명: ${jobPosting.postingTitle || ""}`,
        `직무명: ${jobPosting.jobName || ""}`,
        `경력조건: ${jobPosting.careerCondition || ""}`,
        `고용형태: ${jobPosting.employmentType || ""}`,
        `근무지역: ${jobPosting.workLocation || ""}`,
        "",
        "[주요업무]",
        jobPosting.mainTask || "",
        "",
        "[자격요건]",
        jobPosting.qualification || "",
        "",
        "[우대사항]",
        jobPosting.preferredQualification || "",
        "",
        "[인재상]",
        jobPosting.talentProfile || "",
    ].join("\n");

    return {
        jobPosting,
        contextText,
    };
}

module.exports = {
    findAll,
    countAll,
    findById,
    findContextById,
};