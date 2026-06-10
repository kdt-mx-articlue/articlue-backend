const { getConnection } = require("../config/db");
const resumeRepository = require("../repositories/resume.repository");
const { createError } = require("../utils/error.util");

const {
    saveGithubDataByResumeTransaction,
} = require("./github.service");

/**
 * 빈 값 검사
 */
function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
}

/**
 * 배열 변환 및 검증
 */
function toArray(value, fieldName) {
    if (value === undefined || value === null) {
        return [];
    }

    if (!Array.isArray(value)) {
        throw createError(`${fieldName}은 배열 형식이어야 합니다.`, 400);
    }

    return value;
}

/**
 * 필수값 검사
 */
function requireValue(target, fieldName, message) {
    if (!target || isBlank(target[fieldName])) {
        throw createError(message, 400);
    }
}

/**
 * 여러 필드 중 하나 이상 필수 검사
 */
function requireAtLeastOne(target, fieldNames, message) {
    if (!target) {
        throw createError(message, 400);
    }

    const hasValue = fieldNames.some((fieldName) => !isBlank(target[fieldName]));

    if (!hasValue) {
        throw createError(message, 400);
    }
}

/**
 * 여러 필드 중 첫 번째 유효값 반환
 */
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

            await resumeRepository.createCoverLetter(
                normalizedCoverLetter,
                resumeId,
                conn
            );

            insertCount.coverLetters++;
        }

        for (const portfolioFile of portfolioFiles) {
            validatePortfolioFile(portfolioFile);

            await resumeRepository.createPortfolioFile(
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

module.exports = {
    createResume,
};