const { getConnection } = require("../config/db");
const resumeRepository = require("../repositories/resume.repository");
const { createError } = require("../utils/error.util");

const {
    saveGithubDataByResumeTransaction,
} = require("./github.service");

// 빈 값 검사
function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
}

// 배열 변환 및 검증
function toArray(value, fieldName) {
    if (value === undefined || value === null) {
        return [];
    }

    if (!Array.isArray(value)) {
        throw createError(`${fieldName}은 배열 형식이어야 합니다.`, 400);
    }

    return value;
}

// 필수값 검사
function requireValue(target, fieldName, message) {
    if (!target || isBlank(target[fieldName])) {
        throw createError(message, 400);
    }
}

// 여러 필드 중 하나 이상 필수 검사
function requireAtLeastOne(target, fieldNames, message) {
    if (!target) {
        throw createError(message, 400);
    }

    const hasValue = fieldNames.some((fieldName) => !isBlank(target[fieldName]));

    if (!hasValue) {
        throw createError(message, 400);
    }
}

// 여러 필드 중 첫 번째 유효값 반환
function getFirstValue(target, fieldNames) {
    if (!target) {
        return null;
    }

    for (const fieldName of fieldNames) {
        if (!isBlank(target[fieldName])) {
            return target[fieldName];
        }
    }

    return null;
}

// 숫자형 이력서 ID 검증
function parseResumeId(value) {
    const resumeId = Number(value);

    if (!Number.isInteger(resumeId) || resumeId <= 0) {
        throw createError("이력서 번호가 올바르지 않습니다.", 400);
    }

    return resumeId;
}

/**
 * repository 함수명 후보 중 실제 존재하는 함수 호출
 *
 * 기존 repository 함수명이 createDesiredLocation인지,
 * createResumeDesiredLocation인지 정확히 다를 수 있어서
 * 후보 방식으로 안전하게 처리한다.
 */
async function callRepositoryMethod(methodNames, args, missingMessage) {
    const methodName = methodNames.find(
        (name) => typeof resumeRepository[name] === "function"
    );

    if (!methodName) {
        throw createError(missingMessage, 500);
    }

    return await resumeRepository[methodName](...args);
}

/**
 * 이력서 기본 정보 검증
 */
function validateResume(resume) {
    if (!resume) {
        throw createError("이력서 데이터가 없습니다.", 400);
    }

    requireValue(resume, "memberId", "회원번호가 없습니다.");
    requireValue(resume, "resumeTitle", "이력서 제목을 입력하세요.");
    requireValue(resume, "desiredJob", "희망 직무를 입력하세요.");
    requireValue(resume, "introduction", "한줄 소개를 입력하세요.");
}

/**
 * 희망지역 검증
 */
function validateDesiredLocation(desiredLocation) {
    requireAtLeastOne(
        desiredLocation,
        ["locationName", "location", "desiredLocationName"],
        "희망지역을 입력하세요."
    );
}

/**
 * 학력 검증
 */
function validateEducation(education) {
    requireAtLeastOne(
        education,
        ["schoolName", "institutionName", "educationName"],
        "학교명 또는 교육기관명을 입력하세요."
    );
}

/**
 * 활동경험 검증
 */
function validateExperience(experience) {
    requireAtLeastOne(
        experience,
        ["experienceName", "projectName", "activityName", "name"],
        "활동경험명 또는 프로젝트명을 입력하세요."
    );
}

/**
 * 경력 검증
 */
function validateCareer(career) {
    requireAtLeastOne(
        career,
        ["companyName", "organizationName"],
        "회사명 또는 기관명을 입력하세요."
    );
}

/**
 * 자격증 검증
 */
function validateCertificate(certificate) {
    requireAtLeastOne(
        certificate,
        ["certificateName", "licenseName", "name"],
        "자격증명을 입력하세요."
    );
}

/**
 * 자기소개서 문항 정규화
 *
 * DB 기준:
 * COVER_LETTER_ITEM.SUB_TITLE ← subTitle
 * COVER_LETTER_ITEM.CONTENT   ← content
 */
function normalizeCoverLetterItem(item, index) {
    return {
        questionOrder: item.questionOrder || item.question_order || index + 1,
        subTitle: getFirstValue(item, [
            "subTitle",
            "coverLetterTitle",
            "questionTitle",
            "title",
        ]),
        content: getFirstValue(item, [
            "content",
            "coverLetterContent",
            "answerContent",
        ]),
    };
}

/**
 * 자기소개서 정규화
 */
