const oracledb = require("oracledb");
const jobPostingRepository = require("./jobPosting.repository");

async function findResumeContext(conn, resumeId) {
    const resume = await findResume(conn, resumeId);

    if (!resume) {
        return null;
    }

    const educations = await findEducations(conn, resumeId);
    const experiences = await findExperiences(conn, resumeId);
    const careers = await findCareers(conn, resumeId);
    const certificates = await findCertificates(conn, resumeId);
    const techStacks = await findResumeTechStacks(conn, resumeId);
    const coverLetters = await findCoverLetters(conn, resumeId);
    const githubRepos = await findResumeGithubRepositories(conn, resumeId);

    return [
        "[이력서]",
        `제목: ${resume.resumeTitle || ""}`,
        `희망직무: ${resume.desiredJob || ""}`,
        `소개: ${resume.introduction || ""}`,
        "",
        "[학력]",
        educations,
        "",
        "[활동경험]",
        experiences,
        "",
        "[경력]",
        careers,
        "",
        "[자격증]",
        certificates,
        "",
        "[기술스택]",
        techStacks,
        "",
        "[GitHub 프로젝트]",
        githubRepos,
        "",
        "[자기소개서]",
        coverLetters,
    ].join("\n");
}

async function findJobPostingContext(conn, jobPostingId) {
    return jobPostingRepository.findContextById(conn, jobPostingId);
}

async function findResume(conn, resumeId) {
    const sql = `
        SELECT
            resume_id AS "resumeId",
            resume_title AS "resumeTitle",
            desired_job AS "desiredJob",
            introduction AS "introduction",
            resume_status AS "resumeStatus"
        FROM resume
        WHERE resume_id = :resumeId
    `;

    const result = await conn.execute(
        sql,
        { resumeId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0] || null;
}

async function findEducations(conn, resumeId) {
    const sql = `
        SELECT
            school_type AS "schoolType",
            school_name AS "schoolName",
            major AS "major",
            graduation_status AS "graduationStatus",
            gpa AS "gpa",
            start_ym AS "startYm",
            end_ym AS "endYm"
        FROM education
        WHERE resume_id = :resumeId
        ORDER BY start_ym
    `;

    const result = await conn.execute(
        sql,
        { resumeId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows.length) return "학력 없음";

    return result.rows.map((row) => (
        `- ${row.schoolType || ""} / ${row.schoolName || ""} / ${row.major || ""} / ` +
        `${row.graduationStatus || ""} / GPA ${row.gpa || ""} / ${row.startYm || ""}~${row.endYm || ""}`
    )).join("\n");
}

async function findExperiences(conn, resumeId) {
    const sql = `
        SELECT
            experience_type AS "experienceType",
            experience_name AS "experienceName",
            start_ym AS "startYm",
            end_ym AS "endYm"
        FROM experience
        WHERE resume_id = :resumeId
        ORDER BY start_ym
    `;

    const result = await conn.execute(
        sql,
        { resumeId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows.length) return "활동경험 없음";

    return result.rows.map((row) => (
        `- ${row.experienceType || ""}: ${row.experienceName || ""} (${row.startYm || ""}~${row.endYm || ""})`
    )).join("\n");
}

async function findCareers(conn, resumeId) {
    const sql = `
        SELECT
            company_name AS "companyName",
            department AS "department",
            position AS "position",
            start_ym AS "startYm",
            end_ym AS "endYm",
            DBMS_LOB.SUBSTR(main_achievement, 4000, 1) AS "mainAchievement"
        FROM career
        WHERE resume_id = :resumeId
        ORDER BY start_ym
    `;

    const result = await conn.execute(
        sql,
        { resumeId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows.length) return "경력 없음";

    return result.rows.map((row) => (
        `- ${row.companyName || ""} ${row.department || ""} ${row.position || ""} ` +
        `(${row.startYm || ""}~${row.endYm || ""})\n  ${row.mainAchievement || ""}`
    )).join("\n");
}

async function findCertificates(conn, resumeId) {
    const sql = `
        SELECT
            certificate_name AS "certificateName",
            acquired_ym AS "acquiredYm",
            issuer AS "issuer"
        FROM certificate
        WHERE resume_id = :resumeId
        ORDER BY acquired_ym
    `;

    const result = await conn.execute(
        sql,
        { resumeId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows.length) return "자격증 없음";

    return result.rows.map((row) => (
        `- ${row.certificateName || ""} / ${row.issuer || ""} / ${row.acquiredYm || ""}`
    )).join("\n");
}

async function findResumeTechStacks(conn, resumeId) {
    const sql = `
        SELECT
            tc.tech_category_name AS "categoryName",
            tc.tech_name AS "techName"
        FROM resume_tech_stack rts
        JOIN tech_category tc
            ON tc.tech_category_code = rts.tech_category_code
        WHERE rts.resume_id = :resumeId
        ORDER BY tc.tech_category_code
    `;

    const result = await conn.execute(
        sql,
        { resumeId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows.length) return "기술스택 없음";

    return result.rows.map((row) => (
        `- ${row.categoryName || ""}: ${row.techName || ""}`
    )).join("\n");
}

async function findCoverLetters(conn, resumeId) {
    const sql = `
        SELECT
            cli.question_order AS "questionOrder",
            cli.sub_title AS "subTitle",
            DBMS_LOB.SUBSTR(cli.content, 4000, 1) AS "content"
        FROM cover_letter cl
        JOIN cover_letter_item cli
            ON cli.cover_letter_id = cl.cover_letter_id
        WHERE cl.resume_id = :resumeId
        ORDER BY cli.question_order
    `;

    const result = await conn.execute(
        sql,
        { resumeId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows.length) return "자기소개서 없음";

    return result.rows.map((row) => (
        `Q${row.questionOrder}. ${row.subTitle || ""}\n${row.content || ""}`
    )).join("\n\n");
}

async function findResumeGithubRepositories(conn, resumeId) {
    const sql = `
        SELECT
            gr.name AS "name",
            gr.full_name AS "fullName",
            gr.html_url AS "htmlUrl",
            DBMS_LOB.SUBSTR(gr.description, 4000, 1) AS "description",
            rgr.display_order AS "displayOrder",
            DBMS_LOB.SUBSTR(rgr.project_description, 4000, 1) AS "projectDescription"
        FROM resume_github_repository rgr
        JOIN github_repository gr
            ON gr.github_repository_id = rgr.github_repository_id
        WHERE rgr.resume_id = :resumeId
        ORDER BY rgr.display_order
    `;

    const result = await conn.execute(
        sql,
        { resumeId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows.length) return "GitHub 연결 저장소 없음";

    return result.rows.map((row) => (
        `- ${row.fullName || row.name || ""}\n  URL: ${row.htmlUrl || ""}\n  설명: ${row.projectDescription || row.description || ""}`
    )).join("\n");
}

module.exports = {
    findResumeContext,
    findJobPostingContext,
};