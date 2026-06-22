const { getConnection } = require("../config/db");
const { createError } = require("../utils/error.util");
const {
    SOCIAL_PROVIDER,
    githubAuthApi,
    createGithubApiBySession,
} = require("../config/socialApi.config");

const {
    createSocialSession,
    createLoginSession,
    deleteSocialSession,
} = require("../store/socialSessionStore");

const githubRepository = require("../repositories/github.repository");

const DEFAULT_SCOPE = "read:user user:email repo";
const DEFAULT_COMMIT_LIMIT_PER_REPO = 30;
const DISPLAY_REPOSITORY_LIMIT = 3;

function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
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

function parseRequiredPositiveInt(value, message) {
    const numberValue = Number(value);

    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw createError(message, 400);
    }

    return numberValue;
}

function parseFullName(fullName) {
    if (!fullName || !fullName.includes("/")) {
        return null;
    }

    const [owner, repoName] = fullName.split("/");

    return {
        owner,
        repoName,
    };
}

function groupCommitsByDate(commits) {
    const map = new Map();

    for (const commit of commits) {
        const dateText = commit.commit?.author?.date;

        if (!dateText) {
            continue;
        }

        const commitDate = dateText.substring(0, 10);
        const count = map.get(commitDate) || 0;

        map.set(commitDate, count + 1);
    }

    return Array.from(map.entries()).map(([commitDate, commitCount]) => ({
        commit_date: commitDate,
        commit_count: commitCount,
    }));
}

function calculateLanguageRatio(languages) {
    const totalBytes = Object.values(languages).reduce(
        (sum, byteSize) => sum + Number(byteSize || 0),
        0
    );

    return Object.entries(languages).map(([languageName, byteSize]) => ({
        language_name: languageName,
        byte_size: byteSize,
        usage_ratio:
            totalBytes === 0
                ? 0
                : Number(((Number(byteSize) / totalBytes) * 100).toFixed(2)),
    }));
}

function buildGithubAccountRow({ memberId, githubUser, githubSession }) {
    return {
        member_id: Number(memberId),
        id: githubUser.id,
        login: githubUser.login,
        html_url: githubUser.html_url,
        access_token:
            githubSession.accessToken ||
            githubSession.access_token ||
            null,
        refresh_token:
            githubSession.refreshToken ||
            githubSession.refresh_token ||
            null,
        expires_at:
            githubSession.expiresAt ||
            githubSession.expires_at ||
            null,
    };
}

function isEmptyRepositoryError(error) {
    const status = Number(error.response?.status || error.status);
    const message = String(
        error.response?.data?.message ||
        error.message ||
        ""
    );

    return status === 409 && message.includes("Git Repository is empty");
}

async function getRepositoryCommitsSafely({
    githubApi,
    owner,
    repoName,
    commitLimit,
    repo,
}) {
    try {
        return await githubApi.getRepositoryCommits(
            owner,
            repoName,
            {},
            commitLimit
        );
    } catch (error) {
        if (isEmptyRepositoryError(error)) {
            console.warn("[GITHUB EMPTY REPOSITORY SKIPPED]", {
                repositoryName: repo?.name,
                fullName: repo?.full_name,
                owner,
                repoName,
                status: error.response?.status || error.status,
                message: error.response?.data?.message || error.message,
            });

            return [];
        }

        throw error;
    }
}

async function login(scope = DEFAULT_SCOPE) {
    const data = await githubAuthApi.requestDeviceCode({ scope });

    return {
        message: "GitHub 인증 코드를 발급했습니다.",
        data: {
            deviceCode: data.device_code,
            device_code: data.device_code,
            userCode: data.user_code,
            user_code: data.user_code,
            verificationUri: data.verification_uri,
            verification_uri: data.verification_uri,
            expiresIn: data.expires_in,
            expires_in: data.expires_in,
            interval: data.interval,
        },
    };
}