function normalizeCoverLetter(coverLetter) {
    const items = toArray(
        coverLetter.items ||
        coverLetter.coverLetterItems ||
        coverLetter.itemList,
        "자기소개서 문항"
    );

    return {
        ...coverLetter,
        items: items.map((item, index) => normalizeCoverLetterItem(item, index)),
    };
}

/**
 * 자기소개서 검증
 */
function validateCoverLetter(coverLetter) {
    const normalizedCoverLetter = normalizeCoverLetter(coverLetter);
    const items = normalizedCoverLetter.items;

    if (items.length === 0) {
        throw createError("자기소개서 문항을 입력하세요.", 400);
    }

    for (const item of items) {
        requireAtLeastOne(
            item,
            ["subTitle"],
            "자기소개서 제목 또는 문항을 입력하세요."
        );

        requireAtLeastOne(
            item,
            ["content"],
            "자기소개서 내용을 입력하세요."
        );
    }

    return normalizedCoverLetter;
}

/**
 * 포트폴리오 검증
 */
function validatePortfolioFile(portfolioFile) {
    requireAtLeastOne(
        portfolioFile,
        ["fileName", "originalFileName", "portfolioUrl", "fileUrl"],
        "포트폴리오 파일명 또는 URL을 입력하세요."
    );
}

/**
 * 기술스택 검증
 *
 * 요청 JSON 기준:
 * {
 *   "techCategoryCode": "T101004"
 * }
 */
function validateTechStack(techStack) {
    requireAtLeastOne(
        techStack,
        ["techCategoryCode", "tech_category_code", "techStackId", "techName"],
        "기술스택 정보를 입력하세요."
    );
}

/**
 * GitHub 저장 여부 확인
 */
function hasGithubCreateRequest(resume) {
    return resume.githubSession || resume.github_session;
}

/**
 * 이력서 전체 등록
 *
 * 처리 범위:
 * 1. RESUME 등록
 * 2. 이력서 희망지역 등록
 * 3. 학력 등록
 * 4. 활동경험 등록
 * 5. 경력 등록
 * 6. 자격증 등록
 * 7. 자기소개서 / 자기소개서 문항 등록
 * 8. 포트폴리오 등록
 * 9. 이력서 기술스택 등록
 * 10. GitHub 계정 / 저장소 / 언어 / 커밋 저장
 * 11. RESUME_GITHUB_REPOSITORY 연결
 *
 * 중간 실패 시 전체 rollback
 */
