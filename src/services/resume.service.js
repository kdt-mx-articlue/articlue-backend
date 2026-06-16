const { getConnection } = require("../config/db");

const resumeRepository = require("../repositories/resume.repository");
const githubRepository = require("../repositories/github.repository");

const { createError } = require("../utils/error.util");

const resumeAnalyzeService = require("./resumeAnalyze.service");

/* =========================================================
   상수
   ========================================================= */

const MAX_RECOMMENDATION_LIMIT = 20;

/* =========================================================
   공통 유틸
   ========================================================= */

function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
}

function pick(target, fieldNames, defaultValue = null) {
    if (!target) {
        return defaultValue;
    }

    for (const fieldName of fieldNames) {
        if (!isBlank(target[fieldName])) {
            return target[fieldName];
        }
    }

    return defaultValue;
}

function pickRaw(target, fieldNames) {
    if (!target) {
        return undefined;
    }

    for (const fieldName of fieldNames) {
        if (target[fieldName] !== undefined && target[fieldName] !== null) {
            return target[fieldName];
        }
    }

    return undefined;
}

function requireNotBlank(value, message) {
    if (isBlank(value)) {
        throw createError(message, 400);
    }

    return value;
}

function parsePositiveInt(value, message) {
    const numberValue = Number(value);

    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw createError(message, 400);
    }

    return numberValue;
}

function parseOptionalPositiveInt(value, defaultValue = null) {
    if (isBlank(value)) {
        return defaultValue;
    }

    const numberValue = Number(value);

    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        return defaultValue;
    }

    return numberValue;
}

function parseResumeId(value) {
    return parsePositiveInt(value, "이력서 번호가 올바르지 않습니다.");
}

function normalizeAnalysisStage(value) {
    const analysisStage = String(value || "RESUME").toUpperCase();

    if (!["RESUME", "FINAL"].includes(analysisStage)) {
        throw createError("분석 단계는 RESUME 또는 FINAL만 가능합니다.", 400);
    }

    return analysisStage;
}

function parseRecommendationLimit(value) {
    if (isBlank(value)) {
        return Number(process.env.AI_RECOMMENDATION_LIMIT) || MAX_RECOMMENDATION_LIMIT;
    }

    const limit = Number(value);

    if (!Number.isInteger(limit) || limit <= 0) {
        throw createError("추천 결과 개수가 올바르지 않습니다.", 400);
    }

    if (limit > MAX_RECOMMENDATION_LIMIT) {
        throw createError("추천 결과는 최대 20개까지 요청할 수 있습니다.", 400);
    }

    return limit;
}

function readArraySection(target, fieldNames, sectionName, required = false) {
    const value = pickRaw(target, fieldNames);

    if (value === undefined || value === null) {
        if (required) {
            throw createError(`${sectionName}은 최소 1개 이상 입력해야 합니다.`, 400);
        }

        return [];
    }

    if (!Array.isArray(value)) {
        throw createError(`${sectionName}은 배열 형식이어야 합니다.`, 400);
    }

    if (required && value.length === 0) {
        throw createError(`${sectionName}은 최소 1개 이상 입력해야 합니다.`, 400);
    }

    return value;
}

/* =========================================================
   이력서 요청 정규화
   ========================================================= */

function normalizeResumeBase(resume) {
    if (!resume) {
        throw createError("이력서 데이터가 없습니다.", 400);
    }

    return {
        memberId: parsePositiveInt(
            pick(resume, ["memberId", "member_id"]),
            "회원번호가 올바르지 않습니다."
        ),
        resumeTitle: requireNotBlank(
            pick(resume, ["resumeTitle", "resume_title"]),
            "이력서 제목을 입력하세요."
        ),
        desiredJob: requireNotBlank(
            pick(resume, ["desiredJob", "desired_job"]),
            "희망 직무를 입력하세요."
        ),
        introduction: requireNotBlank(
            pick(resume, ["introduction"]),
            "한줄 소개를 입력하세요."
        ),
    };
}

