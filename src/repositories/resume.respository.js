const { getConnection, oracledb } = require("../config/db");

/**
 * 1. 이력서 생성
 */
async function createResume(resume, conn) {

    const sql = `
        INSERT INTO RESUME
        (
            RESUME_ID,
            MEMBER_ID,
            RESUME_TITLE,
            DESIRED_JOB,
            INTRODUCTION,
            RESUME_STATUS,
            REPRESENTATIVE_YN,
            CREATE_AT,
            UPDATE_AT
        )
        VALUES
        (
            SEQ_RESUME.NEXTVAL,
            :memberId,
            :resumeTitle,
            :desiredJob,
            :introduction,
            'DRAFT',
            'N',
            SYSDATE,
            SYSDATE
        )   
        RETURNING RESUME_ID INTO :resumeId
    `;

    const result = await conn.execute(
        sql,
        {
            memberId: resume.memberId,
            resumeTitle: resume.resumeTitle,
            desiredJob: resume.desiredJob,
            introduction: resume.introduction,

            resumeId: {
                dir: oracledb.BIND_OUT, // BIND_OUT
                type: oracledb.NUMBER  // NUMBER
            }
        }
    );

    return result.outBinds.resumeId[0];
}

/**
 * 2. 학력생성
 */
async function createEducation(
    education,
    resumeId,
    conn
) {

    const sql = `
        INSERT INTO EDUCATION
        (
            EDUCATION_ID,
            RESUME_ID,
            SCHOOL_TYPE,
            SCHOOL_NAME,
            MAJOR,
            GRADUATION_STATUS,
            GPA,
            START_YM,
            END_YM
        )
        VALUES
        (
            SEQ_EDUCATION.NEXTVAL,
            :resumeId,
            :schoolType,
            :schoolName,
            :major,
            :graduationStatus,
            :gpa,
            :startYm,
            :endYm
        )
    `;

    return await conn.execute(
        sql,
        {
            resumeId,
            schoolType: education.schoolType,
            schoolName: education.schoolName,
            major: education.major,
            graduationStatus: education.graduationStatus,
            gpa: education.gpa,
            startYm: education.startYm,
            endYm: education.endYm
        }
    );
}

/**
 * 3. 활동경험생성
 */
async function createExperience(
    experience,
    resumeId,
    conn
) {

    const sql = `
        INSERT INTO EXPERIENCE
        (
            EXPERIENCE_ID,
            RESUME_ID,
            EXPERIENCE_TYPE,
            EXPERIENCE_NAME,
            START_YM,
            END_YM
        )
        VALUES
        (
            SEQ_EXPERIENCE.NEXTVAL,
            :resumeId,
            :experienceType,
            :experienceName,
            :startYm,
            :endYm
        )
    `;

    return await conn.execute(
        sql,
        {
            resumeId,
            experienceType: experience.experienceType,
            experienceName: experience.experienceName,
            startYm: experience.startYm,
            endYm: experience.endYm
        }
    );
}

/**
 * 4. 자기소개서생성
 */
async function createCoverLetter(
    coverLetter,
    resumeId,
    conn
) {

    const sql = `
        INSERT INTO COVER_LETTER
        (
            COVER_LETTER_ID,
            RESUME_ID,
            CREATE_AT,
            UPDATE_AT
        )
        VALUES
        (
            SEQ_COVER_LETTER.NEXTVAL,
            :resumeId,
            SYSDATE,
            SYSDATE
        )
    `;

    return await conn.execute(
        sql,
        {
            resumeId
        }
    );
}

/**
 * 5. 포트폴리오생성
 */
async function createPortfolio(
    portfolio,
    resumeId,
    conn
) {

    const sql = `
        INSERT INTO PORTFOLIO_FILE
        (
            PORTFOLIO_ID,
            RESUME_ID,
            ORIGINAL_FILE_NAME,
            STORED_FILE_NAME,
            FILE_EXTENSION,
            FILE_PATH,
            FILE_SIZE,
            UPLOAD_AT,
            FILE_STATUS
        )
        VALUES
        (
            SEQ_PORTFOLIO_FILE.NEXTVAL,
            :resumeId,
            :originalFileName,
            :storedFileName,
            :fileExtension,
            :filePath,
            :fileSize,
            SYSDATE,
            :fileStatus
        )
    `;

    return await conn.execute(
        sql,
        {
            resumeId,
            originalFileName: portfolio.originalFileName,
            storedFileName: portfolio.storedFileName,
            fileExtension: portfolio.fileExtension,
            filePath: portfolio.filePath,
            fileSize: portfolio.fileSize,
            fileStatus: portfolio.fileStatus
        }
    );
}

/**
 * 6. 자격증생성
 */
async function createCertificate(
    certificate,
    resumeId,
    conn
) {

    const sql = `
        INSERT INTO CERTIFICATE
        (
            CERTIFICATE_ID,
            RESUME_ID,
            CERTIFICATE_NAME,
            ACQUIRED_YM,
            ISSUER
        )
        VALUES
        (
            SEQ_CERTIFICATE.NEXTVAL,
            :resumeId,
            :certificateName,
            :acquiredYm,
            :issuer
        )
    `;

    return await conn.execute(
        sql,
        {
            resumeId,
            certificateName: certificate.certificateName,
            acquiredYm: certificate.acquiredYm,
            issuer: certificate.issuer
        }
    );
}

/**
 * 7. 경력사항생성
 */
async function createCareer(
    career,
    resumeId,
    conn
) {

    const sql = `
        INSERT INTO CAREER
        (
            CAREER_ID,
            RESUME_ID,
            COMPANY_NAME,
            DEPARTMENT,
            POSITION,
            START_YM,
            END_YM,
            MAIN_ACHIEVEMENT
        )
        VALUES
        (
            SEQ_CAREER.NEXTVAL,
            :resumeId,
            :companyName,
            :department,
            :position,
            :startYm,
            :endYm,
            :mainAchievement
        )
    `;

    return await conn.execute(
        sql,
        {
            resumeId,
            companyName: career.companyName,
            department: career.department,
            position: career.position,
            startYm: career.startYm,
            endYm: career.endYm,
            mainAchievement: career.mainAchievement
        }
    );
}

module.exports = {
    createResume,
    createEducation,
    createExperience,
    createCoverLetter,
    createPortfolio,
    createCertificate,
    createCareer
};