async function createResume(resume) {
    const conn = await getConnection();

    try {
        validateResume(resume);

        const desiredLocations = toArray(
            resume.desiredLocations ||
            resume.desiredLocationList ||
            resume.locations ||
            resume.resumeDesiredLocations,
            "희망지역"
        );

        const educations = toArray(
            resume.educations || resume.educationList,
            "학력"
        );

        const experiences = toArray(
            resume.experiences || resume.experienceList,
            "활동경험"
        );

        const careers = toArray(
            resume.careers || resume.careerList,
            "경력"
        );

        const certificates = toArray(
            resume.certificates || resume.certificateList,
            "자격증"
        );

        const coverLetters = toArray(
            resume.coverLetters || resume.coverLetterList,
            "자기소개서"
        );

        const portfolioFiles = toArray(
            resume.portfolioFiles || resume.portfolios || resume.portfolioList,
            "포트폴리오"
        );

        const techStacks = toArray(
            resume.techStacks || resume.resumeTechStacks,
            "기술스택"
        );

        const resumeId = await resumeRepository.createResume(resume, conn);

        if (!resumeId) {
            throw createError("이력서 등록 후 이력서 번호를 확인할 수 없습니다.", 500);
        }

        const insertCount = {
            desiredLocations: 0,
            educations: 0,
            experiences: 0,
            careers: 0,
            certificates: 0,
            coverLetters: 0,
            coverLetterItems: 0,
            portfolioFiles: 0,
            techStacks: 0,
            githubRepositories: 0,
        };

        for (const desiredLocation of desiredLocations) {
            validateDesiredLocation(desiredLocation);

            await callRepositoryMethod(
                [
                    "createDesiredLocation",
                    "createResumeDesiredLocation",
                    "createResumeLocation",
                ],
                [desiredLocation, resumeId, conn],
                "희망지역 등록 repository 함수가 없습니다."
            );

            insertCount.desiredLocations++;
        }

        for (const education of educations) {
            validateEducation(education);

            await resumeRepository.createEducation(
                education,
                resumeId,
                conn
            );

            insertCount.educations++;
        }

        for (const experience of experiences) {
            validateExperience(experience);

            await callRepositoryMethod(
                [
                    "createExperience",
                    "createResumeExperience",
                ],
                [experience, resumeId, conn],
                "활동경험 등록 repository 함수가 없습니다."
            );

            insertCount.experiences++;
        }

        for (const career of careers) {
            validateCareer(career);

            await resumeRepository.createCareer(
                career,
                resumeId,
                conn
            );

            insertCount.careers++;
        }

        for (const certificate of certificates) {
            validateCertificate(certificate);

            await resumeRepository.createCertificate(
                certificate,
                resumeId,
                conn
            );

            insertCount.certificates++;
        }

        for (const coverLetter of coverLetters) {
            const normalizedCoverLetter = validateCoverLetter(coverLetter);

            const coverLetterId = await resumeRepository.createCoverLetter(
                resumeId,
                conn
            );

            if (!coverLetterId) {
                throw createError("자기소개서 등록 후 자기소개서 번호를 확인할 수 없습니다.", 500);
            }

            insertCount.coverLetters++;

            /*
            * 실제 자기소개서 문항 제목/본문은 COVER_LETTER_ITEM에 저장한다.
            */
            for (const item of normalizedCoverLetter.items) {
                await resumeRepository.createCoverLetterItem(
                    item,
                    coverLetterId,
                    conn
                );
                insertCount.coverLetterItems++;
            }
        }

        for (const portfolioFile of portfolioFiles) {
            validatePortfolioFile(portfolioFile);

            await resumeRepository.createPortfolio(
                portfolioFile,
                resumeId,
                conn
            );

            insertCount.portfolioFiles++;
        }

        for (const techStack of techStacks) {
            validateTechStack(techStack);

            await resumeRepository.createResumeTechStack(
                techStack,
                resumeId,
                conn
            );

            insertCount.techStacks++;
        }

        let githubResult = null;

        if (hasGithubCreateRequest(resume)) {
            const githubSession = resume.githubSession || resume.github_session;
            const githubOption = resume.github || {};

            githubResult = await saveGithubDataByResumeTransaction({
                conn,
                githubSession,
                memberId: resume.memberId,
                limitRepoCount:
                    githubOption.limitRepoCount || resume.limitRepoCount,
                commitLimitPerRepo:
                    githubOption.commitLimitPerRepo ||
                    resume.commitLimitPerRepo,
            });

            for (const githubRepository of githubResult.savedRepositories) {
                await resumeRepository.createResumeGithubRepository(
                    {
                        githubRepositoryId:
                            githubRepository.githubRepositoryId ||
                            githubRepository.github_repository_id,
                    },
                    resumeId,
                    conn
                );

                insertCount.githubRepositories++;
            }
        }

        await conn.commit();

        return {
            success: true,
            message: "이력서 전체 등록 완료",
            data: {
                resumeId,
                insertCount,
                github: githubResult,
            },
        };

    } catch (error) {
        await conn.rollback();
        throw error;

    } finally {
        await conn.close();
    }
}

/**
 * 조회 row를 이력서 상세 응답 JSON으로 변환
 */