function normalizeDesiredLocation(item) {
    return {
        locationName: requireNotBlank(
            pick(item, ["locationName", "location", "desiredLocationName"]),
            "희망지역을 입력하세요."
        ),
    };
}

function normalizeEducation(item) {
    return {
        schoolType: requireNotBlank(
            pick(item, ["schoolType", "school_type"]),
            "학교구분을 입력하세요."
        ),
        schoolName: requireNotBlank(
            pick(item, ["schoolName", "school_name", "institutionName", "educationName"]),
            "학교명 또는 교육기관명을 입력하세요."
        ),
        major: pick(item, ["major"]),
        graduationStatus: pick(item, ["graduationStatus", "graduation_status"]),
        gpa: pick(item, ["gpa"]),
        startYm: pick(item, ["startYm", "start_ym"]),
        endYm: pick(item, ["endYm", "end_ym"]),
    };
}

function normalizeExperience(item) {
    return {
        experienceType: requireNotBlank(
            pick(item, ["experienceType", "experience_type"]),
            "경험 유형을 입력하세요."
        ),
        experienceName: requireNotBlank(
            pick(item, ["experienceName", "experience_name", "projectName", "activityName", "name"]),
            "활동경험명 또는 프로젝트명을 입력하세요."
        ),
        startYm: pick(item, ["startYm", "start_ym"]),
        endYm: pick(item, ["endYm", "end_ym"]),
    };
}

function normalizeCareer(item) {
    return {
        companyName: requireNotBlank(
            pick(item, ["companyName", "company_name", "organizationName"]),
            "회사명 또는 기관명을 입력하세요."
        ),
        department: pick(item, ["department"]),
        position: pick(item, ["position"]),
        startYm: pick(item, ["startYm", "start_ym"]),
        endYm: pick(item, ["endYm", "end_ym"]),
        mainAchievement: pick(item, ["mainAchievement", "main_achievement"]),
    };
}

function normalizeCertificate(item) {
    return {
        certificateName: requireNotBlank(
            pick(item, ["certificateName", "certificate_name", "licenseName", "name"]),
            "자격증명을 입력하세요."
        ),
        acquiredYm: pick(item, ["acquiredYm", "acquired_ym"]),
        issuer: pick(item, ["issuer"]),
    };
}

function normalizeCoverLetterItem(item, index) {
    return {
        questionOrder: parseOptionalPositiveInt(
            pick(item, ["questionOrder", "question_order"]),
            index + 1
        ),
        subTitle: requireNotBlank(
            pick(item, ["subTitle", "sub_title", "coverLetterTitle", "questionTitle", "title"]),
            "자소서 초안 제목 또는 문항을 입력하세요."
        ),
        content: requireNotBlank(
            pick(item, ["content", "coverLetterContent", "answerContent"]),
            "자소서 초안 내용을 입력하세요."
        ),
    };
}

function normalizeCoverLetter(item) {
    const items = readArraySection(
        item,
        ["items", "coverLetterItems", "coverLetterItemList", "itemList"],
        "자소서 초안 문항",
        true
    );

    return {
        items: items.map((coverLetterItem, index) =>
            normalizeCoverLetterItem(coverLetterItem, index)
        ),
    };
}

function normalizePortfolioFile(item) {
    const originalFileName = pick(
        item,
        ["originalFileName", "original_file_name", "fileName", "name"]
    );

    const portfolioUrl = pick(item, ["portfolioUrl", "fileUrl", "url"]);

    if (isBlank(originalFileName) && isBlank(portfolioUrl)) {
        throw createError("포트폴리오 파일명 또는 URL을 입력하세요.", 400);
    }

    return {
        originalFileName: originalFileName || "portfolio",
        storedFileName: pick(
            item,
            ["storedFileName", "stored_file_name"],
            originalFileName || "portfolio"
        ),
        fileExtension: pick(
            item,
            ["fileExtension", "file_extension"],
            "pdf"
        ),
        filePath: pick(
            item,
            ["filePath", "file_path", "portfolioUrl", "fileUrl", "url"],
            "/portfolio"
        ),
        fileSize: Number(pick(item, ["fileSize", "file_size"], 0)) || 0,
        fileStatus: pick(item, ["fileStatus", "file_status"], "ACTIVE"),
    };
}

