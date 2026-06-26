const { oracledb } = require("../config/db");

/**
 * 이력서 생성
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
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        }
    );

    return result.outBinds.resumeId[0];
}

/**
 * 희망지역 생성
 */
async function createDesiredLocation(location, resumeId, conn) {
    const sql = `
        INSERT INTO RESUME_DESIRED_LOCATION
        (
            DESIRED_LOCATION_ID,
            RESUME_ID,
            LOCATION_NAME
        )
        VALUES
        (
            SEQ_RESUME_DESIRED_LOCATION.NEXTVAL ,
            :resumeId,
            :locationName
        )
    `;

    return await conn.execute(
        sql,
        {
            resumeId,
            locationName: location.locationName,
        }
    );
}

/**
 * 학력 생성
 */
async function createEducation(education, resumeId, conn) {
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
            major: education.major || null,
            graduationStatus: education.graduationStatus || null,
            gpa: education.gpa || null,
            startYm: education.startYm || null,
            endYm: education.endYm || null,
        }
    );
}

/**
 * 활동경험 생성
 */
async function createExperience(experience, resumeId, conn) {
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
            startYm: experience.startYm || null,
            endYm: experience.endYm || null,
        }
    );
}

/**
 * 경력사항 생성
 */
async function createCareer(career, resumeId, conn) {
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
            department: career.department || null,
            position: career.position || null,
            startYm: career.startYm || null,
            endYm: career.endYm || null,
            mainAchievement: career.mainAchievement || null,
        }
    );
}

/**
 * 자격증 생성
 */
async function createCertificate(certificate, resumeId, conn) {
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
            acquiredYm: certificate.acquiredYm || null,
            issuer: certificate.issuer || null,
        }
    );
}

/**
 * 자기소개서 생성
 */