function buildResumeDetail(rows) {
    const first = rows[0];

    const resume = {
        resumeId: first.RESUME_ID,
        memberId: first.MEMBER_ID,
        resumeTitle: first.RESUME_TITLE,
        desiredJob: first.DESIRED_JOB,
        introduction: first.INTRODUCTION,
        resumeStatus: first.RESUME_STATUS,
        representativeYn: first.REPRESENTATIVE_YN,
        createAt: first.RESUME_CREATE_AT,
        updateAt: first.RESUME_UPDATE_AT,

        member: {
            loginId: first.LOGIN_ID,
            email: first.MEMBER_EMAIL,
            nickname: first.NICKNAME,
            userType: first.USER_TYPE,
        },

        profile: first.PROFILE_ID
            ? {
                profileId: first.PROFILE_ID,
                name: first.PROFILE_NAME,
                phone: first.PHONE,
                birthDate: first.BIRTH_DATE,
                address: first.ADDRESS,
                gender: first.GENDER,
                militaryStatus: first.MILITARY_STATUS,
                profileImageUrl: first.PROFILE_IMAGE_URL,
            }
            : null,

        desiredLocations: [],
        educations: [],
        experiences: [],
        careers: [],
        certificates: [],
        coverLetters: [],
        portfolios: [],
        techStacks: [],
        githubRepositories: [],
    };

    const desiredLocationMap = new Map();
    const educationMap = new Map();
    const experienceMap = new Map();
    const careerMap = new Map();
    const certificateMap = new Map();
    const coverLetterMap = new Map();
    const portfolioMap = new Map();
    const resumeTechMap = new Map();
    const githubRepoMap = new Map();

    for (const row of rows) {
        if (
            row.DESIRED_LOCATION_ID &&
            !desiredLocationMap.has(row.DESIRED_LOCATION_ID)
        ) {
            desiredLocationMap.set(row.DESIRED_LOCATION_ID, true);

            resume.desiredLocations.push({
                desiredLocationId: row.DESIRED_LOCATION_ID,
                locationName: row.LOCATION_NAME,
            });
        }

        if (
            row.EDUCATION_ID &&
            !educationMap.has(row.EDUCATION_ID)
        ) {
            educationMap.set(row.EDUCATION_ID, true);

            resume.educations.push({
                educationId: row.EDUCATION_ID,
                schoolType: row.SCHOOL_TYPE,
                schoolName: row.SCHOOL_NAME,
                major: row.MAJOR,
                graduationStatus: row.GRADUATION_STATUS,
                gpa: row.GPA,
                startYm: row.EDUCATION_START_YM,
                endYm: row.EDUCATION_END_YM,
            });
        }

        if (
            row.EXPERIENCE_ID &&
            !experienceMap.has(row.EXPERIENCE_ID)
        ) {
            experienceMap.set(row.EXPERIENCE_ID, true);

            resume.experiences.push({
                experienceId: row.EXPERIENCE_ID,
                experienceType: row.EXPERIENCE_TYPE,
                experienceName: row.EXPERIENCE_NAME,
                startYm: row.EXPERIENCE_START_YM,
                endYm: row.EXPERIENCE_END_YM,
            });
        }

        if (
            row.CAREER_ID &&
            !careerMap.has(row.CAREER_ID)
        ) {
            careerMap.set(row.CAREER_ID, true);

            resume.careers.push({
                careerId: row.CAREER_ID,
                companyName: row.CAREER_COMPANY_NAME,
                department: row.DEPARTMENT,
                position: row.POSITION,
                startYm: row.CAREER_START_YM,
                endYm: row.CAREER_END_YM,
                mainAchievement: row.MAIN_ACHIEVEMENT,
            });
        }

        if (
            row.CERTIFICATE_ID &&
            !certificateMap.has(row.CERTIFICATE_ID)
        ) {
            certificateMap.set(row.CERTIFICATE_ID, true);

            resume.certificates.push({
                certificateId: row.CERTIFICATE_ID,
                certificateName: row.CERTIFICATE_NAME,
                acquiredYm: row.ACQUIRED_YM,
                issuer: row.ISSUER,
            });
        }

        if (row.COVER_LETTER_ID) {
            if (!coverLetterMap.has(row.COVER_LETTER_ID)) {
                const coverLetter = {
                    coverLetterId: row.COVER_LETTER_ID,
                    createAt: row.COVER_LETTER_CREATE_AT,
                    updateAt: row.COVER_LETTER_UPDATE_AT,
                    items: [],
                    itemMap: new Map(),
                };

                coverLetterMap.set(row.COVER_LETTER_ID, coverLetter);
                resume.coverLetters.push(coverLetter);
            }

            const coverLetter = coverLetterMap.get(row.COVER_LETTER_ID);

            if (
                row.COVER_LETTER_ITEM_ID &&
                !coverLetter.itemMap.has(row.COVER_LETTER_ITEM_ID)
            ) {
                coverLetter.itemMap.set(row.COVER_LETTER_ITEM_ID, true);

                coverLetter.items.push({
                    coverLetterItemId: row.COVER_LETTER_ITEM_ID,
                    questionOrder: row.QUESTION_ORDER,
                    subTitle: row.SUB_TITLE,
                    content: row.COVER_LETTER_CONTENT,
                    createAt: row.COVER_LETTER_ITEM_CREATE_AT,
                    updateAt: row.COVER_LETTER_ITEM_UPDATE_AT,
                });
            }
        }

        if (
            row.PORTFOLIO_ID &&
            !portfolioMap.has(row.PORTFOLIO_ID)
        ) {
            portfolioMap.set(row.PORTFOLIO_ID, true);

            resume.portfolios.push({
                portfolioId: row.PORTFOLIO_ID,
                originalFileName: row.ORIGINAL_FILE_NAME,
                storedFileName: row.STORED_FILE_NAME,
                fileExtension: row.FILE_EXTENSION,
                filePath: row.FILE_PATH,
                fileSize: row.FILE_SIZE,
                uploadAt: row.UPLOAD_AT,
                fileStatus: row.FILE_STATUS,
            });
        }

        if (
            row.RESUME_TECH_ID &&
            !resumeTechMap.has(row.RESUME_TECH_ID)
        ) {
            resumeTechMap.set(row.RESUME_TECH_ID, true);

            resume.techStacks.push({
                resumeTechId: row.RESUME_TECH_ID,
                techCategoryCode: row.RESUME_TECH_CATEGORY_CODE,
                techCategoryName: row.RESUME_TECH_CATEGORY_NAME,
                techName: row.RESUME_TECH_NAME,
                createAt: row.RESUME_TECH_CREATE_AT,
            });
        }

        if (row.GITHUB_REPOSITORY_ID) {
            if (!githubRepoMap.has(row.GITHUB_REPOSITORY_ID)) {
                const githubRepository = {
                    resumeGithubRepoId: row.RESUME_GITHUB_REPO_ID,
                    githubRepositoryId: row.GITHUB_REPOSITORY_ID,
                    githubRepoExternalId: row.GITHUB_REPO_EXTERNAL_ID,
                    name: row.GITHUB_REPO_NAME,
                    fullName: row.GITHUB_FULL_NAME,
                    htmlUrl: row.GITHUB_HTML_URL,
                    description: row.GITHUB_DESCRIPTION,
                    fork: row.GITHUB_FORK,
                    archived: row.GITHUB_ARCHIVED,
                    defaultBranch: row.DEFAULT_BRANCH,
                    githubCreatedAt: row.GITHUB_CREATED_AT,
                    githubUpdatedAt: row.GITHUB_UPDATED_AT,
                    pushedAt: row.GITHUB_PUSHED_AT,
                    lastSyncAt: row.GITHUB_LAST_SYNC_AT,
                    displayOrder: row.DISPLAY_ORDER,
                    projectDescription: row.PROJECT_DESCRIPTION,
                    createdDate: row.RESUME_GITHUB_CREATED_DATE,
                    techStacks: [],
                    commitDaily: [],
                    techStackMap: new Map(),
                    commitDailyMap: new Map(),
                };

                githubRepoMap.set(
                    row.GITHUB_REPOSITORY_ID,
                    githubRepository
                );

                resume.githubRepositories.push(githubRepository);
            }

            const githubRepository = githubRepoMap.get(
                row.GITHUB_REPOSITORY_ID
            );

            if (
                row.GITHUB_REPO_TECH_ID &&
                !githubRepository.techStackMap.has(row.GITHUB_REPO_TECH_ID)
            ) {
                githubRepository.techStackMap.set(
                    row.GITHUB_REPO_TECH_ID,
                    true
                );

                githubRepository.techStacks.push({
                    githubRepoTechId: row.GITHUB_REPO_TECH_ID,
                    techCategoryCode: row.GITHUB_TECH_CATEGORY_CODE,
                    techCategoryName: row.GITHUB_TECH_CATEGORY_NAME,
                    techName: row.GITHUB_TECH_NAME,
                    languageName: row.LANGUAGE_NAME,
                    usageRatio: row.USAGE_RATIO,
                    collectedAt: row.GITHUB_TECH_COLLECTED_AT,
                });
            }

            if (
                row.GITHUB_REPO_COMMIT_DAILY_ID &&
                !githubRepository.commitDailyMap.has(
                    row.GITHUB_REPO_COMMIT_DAILY_ID
                )
            ) {
                githubRepository.commitDailyMap.set(
                    row.GITHUB_REPO_COMMIT_DAILY_ID,
                    true
                );

                githubRepository.commitDaily.push({
                    githubRepoCommitDailyId:
                        row.GITHUB_REPO_COMMIT_DAILY_ID,
                    commitDate: row.COMMIT_DATE,
                    commitCount: row.COMMIT_COUNT,
                    collectedAt: row.COMMIT_COLLECTED_AT,
                });
            }
        }
    }

    for (const coverLetter of resume.coverLetters) {
        delete coverLetter.itemMap;
    }

    for (const githubRepository of resume.githubRepositories) {
        delete githubRepository.techStackMap;
        delete githubRepository.commitDailyMap;
    }

    return resume;
}

/**
 * 특정 이력서 전체 상세 조회
 */
async function getResumeDetail(resumeIdValue) {
    const resumeId = parseResumeId(resumeIdValue);
    const conn = await getConnection();

    try {
        const rows = await resumeRepository.getResumeDetail(
            resumeId,
            conn
        );

        if (!rows || rows.length === 0) {
            throw createError("이력서를 찾을 수 없습니다.", 404);
        }

        const resume = buildResumeDetail(rows);

        return {
            success: true,
            message: "이력서 상세 조회 성공",
            data: resume,
        };

    } finally {
        await conn.close();
    }
}

module.exports = {
    createResume,
    getResumeDetail,
};