function normalizeTechStack(item) {
    return {
        techCategoryCode: requireNotBlank(
            pick(item, ["techCategoryCode", "tech_category_code"]),
            "기술스택 정보를 입력하세요."
        ),
    };
}

/* =========================================================
   GitHub 요청 정규화
   ========================================================= */

function normalizeSelectedGithubRepository(item, index) {
    return {
        githubRepositoryId: parsePositiveInt(
            pick(item, ["githubRepositoryId", "github_repository_id"]),
            "GitHub 저장소 ID가 올바르지 않습니다."
        ),
        displayOrder: parseOptionalPositiveInt(
            pick(item, ["displayOrder", "display_order"]),
            index + 1
        ),
        projectDescription: pick(
            item,
            ["projectDescription", "project_description"]
        ),
    };
}

function normalizeSelectedGithubRepositories(source) {
    const selectedObjects = readArraySection(
        source,
        [
            "githubRepositories",
            "githubRepositoryList",
            "resumeGithubRepositories",
            "resumeGithubRepositoryList",
            "repositories",
            "selectedRepositories",
            "selected_repositories",
        ],
        "GitHub 저장소",
        false
    );

    const selectedIds = readArraySection(
        source,
        [
            "githubRepositoryIds",
            "github_repository_ids",
            "repositoryIds",
            "repository_ids",
            "selectedRepositoryIds",
            "selected_repository_ids",
        ],
        "GitHub 저장소 ID",
        false
    );

    const repositories = [];

    selectedObjects.forEach((item, index) => {
        repositories.push(normalizeSelectedGithubRepository(item, index));
    });

    const baseOrder = repositories.length;

    selectedIds.forEach((githubRepositoryId, index) => {
        repositories.push({
            githubRepositoryId: parsePositiveInt(
                githubRepositoryId,
                "GitHub 저장소 ID가 올바르지 않습니다."
            ),
            displayOrder: baseOrder + index + 1,
            projectDescription: null,
        });
    });

    return repositories;
}

/**
 * 이력서 생성 시점의 GitHub 연결 방식 정규화
 *
 * GitHub API를 다시 호출하지 않는다.
 *
 * 기본값:
 * - 프론트가 아무 GitHub 값을 안 보내면 RECENT
 * - RECENT는 이미 저장된 GitHub 저장소 중 최근 커밋 기준 3개
 */
function normalizeGithubSection(resume) {
    const githubOption = pickRaw(resume, ["github"]) || {};

    const rootSelectedRepositories = normalizeSelectedGithubRepositories(resume);
    const optionSelectedRepositories = normalizeSelectedGithubRepositories(githubOption);

    const selectedRepositories = [
        ...rootSelectedRepositories,
        ...optionSelectedRepositories,
    ];

    const rawScope = pick(
        githubOption,
        ["repositoryScope", "repository_scope", "mode", "scope"],
        pick(
            resume,
            ["repositoryScope", "repository_scope", "githubRepositoryScope", "github_repository_scope"],
            null
        )
    );

    let repositoryScope = isBlank(rawScope)
        ? selectedRepositories.length > 0
            ? "SELECTED"
            : "RECENT"
        : String(rawScope).toUpperCase();

    if (["TOP", "TOP3", "RECENT_COMMIT", "RECENT_COMMITS"].includes(repositoryScope)) {
        repositoryScope = "RECENT";
    }

    if (!["SELECTED", "RECENT", "ALL"].includes(repositoryScope)) {
        throw createError(
            "GitHub 저장소 선택 방식은 SELECTED, RECENT, ALL 중 하나여야 합니다.",
            400
        );
    }

    if (repositoryScope === "SELECTED" && selectedRepositories.length === 0) {
        throw createError(
            "SELECTED 방식에서는 이력서에 연결할 GitHub 저장소를 선택해야 합니다.",
            400
        );
    }

    return {
        repositoryScope,
        selectedRepositories,
    };
}