async function issueToken(deviceCode) {
    if (!deviceCode) {
        throw createError("deviceCode 또는 device_code가 필요합니다.", 400);
    }

    const data = await githubAuthApi.requestAccessToken({ deviceCode });

    if (data.error === "authorization_pending") {
        return {
            authenticated: false,
            message: "아직 GitHub 인증이 완료되지 않았습니다.",
            data: {
                errorCode: data.error,
                errorDescription: data.error_description,
            },
        };
    }

    if (data.error === "slow_down") {
        return {
            authenticated: false,
            message: "요청 간격이 너무 짧습니다. 잠시 후 다시 요청하세요.",
            data: {
                errorCode: data.error,
                errorDescription: data.error_description,
                interval: data.interval,
            },
        };
    }

    if (data.error) {
        throw createError(
            data.error_description || "GitHub 토큰 발급 중 오류가 발생했습니다.",
            400
        );
    }

    const githubSessionForApi = {
        provider: SOCIAL_PROVIDER.GITHUB,
        accessToken: data.access_token,
        access_token: data.access_token,
        tokenType: data.token_type,
        token_type: data.token_type,
        scope: data.scope,
    };

    const githubApi = createGithubApiBySession(githubSessionForApi);
    const githubUser = await githubApi.getUser();

    const socialSessionId = createSocialSession({
        provider: SOCIAL_PROVIDER.GITHUB,
        accessToken: data.access_token,
        access_token: data.access_token,
        tokenType: data.token_type,
        token_type: data.token_type,
        socialUser: githubUser,
        scope: data.scope,
    });

    return {
        authenticated: true,
        message: "GitHub 인증 성공",
        data: {
            provider: SOCIAL_PROVIDER.GITHUB,
            githubSessionId: socialSessionId,
            github_session_id: socialSessionId,
            socialSessionId,
            social_session_id: socialSessionId,
            scope: data.scope,
            tokenType: data.token_type,
            token_type: data.token_type,
            socialUser: {
                id: githubUser.id,
                login: githubUser.login,
                name: githubUser.name,
                email: githubUser.email,
                htmlUrl: githubUser.html_url,
                html_url: githubUser.html_url,
                avatarUrl: githubUser.avatar_url,
                avatar_url: githubUser.avatar_url,
                publicRepos: githubUser.public_repos,
                public_repos: githubUser.public_repos,
                followers: githubUser.followers,
                following: githubUser.following,
                createdAt: githubUser.created_at,
                created_at: githubUser.created_at,
            },
        },
    };
}

