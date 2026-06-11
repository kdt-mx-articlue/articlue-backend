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

function toNumber(value, defaultValue) {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    const numberValue = Number(value);

    if (Number.isNaN(numberValue)) {
        return defaultValue;
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

/**
 * POST /api/github/auth/login
 */
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

/**
 * POST /api/github/auth/token
 */
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
    };

    const githubApi = createGithubApiBySession(githubSessionForApi);
    const githubUser = await githubApi.getUser();

    const socialSessionId = createSocialSession({
        provider: SOCIAL_PROVIDER.GITHUB,
        accessToken: data.access_token,
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

            socialUser: {
                id: githubUser.id,
                login: githubUser.login,
                name: githubUser.name,
                email: githubUser.email,
                htmlUrl: githubUser.html_url,
                avatarUrl: githubUser.avatar_url,
                publicRepos: githubUser.public_repos,
                followers: githubUser.followers,
                following: githubUser.following,
                createdAt: githubUser.created_at,
            },
        },
    };
}

/**
 * POST /api/github/auth/complete
 *
 * 현재 테스트 단계에서는 memberId를 직접 받아서
 * GitHub 계정을 우리 회원과 연결하고 loginSession을 발급한다.
 */
async function completeLogin({ githubSessionId, githubSession, memberId }) {
    let conn;

    try {
        if (!memberId) {
            throw createError("memberId 또는 member_id가 필요합니다.", 400);
        }

        conn = await getConnection();

        const githubApi = createGithubApiBySession(githubSession);
        const githubUser = await githubApi.getUser();

        const githubAccountId = await githubRepository.upsertGithubAccount(conn, {
            member_id: Number(memberId),
            id: githubUser.id,
            login: githubUser.login,
            html_url: githubUser.html_url,
        });

        await conn.commit();

        const loginSessionId = createLoginSession({
            memberId: Number(memberId),
            loginType: "SOCIAL",
            provider: SOCIAL_PROVIDER.GITHUB,
            role: "USER",
        });

        deleteSocialSession(githubSessionId);

        return {
            message: "GitHub 소셜 로그인 완료",
            data: {
                loginSessionId,
                login_session_id: loginSessionId,

                memberId: Number(memberId),
                member_id: Number(memberId),

                provider: SOCIAL_PROVIDER.GITHUB,
                githubAccountId,
                github_account_id: githubAccountId,
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

/**
 * GET /api/github/info
 */
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
            avatarUrl: user.avatar_url,
            publicRepos: user.public_repos,
            followers: user.followers,
            following: user.following,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
        },
    };
}

/**
 * GET /api/github/repos
 */
async function getRepos({ githubSession, query }) {
    const githubApi = createGithubApiBySession(githubSession);

    const sort = query.sort || "updated";
    const direction = query.direction || "desc";

    const repositories = await githubApi.getUserRepositories({
        sort,
        direction,
    });

    const limit = toNumber(query.limit, repositories.length);

    return {
        message: "GitHub 저장소 조회 성공",
        data: repositories.slice(0, limit).map((repo) => ({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            htmlUrl: repo.html_url,
            description: repo.description,
            fork: repo.fork,
            archived: repo.archived,
            defaultBranch: repo.default_branch,
            language: repo.language,
            createdAt: repo.created_at,
            updatedAt: repo.updated_at,
            pushedAt: repo.pushed_at,
        })),
    };
}

/**
 * GET /api/github/detail/info
 *
 * DB 저장 없이 preview만 반환한다.
 */
async function getDetailInfo({
    githubSession,
    memberId,
    limitRepoCount,
    commitLimitPerRepo,
}) {
    if (!memberId) {
        throw createError("memberId 또는 member_id가 필요합니다.", 400);
    }

    const githubApi = createGithubApiBySession(githubSession);

    const repoLimit = toNumber(limitRepoCount, 5);
    const commitLimit = toNumber(commitLimitPerRepo, 30);

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

        const commits = await githubApi.getRepositoryCommits(
            parsed.owner,
            parsed.repoName,
            {},
            commitLimit
        );

        repositoryDetails.push({
            repository: {
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                html_url: repo.html_url,
                description: repo.description,
                fork: repo.fork,
                archived: repo.archived,
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
            member_id: Number(memberId),
            githubAccount: {
                id: githubUser.id,
                login: githubUser.login,
                html_url: githubUser.html_url,
            },
            repositories: repositoryDetails,
        },
    };
}

/**
 * POST /api/github/storage
 */
async function storage({
    githubSession,
    memberId,
    limitRepoCount,
    commitLimitPerRepo,
}) {
    let conn;

    try {
        conn = await getConnection();

        const result = await saveGithubDataByResumeTransaction({
            conn,
            githubSession,
            memberId,
            limitRepoCount,
            commitLimitPerRepo,
        });

        await conn.commit();

        return {
            message: "GitHub 정보 저장 성공",
            data: {
                memberId: Number(memberId),
                member_id: Number(memberId),
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

/**
 * 이력서 등록 트랜잭션 안에서 사용할 GitHub 정보 저장 함수
 *
 * 주의:
 * - 여기서는 getConnection(), commit(), rollback(), close()를 하지 않는다.
 * - resume.service.js의 같은 conn을 받아서 사용한다.
 */
async function saveGithubDataByResumeTransaction({
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

    if (!memberId) {
        throw createError("memberId 또는 member_id가 필요합니다.", 400);
    }

    const repoLimit = toNumber(limitRepoCount, 5);
    const commitLimit = toNumber(commitLimitPerRepo, 30);

    const githubApi = createGithubApiBySession(githubSession);

    const githubUser = await githubApi.getUser();

    const githubAccountId = await githubRepository.upsertGithubAccount(conn, {
        member_id: Number(memberId),
        id: githubUser.id,
        login: githubUser.login,
        html_url: githubUser.html_url,
    });

    const techStackMap = await githubRepository.findActiveTechStackMap(conn);

    const repositories = await githubApi.getUserRepositories({
        sort: "updated",
        direction: "desc",
    });

    const selectedRepositories = repositories.slice(0, repoLimit);

    let savedRepositoryCount = 0;
    let savedTechStackCount = 0;
    let savedCommitDailyCount = 0;

    const savedRepositories = [];

    for (const repo of selectedRepositories) {
        const parsed = parseFullName(repo.full_name);

        if (!parsed) {
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
                fork: repo.fork ? 1 : 0,
                archived: repo.archived ? 1 : 0,
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
            const techStackId =
                techStackMap[String(language.language_name).toLowerCase()];

            if (!techStackId) {
                continue;
            }

            await githubRepository.insertGithubRepoTechStack(conn, {
                github_repository_id: githubRepositoryId,
                tech_stack_id: techStackId,
                language_name: language.language_name,
                usage_ratio: language.usage_ratio,
            });

            savedTechStackCount++;
        }

        const commits = await githubApi.getRepositoryCommits(
            parsed.owner,
            parsed.repoName,
            {},
            commitLimit
        );

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

    return {
        githubAccountId,
        github_account_id: githubAccountId,

        repositoryTotalCount: repositories.length,
        repository_total_count: repositories.length,

        savedRepositoryCount,
        saved_repository_count: savedRepositoryCount,

        savedTechStackCount,
        saved_tech_stack_count: savedTechStackCount,

        savedCommitDailyCount,
        saved_commit_daily_count: savedCommitDailyCount,

        savedRepositories,
        saved_repositories: savedRepositories,
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
    saveGithubDataByResumeTransaction,
};