function normalizeResumeRequest(resume) {
    return {
        base: normalizeResumeBase(resume),

        github: normalizeGithubSection(resume),

        desiredLocations: readArraySection(
            resume,
            ["desiredLocations", "desiredLocationList", "locations", "resumeDesiredLocations"],
            "희망지역",
            false
        ).map(normalizeDesiredLocation),

        educations: readArraySection(
            resume,
            ["educations", "educationList"],
            "학력사항",
            true
        ).map(normalizeEducation),

        experiences: readArraySection(
            resume,
            ["experiences", "experienceList"],
            "경험",
            true
        ).map(normalizeExperience),

        careers: readArraySection(
            resume,
            ["careers", "careerList"],
            "경력사항",
            false
        ).map(normalizeCareer),

        certificates: readArraySection(
            resume,
            ["certificates", "certificateList"],
            "자격증",
            false
        ).map(normalizeCertificate),

        coverLetters: readArraySection(
            resume,
            ["coverLetters", "coverLetterList"],
            "자소서 초안",
            true
        ).map(normalizeCoverLetter),

        portfolioFiles: readArraySection(
            resume,
            ["portfolioFiles", "portfolios", "portfolioList"],
            "포트폴리오 문서",
            false
        ).map(normalizePortfolioFile),

        techStacks: readArraySection(
            resume,
            ["techStacks", "resumeTechStacks"],
            "기술스택",
            true
        ).map(normalizeTechStack),
    };
}

/* =========================================================
   GitHub 저장소 연결
   ========================================================= */

async function linkResumeGithubRepository({
    conn,
    resumeId,
    repository,
    linkedGithubRepositoryIds,
}) {
    const githubRepositoryId = Number(
        repository.githubRepositoryId ||
        repository.github_repository_id
    );

    if (!Number.isInteger(githubRepositoryId) || githubRepositoryId <= 0) {
        return false;
    }

    if (linkedGithubRepositoryIds.has(githubRepositoryId)) {
        return false;
    }

    await githubRepository.createResumeGithubRepository(
        conn,
        {
            resume_id: resumeId,
            github_repository_id: githubRepositoryId,
            display_order:
                repository.displayOrder ||
                repository.display_order ||
                linkedGithubRepositoryIds.size + 1,
            project_description:
                repository.projectDescription ||
                repository.project_description ||
                repository.description ||
                null,
        }
    );

    linkedGithubRepositoryIds.add(githubRepositoryId);

    return true;
}

async function findStoredGithubRepositoriesForResume({
    conn,
    memberId,
    github,
}) {
    if (github.selectedRepositories.length > 0) {
        return github.selectedRepositories;
    }

    let repositories = [];

    if (github.repositoryScope === "ALL") {
        repositories = await githubRepository.findAllRepositories(
            memberId,
            conn
        );
    } else {
        repositories = await githubRepository.findTopRepositories(
            memberId,
            conn
        );
    }

    if (!repositories || repositories.length === 0) {
        throw createError(
            "연동된 GitHub 저장소가 없습니다. 먼저 GitHub 연동을 완료해주세요.",
            400
        );
    }

    return repositories.map((repository, index) => ({
        ...repository,
        displayOrder: index + 1,
        projectDescription: repository.description || null,
    }));
}