async function completeLogin({
    githubSessionId,
    githubSession,
    memberId,
    limitRepoCount,
    commitLimitPerRepo,
}) {
    let conn;

    try {
        const parsedMemberId = parseRequiredPositiveInt(
            memberId,
            "memberId 또는 member_id가 필요합니다."
        );

        conn = await getConnection();

        const githubSaveResult = await saveGithubDataTransaction({
            conn,
            githubSession,
            memberId: parsedMemberId,
            limitRepoCount,
            commitLimitPerRepo,
        });

        await conn.commit();

        const loginSessionId = createLoginSession({
            memberId: parsedMemberId,
            loginType: "SOCIAL",
            provider: SOCIAL_PROVIDER.GITHUB,
            role: "USER",
        });

        if (githubSessionId) {
            deleteSocialSession(githubSessionId);
        }

        return {
            message: "GitHub 연동 및 저장 완료",
            data: {
                loginSessionId,
                login_session_id: loginSessionId,
                memberId: parsedMemberId,
                member_id: parsedMemberId,
                provider: SOCIAL_PROVIDER.GITHUB,
                githubAccountId: githubSaveResult.githubAccountId,
                github_account_id: githubSaveResult.github_account_id,
                ...githubSaveResult,
            },
        };

    } catch (error) {
        if (conn) {
            await conn.rollback();
        }

        throw error;

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function getInfo(githubSession) {
    const githubApi = createGithubApiBySession(githubSession);
    const user = await githubApi.getUser();

    return {
        message: "GitHub 유저정보 조회 성공",
        data: {
            id: user.id,
            login: user.login,
            name: user.name,
            email: user.email,
            htmlUrl: user.html_url,
            html_url: user.html_url,
            avatarUrl: user.avatar_url,
            avatar_url: user.avatar_url,
            publicRepos: user.public_repos,
            public_repos: user.public_repos,
            followers: user.followers,
            following: user.following,
            createdAt: user.created_at,
            created_at: user.created_at,
            updatedAt: user.updated_at,
            updated_at: user.updated_at,
        },
    };
}

async function getRepos({ githubSession, query = {} }) {
    const githubApi = createGithubApiBySession(githubSession);

    const sort = query.sort || "updated";
    const direction = query.direction || "desc";

    const repositories = await githubApi.getUserRepositories({
        sort,
        direction,
    });

    const limit = parseOptionalPositiveInt(query.limit, DISPLAY_REPOSITORY_LIMIT);

    return {
        message: "GitHub 저장소 조회 성공",
        data: repositories.slice(0, limit).map((repo) => ({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            full_name: repo.full_name,
            htmlUrl: repo.html_url,
            html_url: repo.html_url,
            description: repo.description,
            fork: repo.fork ? "Y" : "N",
            archived: repo.archived ? "Y" : "N",
            defaultBranch: repo.default_branch,
            default_branch: repo.default_branch,
            language: repo.language,
            createdAt: repo.created_at,
            created_at: repo.created_at,
            updatedAt: repo.updated_at,
            updated_at: repo.updated_at,
            pushedAt: repo.pushed_at,
            pushed_at: repo.pushed_at,
        })),
    };
}

async function getDetailInfo({
    githubSession,
    memberId,
    limitRepoCount,
    commitLimitPerRepo,
}) {
    const parsedMemberId = parseRequiredPositiveInt(
        memberId,
        "memberId 또는 member_id가 필요합니다."
    );

    const githubApi = createGithubApiBySession(githubSession);

    const repoLimit = parseOptionalPositiveInt(limitRepoCount, 5);
    const commitLimit = parseOptionalPositiveInt(
        commitLimitPerRepo,
        DEFAULT_COMMIT_LIMIT_PER_REPO
    );

    const githubUser = await githubApi.getUser();

    const repositories = await githubApi.getUserRepositories({
        sort: "updated",
        direction: "desc",
    });

    const selectedRepositories = repositories.slice(0, repoLimit);
    const repositoryDetails = [];

    for (const repo of selectedRepositories) {
        const parsed = parseFullName(repo.full_name);

        if (!parsed) {
            continue;
        }

        const languages = await githubApi.getRepositoryLanguages(
            parsed.owner,
            parsed.repoName
        );

        const commits = await getRepositoryCommitsSafely({
            githubApi,
            owner: parsed.owner,
            repoName: parsed.repoName,
            commitLimit,
            repo,
        });

        repositoryDetails.push({
            repository: {
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                html_url: repo.html_url,
                description: repo.description,
                fork: repo.fork ? "Y" : "N",
                archived: repo.archived ? "Y" : "N",
                default_branch: repo.default_branch,
                created_at: repo.created_at,
                updated_at: repo.updated_at,
                pushed_at: repo.pushed_at,
            },
            languages: calculateLanguageRatio(languages),
            commitDaily: groupCommitsByDate(commits),
        });
    }

    return {
        message: "GitHub 상세 조회 성공",
        data: {
            memberId: parsedMemberId,
            member_id: parsedMemberId,
            githubAccount: {
                id: githubUser.id,
                login: githubUser.login,
                htmlUrl: githubUser.html_url,
                html_url: githubUser.html_url,
            },
            repositoryTotalCount: repositories.length,
            repository_total_count: repositories.length,
            previewRepositoryCount: repositoryDetails.length,
            preview_repository_count: repositoryDetails.length,
            repositories: repositoryDetails,
        },
    };
}

async function storage({
    githubSession,
    memberId,
    limitRepoCount,
    commitLimitPerRepo,
}) {
    let conn;

    try {
        const parsedMemberId = parseRequiredPositiveInt(
            memberId,
            "memberId 또는 member_id가 필요합니다."
        );

        conn = await getConnection();

        const result = await saveGithubDataTransaction({
            conn,
            githubSession,
            memberId: parsedMemberId,
            limitRepoCount,
            commitLimitPerRepo,
        });

        await conn.commit();

        return {
            message: "GitHub 정보 저장 성공",
            data: {
                memberId: parsedMemberId,
                member_id: parsedMemberId,
                ...result,
            },
        };

    } catch (error) {
        if (conn) {
            await conn.rollback();
        }

        throw error;

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function saveGithubDataTransaction({
    conn,
    githubSession,
    memberId,
    limitRepoCount,
    commitLimitPerRepo,
}) {
    if (!conn) {
        throw createError("DB 연결 정보가 없습니다.", 500);
    }

    if (!githubSession) {
        throw createError("GitHub 세션 정보가 없습니다.", 400);
    }

    const parsedMemberId = parseRequiredPositiveInt(
        memberId,
        "memberId 또는 member_id가 필요합니다."
    );

    const repoLimit = parseOptionalPositiveInt(limitRepoCount, null);

    const commitLimit = parseOptionalPositiveInt(
        commitLimitPerRepo,
        DEFAULT_COMMIT_LIMIT_PER_REPO
    );

    const githubApi = createGithubApiBySession(githubSession);
    const githubUser = await githubApi.getUser();

    const githubAccountId = await githubRepository.upsertGithubAccount(
        conn,
        buildGithubAccountRow({
            memberId: parsedMemberId,
            githubUser,
            githubSession,
        })
    );

    const techStackMap = await githubRepository.findActiveTechStackMap(conn);

    const repositories = await githubApi.getUserRepositories({
        sort: "updated",
        direction: "desc",
    });

    const selectedRepositories = repoLimit
        ? repositories.slice(0, repoLimit)
        : repositories;

    let savedRepositoryCount = 0;
    let savedTechStackCount = 0;
    let savedCommitDailyCount = 0;
    let skippedRepositoryCount = 0;
    let skippedEmptyRepositoryCount = 0;

    const savedRepositories = [];
    const unresolvedTechStacks = [];

    for (const repo of selectedRepositories) {
        const parsed = parseFullName(repo.full_name);

        if (!parsed) {
            skippedRepositoryCount++;
            continue;
        }

        const githubRepositoryId =
            await githubRepository.upsertGithubRepository(conn, {
                github_account_id: githubAccountId,
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                html_url: repo.html_url,
                description: repo.description,
                fork: repo.fork ? "Y" : "N",
                archived: repo.archived ? "Y" : "N",
                default_branch: repo.default_branch,
                created_at: repo.created_at ? new Date(repo.created_at) : null,
                updated_at: repo.updated_at ? new Date(repo.updated_at) : null,
                pushed_at: repo.pushed_at ? new Date(repo.pushed_at) : null,
            });

        savedRepositoryCount++;

        savedRepositories.push({
            githubRepositoryId,
            github_repository_id: githubRepositoryId,
            externalId: repo.id,
            external_id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            full_name: repo.full_name,
            htmlUrl: repo.html_url,
            html_url: repo.html_url,
            description: repo.description,
            pushedAt: repo.pushed_at,
            pushed_at: repo.pushed_at,
        });

        const languages = await githubApi.getRepositoryLanguages(
            parsed.owner,
            parsed.repoName
        );

        const languageRatios = calculateLanguageRatio(languages);

        await githubRepository.deleteGithubRepoTechStacks(
            conn,
            githubRepositoryId
        );

        for (const language of languageRatios) {
            const languageName = String(language.language_name);
            const techCategoryCode =
                techStackMap[languageName.toLowerCase()];

            if (!techCategoryCode) {
                unresolvedTechStacks.push({
                    githubRepositoryId,
                    github_repository_id: githubRepositoryId,
                    repositoryName: repo.name,
                    repository_name: repo.name,
                    languageName,
                    language_name: languageName,
                    usageRatio: language.usage_ratio,
                    usage_ratio: language.usage_ratio,
                });

                continue;
            }

            await githubRepository.insertGithubRepoTechStack(conn, {
                github_repository_id: githubRepositoryId,
                tech_category_code: techCategoryCode,
                language_name: language.language_name,
                usage_ratio: language.usage_ratio,
            });

            savedTechStackCount++;
        }

        const commits = await getRepositoryCommitsSafely({
            githubApi,
            owner: parsed.owner,
            repoName: parsed.repoName,
            commitLimit,
            repo,
        });

        if (commits.length === 0) {
            skippedEmptyRepositoryCount++;
        }

        const commitDailyList = groupCommitsByDate(commits);

        await githubRepository.deleteGithubRepoCommitDaily(
            conn,
            githubRepositoryId
        );

        for (const commitDaily of commitDailyList) {
            await githubRepository.insertGithubRepoCommitDaily(conn, {
                github_repository_id: githubRepositoryId,
                commit_date: new Date(commitDaily.commit_date),
                commit_count: commitDaily.commit_count,
            });

            savedCommitDailyCount++;
        }
    }

    const displayRepositories = savedRepositories.slice(
        0,
        DISPLAY_REPOSITORY_LIMIT
    );

    return {
        githubAccountId,
        github_account_id: githubAccountId,

        repositoryTotalCount: repositories.length,
        repository_total_count: repositories.length,

        savedRepositoryCount,
        saved_repository_count: savedRepositoryCount,

        skippedRepositoryCount,
        skipped_repository_count: skippedRepositoryCount,

        skippedEmptyRepositoryCount,
        skipped_empty_repository_count: skippedEmptyRepositoryCount,

        savedTechStackCount,
        saved_tech_stack_count: savedTechStackCount,

        savedCommitDailyCount,
        saved_commit_daily_count: savedCommitDailyCount,

        unresolvedTechStacks,
        unresolved_tech_stacks: unresolvedTechStacks,

        displayRepositoryCount: displayRepositories.length,
        display_repository_count: displayRepositories.length,

        displayRepositories,
        display_repositories: displayRepositories,
    };
}

module.exports = {
    login,
    issueToken,
    completeLogin,
    getInfo,
    getRepos,
    getDetailInfo,
    storage,
    saveGithubDataTransaction,
    saveGithubDataByResumeTransaction: saveGithubDataTransaction,
};