async function createCoverLetter(resumeId, conn) {
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
        RETURNING COVER_LETTER_ID INTO :coverLetterId
    `;

    const result = await conn.execute(
        sql,
        {
            resumeId,
            coverLetterId: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        }
    );

    return result.outBinds.coverLetterId[0];
}

/**
 * 자기소개서 문항 생성
 */
async function createCoverLetterItem(item, coverLetterId, conn) {
    const sql = `
        INSERT INTO COVER_LETTER_ITEM
        (
            COVER_LETTER_ITEM_ID,
            COVER_LETTER_ID,
            QUESTION_ORDER,
            SUB_TITLE,
            CONTENT,
            CREATE_AT,
            UPDATE_AT
        )
        VALUES
        (
            SEQ_COVER_LETTER_ITEM.NEXTVAL,
            :coverLetterId,
            :questionOrder,
            :subTitle,
            :content,
            SYSDATE,
            SYSDATE
        )
    `;

    return await conn.execute(
        sql,
        {
            coverLetterId,
            questionOrder: item.questionOrder,
            subTitle: item.subTitle,
            content: item.content,
        }
    );
}

/**
 * 포트폴리오 생성
 */
async function createPortfolio(portfolio, resumeId, conn) {
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
            fileStatus: portfolio.fileStatus,
        }
    );
}

/**
 * 이력서 기술스택 생성
 */
async function createResumeTechStack(tech, resumeId, conn) {
    const sql = `
        INSERT INTO RESUME_TECH_STACK
        (
            RESUME_TECH_ID,
            RESUME_ID,
            TECH_CATEGORY_CODE,
            CREATE_AT
        )
        VALUES
        (
            SEQ_RESUME_TECH_STACK.NEXTVAL,
            :resumeId,
            :techCategoryCode,
            SYSDATE
        )
    `;

    return await conn.execute(
        sql,
        {
            resumeId,
            techCategoryCode: tech.techCategoryCode,
        }
    );
}

/**
 * 특정 이력서 전체 상세 조회
 *
 * 주의:
 * - GitHub 저장소 최종 명세에는 PUSHED_AT이 없으므로 NULL AS GITHUB_PUSHED_AT으로 맞춘다.
 * - service의 buildResumeDetail() 구조를 유지하기 위한 alias다.
 */
async function getResumeDetail(resumeId, conn) {
    const sql = `
        SELECT
            R.RESUME_ID AS RESUME_ID,
            R.MEMBER_ID AS MEMBER_ID,
            R.RESUME_TITLE AS RESUME_TITLE,
            R.DESIRED_JOB AS DESIRED_JOB,
            R.INTRODUCTION AS INTRODUCTION,
            R.RESUME_STATUS AS RESUME_STATUS,
            R.REPRESENTATIVE_YN AS REPRESENTATIVE_YN,
            R.CREATE_AT AS RESUME_CREATE_AT,
            R.UPDATE_AT AS RESUME_UPDATE_AT,

            M.LOGIN_ID AS LOGIN_ID,
            M.EMAIL AS MEMBER_EMAIL,
            M.NICKNAME AS NICKNAME,
            M.USER_TYPE AS USER_TYPE,

            MP.PROFILE_ID AS PROFILE_ID,
            MP.NAME AS PROFILE_NAME,
            MP.PHONE AS PHONE,
            MP.BIRTH_DATE AS BIRTH_DATE,
            MP.ADDRESS AS ADDRESS,
            MP.GENDER AS GENDER,
            MP.MILITARY_STATUS AS MILITARY_STATUS,
            MP.PROFILE_IMAGE_URL AS PROFILE_IMAGE_URL,

            RDL.DESIRED_LOCATION_ID AS DESIRED_LOCATION_ID,
            RDL.LOCATION_NAME AS LOCATION_NAME,

            E.EDUCATION_ID AS EDUCATION_ID,
            E.SCHOOL_TYPE AS SCHOOL_TYPE,
            E.SCHOOL_NAME AS SCHOOL_NAME,
            E.MAJOR AS MAJOR,
            E.GRADUATION_STATUS AS GRADUATION_STATUS,
            E.GPA AS GPA,
            E.START_YM AS EDUCATION_START_YM,
            E.END_YM AS EDUCATION_END_YM,

            EX.EXPERIENCE_ID AS EXPERIENCE_ID,
            EX.EXPERIENCE_TYPE AS EXPERIENCE_TYPE,
            EX.EXPERIENCE_NAME AS EXPERIENCE_NAME,
            EX.START_YM AS EXPERIENCE_START_YM,
            EX.END_YM AS EXPERIENCE_END_YM,

            C.CAREER_ID AS CAREER_ID,
            C.COMPANY_NAME AS CAREER_COMPANY_NAME,
            C.DEPARTMENT AS DEPARTMENT,
            C.POSITION AS POSITION,
            C.START_YM AS CAREER_START_YM,
            C.END_YM AS CAREER_END_YM,
            C.MAIN_ACHIEVEMENT AS MAIN_ACHIEVEMENT,

            CERT.CERTIFICATE_ID AS CERTIFICATE_ID,
            CERT.CERTIFICATE_NAME AS CERTIFICATE_NAME,
            CERT.ACQUIRED_YM AS ACQUIRED_YM,
            CERT.ISSUER AS ISSUER,

            CL.COVER_LETTER_ID AS COVER_LETTER_ID,
            CL.CREATE_AT AS COVER_LETTER_CREATE_AT,
            CL.UPDATE_AT AS COVER_LETTER_UPDATE_AT,

            CLI.COVER_LETTER_ITEM_ID AS COVER_LETTER_ITEM_ID,
            CLI.QUESTION_ORDER AS QUESTION_ORDER,
            CLI.SUB_TITLE AS SUB_TITLE,
            CLI.CONTENT AS COVER_LETTER_CONTENT,
            CLI.CREATE_AT AS COVER_LETTER_ITEM_CREATE_AT,
            CLI.UPDATE_AT AS COVER_LETTER_ITEM_UPDATE_AT,

            PF.PORTFOLIO_ID AS PORTFOLIO_ID,
            PF.ORIGINAL_FILE_NAME AS ORIGINAL_FILE_NAME,
            PF.STORED_FILE_NAME AS STORED_FILE_NAME,
            PF.FILE_EXTENSION AS FILE_EXTENSION,
            PF.FILE_PATH AS FILE_PATH,
            PF.FILE_SIZE AS FILE_SIZE,
            PF.UPLOAD_AT AS UPLOAD_AT,
            PF.FILE_STATUS AS FILE_STATUS,

            RTS.RESUME_TECH_ID AS RESUME_TECH_ID,
            RTS.TECH_CATEGORY_CODE AS RESUME_TECH_CATEGORY_CODE,
            TC.TECH_CATEGORY_NAME AS RESUME_TECH_CATEGORY_NAME,
            TC.TECH_NAME AS RESUME_TECH_NAME,
            RTS.CREATE_AT AS RESUME_TECH_CREATE_AT,

            RGR.RESUME_GITHUB_REPO_ID AS RESUME_GITHUB_REPO_ID,
            RGR.DISPLAY_ORDER AS DISPLAY_ORDER,
            RGR.PROJECT_DESCRIPTION AS PROJECT_DESCRIPTION,
            RGR.CREATED_DATE AS RESUME_GITHUB_CREATED_DATE,

            GR.GITHUB_REPOSITORY_ID AS GITHUB_REPOSITORY_ID,
            GR.GITHUB_REPO_EXTERNAL_ID AS GITHUB_REPO_EXTERNAL_ID,
            GR.NAME AS GITHUB_REPO_NAME,
            GR.FULL_NAME AS GITHUB_FULL_NAME,
            GR.HTML_URL AS GITHUB_HTML_URL,
            GR.DESCRIPTION AS GITHUB_DESCRIPTION,
            GR.FORK AS GITHUB_FORK,
            GR.ARCHIVED AS GITHUB_ARCHIVED,
            GR.DEFAULT_BRANCH AS DEFAULT_BRANCH,
            GR.CREATED_AT AS GITHUB_CREATED_AT,
            GR.UPDATED_AT AS GITHUB_UPDATED_AT,
            NULL AS GITHUB_PUSHED_AT,
            GR.LAST_SYNC_AT AS GITHUB_LAST_SYNC_AT,

            GRTS.GITHUB_REPO_TECH_ID AS GITHUB_REPO_TECH_ID,
            GRTS.TECH_CATEGORY_CODE AS GITHUB_TECH_CATEGORY_CODE,
            GTC.TECH_CATEGORY_NAME AS GITHUB_TECH_CATEGORY_NAME,
            GTC.TECH_NAME AS GITHUB_TECH_NAME,
            GRTS.LANGUAGE_NAME AS LANGUAGE_NAME,
            GRTS.USAGE_RATIO AS USAGE_RATIO,
            GRTS.COLLECTED_AT AS GITHUB_TECH_COLLECTED_AT,

            GCD.GITHUB_REPO_COMMIT_DAILY_ID AS GITHUB_REPO_COMMIT_DAILY_ID,
            GCD.COMMIT_DATE AS COMMIT_DATE,
            GCD.COMMIT_COUNT AS COMMIT_COUNT,
            GCD.COLLECTED_AT AS COMMIT_COLLECTED_AT

        FROM RESUME R
        JOIN MEMBER M
            ON R.MEMBER_ID = M.MEMBER_ID
        LEFT JOIN MEMBER_PROFILE MP
            ON R.MEMBER_ID = MP.MEMBER_ID
        LEFT JOIN RESUME_DESIRED_LOCATION RDL
            ON R.RESUME_ID = RDL.RESUME_ID
        LEFT JOIN EDUCATION E
            ON R.RESUME_ID = E.RESUME_ID
        LEFT JOIN EXPERIENCE EX
            ON R.RESUME_ID = EX.RESUME_ID
        LEFT JOIN CAREER C
            ON R.RESUME_ID = C.RESUME_ID
        LEFT JOIN CERTIFICATE CERT
            ON R.RESUME_ID = CERT.RESUME_ID
        LEFT JOIN COVER_LETTER CL
            ON R.RESUME_ID = CL.RESUME_ID
        LEFT JOIN COVER_LETTER_ITEM CLI
            ON CL.COVER_LETTER_ID = CLI.COVER_LETTER_ID
        LEFT JOIN PORTFOLIO_FILE PF
            ON R.RESUME_ID = PF.RESUME_ID
        LEFT JOIN RESUME_TECH_STACK RTS
            ON R.RESUME_ID = RTS.RESUME_ID
        LEFT JOIN TECH_CATEGORY TC
            ON RTS.TECH_CATEGORY_CODE = TC.TECH_CATEGORY_CODE
        LEFT JOIN RESUME_GITHUB_REPOSITORY RGR
            ON R.RESUME_ID = RGR.RESUME_ID
        LEFT JOIN GITHUB_REPOSITORY GR
            ON RGR.GITHUB_REPOSITORY_ID = GR.GITHUB_REPOSITORY_ID
        LEFT JOIN GITHUB_REPO_TECH_STACK GRTS
            ON GR.GITHUB_REPOSITORY_ID = GRTS.GITHUB_REPOSITORY_ID
        LEFT JOIN TECH_CATEGORY GTC
            ON GRTS.TECH_CATEGORY_CODE = GTC.TECH_CATEGORY_CODE
        LEFT JOIN GITHUB_REPO_COMMIT_DAILY GCD
            ON GR.GITHUB_REPOSITORY_ID = GCD.GITHUB_REPOSITORY_ID
        WHERE R.RESUME_ID = :resumeId
        ORDER BY
            R.RESUME_ID,
            RDL.DESIRED_LOCATION_ID,
            E.EDUCATION_ID,
            EX.EXPERIENCE_ID,
            C.CAREER_ID,
            CERT.CERTIFICATE_ID,
            CL.COVER_LETTER_ID,
            CLI.QUESTION_ORDER,
            PF.PORTFOLIO_ID,
            RTS.RESUME_TECH_ID,
            RGR.DISPLAY_ORDER,
            GRTS.USAGE_RATIO DESC,
            GCD.COMMIT_DATE DESC
    `;

    const result = await conn.execute(
        sql,
        {
            resumeId,
        }
    );

    return result.rows;
}

module.exports = {
    // 생성
    createResume,
    createDesiredLocation,
    createEducation,
    createExperience,
    createCareer,
    createCertificate,
    createCoverLetter,
    createCoverLetterItem,
    createPortfolio,
    createResumeTechStack,
    
    // 조회
    getResumeDetail,
};