async function linkStoredGithubRepositoriesToResume({
    conn,
    resumeId,
    memberId,
    github,
}) {
    const repositories = await findStoredGithubRepositoriesForResume({
        conn,
        memberId,
        github,
    });

    const linkedGithubRepositoryIds = new Set();

    const result = {
        repositoryScope: github.repositoryScope,
        requestedRepositoryCount: repositories.length,
        linkedRepositoryCount: 0,
        repositories: [],
    };

    for (const repository of repositories) {
        const linked = await linkResumeGithubRepository({
            conn,
            resumeId,
            repository,
            linkedGithubRepositoryIds,
        });

        if (linked) {
            result.linkedRepositoryCount++;

            result.repositories.push({
                githubRepositoryId:
                    repository.githubRepositoryId ||
                    repository.github_repository_id,
                name: repository.name || null,
                fullName: repository.fullName || repository.full_name || null,
                displayOrder:
                    repository.displayOrder ||
                    repository.display_order ||
                    result.linkedRepositoryCount,
            });
        }
    }

    if (result.linkedRepositoryCount === 0) {
        throw createError(
            "이력서에 연결된 GitHub 저장소가 없습니다.",
            400
        );
    }

    return result;
}

/* =========================================================
   이력서 저장
   ========================================================= */

async function createResume(resume) {
    const normalized = normalizeResumeRequest(resume);
    const conn = await getConnection();

    try {
        const resumeId = await resumeRepository.createResume(
            normalized.base,
            conn
        );

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

        for (const item of normalized.desiredLocations) {
            await resumeRepository.createDesiredLocation(item, resumeId, conn);
            insertCount.desiredLocations++;
        }

        for (const item of normalized.educations) {
            await resumeRepository.createEducation(item, resumeId, conn);
            insertCount.educations++;
        }

        for (const item of normalized.experiences) {
            await resumeRepository.createExperience(item, resumeId, conn);
            insertCount.experiences++;
        }

        for (const item of normalized.careers) {
            await resumeRepository.createCareer(item, resumeId, conn);
            insertCount.careers++;
        }

        for (const item of normalized.certificates) {
            await resumeRepository.createCertificate(item, resumeId, conn);
            insertCount.certificates++;
        }

        for (const coverLetter of normalized.coverLetters) {
            const coverLetterId = await resumeRepository.createCoverLetter(
                resumeId,
                conn
            );

            if (!coverLetterId) {
                throw createError(
                    "자기소개서 등록 후 자기소개서 번호를 확인할 수 없습니다.",
                    500
                );
            }

            insertCount.coverLetters++;

            for (const item of coverLetter.items) {
                await resumeRepository.createCoverLetterItem(
                    item,
                    coverLetterId,
                    conn
                );

                insertCount.coverLetterItems++;
            }
        }

        for (const item of normalized.portfolioFiles) {
            await resumeRepository.createPortfolio(item, resumeId, conn);
            insertCount.portfolioFiles++;
        }

        for (const item of normalized.techStacks) {
            await resumeRepository.createResumeTechStack(item, resumeId, conn);
            insertCount.techStacks++;
        }

        /*
         * GitHub 연결
         *
         * 중요:
         * - 여기서는 GitHub API를 호출하지 않는다.
         * - GitHub 연동 시점에 이미 저장된 GITHUB_REPOSITORY를 조회한다.
         * - 기본값은 최근 커밋 기준 3개다.
         */
        const githubResult = await linkStoredGithubRepositoriesToResume({
            conn,
            resumeId,
            memberId: normalized.base.memberId,
            github: normalized.github,
        });

        insertCount.githubRepositories = githubResult.linkedRepositoryCount;

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

/* =========================================================
   이력서 저장 + AI 기업 추천 분석
   ========================================================= */

function assertResumeDetailHasGithub(resumeDetail) {
    if (
        !resumeDetail ||
        !Array.isArray(resumeDetail.githubRepositories) ||
        resumeDetail.githubRepositories.length === 0
    ) {
        throw createError(
            "AI 분석에 사용할 GitHub 저장소 정보가 없습니다. 이력서에 GitHub 저장소를 연결해주세요.",
            400
        );
    }
}

async function createResumeAndAnalyze(resume) {
    const analysisStage = normalizeAnalysisStage(
        pick(resume, ["analysisStage", "analysis_stage"], "RESUME")
    );

    const recommendationLimit = parseRecommendationLimit(
        pick(resume, [
            "recommendationLimit",
            "recommendation_limit",
            "topN",
            "top_n",
            "limit",
        ])
    );

    const createResult = await createResume(resume);
    const resumeId = createResult.data.resumeId;

    const resumeDetailResult = await getResumeDetail(resumeId);

    assertResumeDetailHasGithub(resumeDetailResult.data);

    const analysisResult = await resumeAnalyzeService.analyzeAndSave({
        resumeId,
        analysisStage,
        recommendationLimit,
        resumeDetail: resumeDetailResult.data,
    });

    return {
        success: true,
        message: "이력서 저장 및 AI 기업 추천 분석 완료",
        data: {
            resumeId,
            insertCount: createResult.data.insertCount,
            github: createResult.data.github,
            analysisStatus: "COMPLETED",
            analysis: analysisResult.data,
        },
    };
}

async function analyzeSavedResume({
    resumeId,
    analysisStage = "RESUME",
    recommendationLimit,
}) {
    const parsedResumeId = parseResumeId(resumeId);
    const normalizedStage = normalizeAnalysisStage(analysisStage);
    const parsedRecommendationLimit = parseRecommendationLimit(recommendationLimit);

    const resumeDetailResult = await getResumeDetail(parsedResumeId);

    assertResumeDetailHasGithub(resumeDetailResult.data);

    return await resumeAnalyzeService.analyzeAndSave({
        resumeId: parsedResumeId,
        analysisStage: normalizedStage,
        recommendationLimit: parsedRecommendationLimit,
        resumeDetail: resumeDetailResult.data,
    });
}

/* =========================================================
   상세 조회
   ========================================================= */

function pushUnique(map, key, list, buildItem) {
    if (isBlank(key)) {
        return null;
    }

    if (!map.has(key)) {
        const item = buildItem();
        map.set(key, item);
        list.push(item);
    }

    return map.get(key);
}

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

    const maps = {
        desiredLocations: new Map(),
        educations: new Map(),
        experiences: new Map(),
        careers: new Map(),
        certificates: new Map(),
        coverLetters: new Map(),
        portfolios: new Map(),
        techStacks: new Map(),
        githubRepositories: new Map(),
    };

    for (const row of rows) {
        pushUnique(
            maps.desiredLocations,
            row.DESIRED_LOCATION_ID,
            resume.desiredLocations,
            () => ({
                desiredLocationId: row.DESIRED_LOCATION_ID,
                locationName: row.LOCATION_NAME,
            })
        );

        pushUnique(
            maps.educations,
            row.EDUCATION_ID,
            resume.educations,
            () => ({
                educationId: row.EDUCATION_ID,
                schoolType: row.SCHOOL_TYPE,
                schoolName: row.SCHOOL_NAME,
                major: row.MAJOR,
                graduationStatus: row.GRADUATION_STATUS,
                gpa: row.GPA,
                startYm: row.EDUCATION_START_YM,
                endYm: row.EDUCATION_END_YM,
            })
        );

        pushUnique(
            maps.experiences,
            row.EXPERIENCE_ID,
            resume.experiences,
            () => ({
                experienceId: row.EXPERIENCE_ID,
                experienceType: row.EXPERIENCE_TYPE,
                experienceName: row.EXPERIENCE_NAME,
                startYm: row.EXPERIENCE_START_YM,
                endYm: row.EXPERIENCE_END_YM,
            })
        );

        pushUnique(
            maps.careers,
            row.CAREER_ID,
            resume.careers,
            () => ({
                careerId: row.CAREER_ID,
                companyName: row.CAREER_COMPANY_NAME,
                department: row.DEPARTMENT,
                position: row.POSITION,
                startYm: row.CAREER_START_YM,
                endYm: row.CAREER_END_YM,
                mainAchievement: row.MAIN_ACHIEVEMENT,
            })
        );

        pushUnique(
            maps.certificates,
            row.CERTIFICATE_ID,
            resume.certificates,
            () => ({
                certificateId: row.CERTIFICATE_ID,
                certificateName: row.CERTIFICATE_NAME,
                acquiredYm: row.ACQUIRED_YM,
                issuer: row.ISSUER,
            })
        );

        const coverLetter = pushUnique(
            maps.coverLetters,
            row.COVER_LETTER_ID,
            resume.coverLetters,
            () => ({
                coverLetterId: row.COVER_LETTER_ID,
                createAt: row.COVER_LETTER_CREATE_AT,
                updateAt: row.COVER_LETTER_UPDATE_AT,
                items: [],
                itemMap: new Map(),
            })
        );

        if (
            coverLetter &&
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

        pushUnique(
            maps.portfolios,
            row.PORTFOLIO_ID,
            resume.portfolios,
            () => ({
                portfolioId: row.PORTFOLIO_ID,
                originalFileName: row.ORIGINAL_FILE_NAME,
                storedFileName: row.STORED_FILE_NAME,
                fileExtension: row.FILE_EXTENSION,
                filePath: row.FILE_PATH,
                fileSize: row.FILE_SIZE,
                uploadAt: row.UPLOAD_AT,
                fileStatus: row.FILE_STATUS,
            })
        );

        pushUnique(
            maps.techStacks,
            row.RESUME_TECH_ID,
            resume.techStacks,
            () => ({
                resumeTechId: row.RESUME_TECH_ID,
                techCategoryCode: row.RESUME_TECH_CATEGORY_CODE,
                techCategoryName: row.RESUME_TECH_CATEGORY_NAME,
                techName: row.RESUME_TECH_NAME,
                createAt: row.RESUME_TECH_CREATE_AT,
            })
        );

        const githubRepo = pushUnique(
            maps.githubRepositories,
            row.GITHUB_REPOSITORY_ID,
            resume.githubRepositories,
            () => ({
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
            })
        );

        if (
            githubRepo &&
            row.GITHUB_REPO_TECH_ID &&
            !githubRepo.techStackMap.has(row.GITHUB_REPO_TECH_ID)
        ) {
            githubRepo.techStackMap.set(row.GITHUB_REPO_TECH_ID, true);

            githubRepo.techStacks.push({
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
            githubRepo &&
            row.GITHUB_REPO_COMMIT_DAILY_ID &&
            !githubRepo.commitDailyMap.has(row.GITHUB_REPO_COMMIT_DAILY_ID)
        ) {
            githubRepo.commitDailyMap.set(
                row.GITHUB_REPO_COMMIT_DAILY_ID,
                true
            );

            githubRepo.commitDaily.push({
                githubRepoCommitDailyId: row.GITHUB_REPO_COMMIT_DAILY_ID,
                commitDate: row.COMMIT_DATE,
                commitCount: row.COMMIT_COUNT,
                collectedAt: row.COMMIT_COLLECTED_AT,
            });
        }
    }

    for (const coverLetter of resume.coverLetters) {
        delete coverLetter.itemMap;
    }

    for (const repository of resume.githubRepositories) {
        delete repository.techStackMap;
        delete repository.commitDailyMap;
    }

    return resume;
}

async function getResumeDetail(resumeIdValue) {
    const resumeId = parseResumeId(resumeIdValue);
    const conn = await getConnection();

    try {
        const rows = await resumeRepository.getResumeDetail(resumeId, conn);

        if (!rows || rows.length === 0) {
            throw createError("이력서를 찾을 수 없습니다.", 404);
        }

        return {
            success: true,
            message: "이력서 상세 조회 성공",
            data: buildResumeDetail(rows),
        };

    } finally {
        await conn.close();
    }
}

module.exports = {
    createResume,
    createResumeAndAnalyze,
    analyzeSavedResume,
    getResumeDetail,
};