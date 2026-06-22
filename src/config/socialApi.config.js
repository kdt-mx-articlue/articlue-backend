const axios = require("axios");
const env = require("./env");

/**
 * 소셜 로그인 제공자 상수
 */
const SOCIAL_PROVIDER = {
    GITHUB: "GITHUB",
    KAKAO: "KAKAO",
    NAVER: "NAVER"
};

const GITHUB_AUTH_BASE_URL = "https://github.com";
const GITHUB_API_BASE_URL = "https://api.github.com";
const KAKAO_AUTH_BASE_URL = "https://kauth.kakao.com";
const KAKAO_API_BASE_URL = "https://kapi.kakao.com";
const NAVER_AUTH_BASE_URL = "https://nid.naver.com";
const NAVER_API_BASE_URL = "https://openapi.naver.com";


/**
 * GitHub, Kako, Naver OAuth 인증용 axios instance
 */
const githubAuthClient = axios.create({
    baseURL: GITHUB_AUTH_BASE_URL,
    headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 10000,
});

const kakaoAuthClient = axios.create({
    baseURL: KAKAO_AUTH_BASE_URL,
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 10000,
});

const naverAuthClient = axios.create({
    baseURL: NAVER_AUTH_BASE_URL,
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 10000,
});

/**
 * GitHub, Kakao, Naver REST API용 axios instance 생성 함수
 */
function createGithubRestClient(accessToken) {
    return axios.create({
        baseURL: GITHUB_API_BASE_URL,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${accessToken}`,
            "X-GitHub-Api-Version": env.github.apiVersion,
        },
        timeout: 15000,
    });
}

function createKakaoRestClient(accessToken) {

    return axios.create({
        baseURL: KAKAO_API_BASE_URL,
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
    });
}

function createNaverRestClient(accessToken) {

    return axios.create({
        baseURL: NAVER_API_BASE_URL,
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
    });
}

/**
 * GitHub, Kakao, Naver OAuth API 모음
 */
const githubAuthApi = {
    async requestDeviceCode({ scope }) {
        const params = new URLSearchParams({
            client_id: env.github.clientId,
            scope,
        });

        const response = await githubAuthClient.post("/login/device/code", params);

        return response.data;
    },

    async requestAccessToken({ deviceCode }) {
        const params = new URLSearchParams({
            client_id: env.github.clientId,
            device_code: deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        });

        const response = await githubAuthClient.post(
            "/login/oauth/access_token",
            params
        );

        return response.data;
    },
};

const kakaoAuthApi = {

    async requestAccessToken(code) {

        const params = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: env.kakao.restApiKey,
            redirect_uri: env.kakao.redirectUri,
            code,
        });

        const response = await kakaoAuthClient.post(
            "/oauth/token",
            params
        );

        return response.data;
    },
};

const naverAuthApi = {

    async requestAccessToken(code, state) {

        const params = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: env.naver.clientId,
            client_secret: env.naver.clientSecret,
            code,
            state,
        });

        const response = await naverAuthClient.post(
            "/oauth2.0/token",
            params
        );

        return response.data;
    }
};

/**
 });

        const response = await githubAuthClient.post(
            "/login/oauth/access_token",
            params
        );

        return response.data;
    },
};

/**
 * GitHub 세션 기반 API 객체 생성
 */
function createGithubApiBySession(socialSession) {
    if (!socialSession || !socialSession.accessToken) {
        throw new Error("GitHub access token이 없습니다.");
    }

    if (socialSession.provider !== SOCIAL_PROVIDER.GITHUB) {
        throw new Error("GitHub 세션이 아닙니다.");
    }

    const client = createGithubRestClient(socialSession.accessToken);

    async function get(url, config = {}) {
        const response = await client.get(url, config);
        return response.data;
    }

    async function post(url, data = {}, config = {}) {
        const response = await client.post(url, data, config);
        return response.data;
    }

    async function fetchAllPages(url, params = {}) {
        const results = [];
        let page = 1;

        while (true) {
            const response = await client.get(url, {
                params: {
                    ...params,
                    per_page: 100,
                    page,
                },
            });

            if (!Array.isArray(response.data)) {
                return results;
            }

            results.push(...response.data);

            const linkHeader = response.headers.link;
            const hasNextPage = linkHeader && linkHeader.includes('rel="next"');

            if (!hasNextPage) {
                break;
            }

            page += 1;
        }

        return results;
    }

    async function fetchPagesWithLimit(url, params = {}, limit = 100) {
        const results = [];
        const safeLimit = Math.max(1, Number(limit));
        let page = 1;

        while (results.length < safeLimit) {
            const perPage = Math.min(100, safeLimit - results.length);

            const response = await client.get(url, {
                params: {
                    ...params,
                    per_page: perPage,
                    page,
                },
            });

            if (!Array.isArray(response.data) || response.data.length === 0) {
                break;
            }

            results.push(...response.data);

            const linkHeader = response.headers.link;
            const hasNextPage = linkHeader && linkHeader.includes('rel="next"');

            if (!hasNextPage) {
                break;
            }

            page += 1;
        }

        return results;
    }

    return {
        get,
        post,

        async getUser() {
            return await get("/user");
        },

        async getUserRepositories(params = {}) {
            return await fetchAllPages("/user/repos", params);
        },

        async getRepositoryLanguages(owner, repoName) {
            return await get(`/repos/${owner}/${repoName}/languages`);
        },

        async getRepositoryCommits(owner, repoName, params = {}, limit = 100) {
            return await fetchPagesWithLimit(
                `/repos/${owner}/${repoName}/commits`,
                params,
                limit
            );
        },
    };
}

// 카카오 User API
function createKakaoApi(accessToken) {

    const client = createKakaoRestClient(accessToken);

    return {

        async getUser() {

            const response = await client.get(
                "/v2/user/me"
            );

            return response.data;
        }
    };
}

// 네이버 User API
function createNaverApi(accessToken) {

    const client = createNaverRestClient(accessToken);

    return {

        async getUser() {

            const response =
                await client.get("/v1/nid/me");

            return response.data;
        }
    };
}

module.exports = {
    SOCIAL_PROVIDER,

    githubAuthApi,
    createGithubApiBySession,

    kakaoAuthApi,
    createKakaoApi,   

    naverAuthApi,
    createNaverApi,
};