const githubService = require("../services/github.service");

/**
 * memberId 추출
 * - query/body 둘 다 지원
 */
function getMemberId(req) {
    return (
        req.query?.memberId ||
        req.query?.member_id ||
        req.body?.memberId ||
        req.body?.member_id
    );
}

/**
 * 저장소 수 제한값 추출
 */
function getLimitRepoCount(req) {
    return req.query?.limitRepoCount || req.body?.limitRepoCount;
}

/**
 * 저장소별 커밋 수 제한값 추출
 */
function getCommitLimitPerRepo(req) {
    return req.query?.commitLimitPerRepo || req.body?.commitLimitPerRepo;
}

/**
 * 공통 에러 응답
 */
function sendError(res, error, defaultMessage) {
    const statusCode = error.statusCode || error.status || 500;

    return res.status(statusCode).json({
        success: false,
        authenticated: false,
        message: statusCode < 500 ? error.message : defaultMessage,
        error: error.response?.data || error.message,
    });
}

/**
 * POST /api/github/auth/login
 *
 * GitHub Device Flow 인증 코드 발급
 *
 * 이 API는 실제 로그인을 완료하는 API가 아니다.
 * GitHub 인증 페이지에서 입력할 user_code와 verification_uri를 발급한다.
 */
async function login(req, res) {
    try {
        const defaultScope = "read:user user:email repo";

        const scope =
            typeof req.body?.scope === "string" && req.body.scope.trim() !== ""
                ? req.body.scope.trim()
                : defaultScope;

        const result = await githubService.login(scope);

        return res.status(200).json({
            success: true,
            authenticated: false,
            message: result.message,
            data: result.data,
        });

    } catch (error) {
        console.error(error);

        return sendError(
            res,
            error,
            "GitHub Device Flow 로그인 코드 발급 실패"
        );
    }
}

/**
 * POST /api/github/auth/token
 *
 * GitHub Device Flow 토큰 발급 확인
 *
 * 이 API는 프론트에서 반복 호출한다.
 *
 * 응답 기준:
 * - 202: 아직 GitHub 인증 대기 중
 * - 200: GitHub 인증 완료, social session 발급 완료
 */
async function issueToken(req, res) {
    try {
        const deviceCode = req.body?.device_code || req.body?.deviceCode;

        const result = await githubService.issueToken(deviceCode);

        /**
         * 아직 사용자가 GitHub 인증 페이지에서 승인을 완료하지 않은 상태
         *
         * 프론트는 이 응답을 실패로 처리하면 안 된다.
         * 일정 시간 후 다시 /api/github/auth/token을 호출해야 한다.
         */
        if (result.authenticated === false) {
            return res.status(202).json({
                success: false,
                authenticated: false,
                status: "AUTHORIZATION_PENDING",
                message: result.message,
                data: result.data,
            });
        }

        /**
         * GitHub 인증 성공 상태
         *
         * github.service.issueToken()은 성공 시 result.data 안에
         * github_session_id, social_session_id를 포함해서 반환해야 한다.
         */
        return res.status(200).json({
            success: true,
            authenticated: true,
            status: "AUTHENTICATED",
            message: result.message,
            data: result.data,
        });

    } catch (error) {
        console.error(error);

        return sendError(res, error, "GitHub 토큰 발급 실패");
    }
}

/**
 * GET /api/github/info
 *
 * GitHub 유저정보 조회
 * - route middleware에서 req.githubSession 주입 필요
 */
async function getInfo(req, res) {
    try {
        const result = await githubService.getInfo(req.githubSession);

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data,
        });

    } catch (error) {
        console.error(error);

        return sendError(res, error, "GitHub 유저정보 조회 실패");
    }
}

/**
 * GET /api/github/repos
 *
 * GitHub 저장소 목록 조회
 * - route middleware에서 req.githubSession 주입 필요
 */
async function getRepos(req, res) {
    try {
        const result = await githubService.getRepos({
            githubSession: req.githubSession,
            query: req.query,
        });

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data,
        });

    } catch (error) {
        console.error(error);

        return sendError(res, error, "GitHub 저장소 조회 실패");
    }
}

/**
 * GET /api/github/detail/info
 *
 * GitHub 상세 조회
 * - DB 저장 없이 preview 형태로 반환
 * - route middleware에서 req.githubSession 주입 필요
 */
async function getDetailInfo(req, res) {
    try {
        const memberId = getMemberId(req);

        const result = await githubService.getDetailInfo({
            githubSession: req.githubSession,
            memberId,
            limitRepoCount: getLimitRepoCount(req),
            commitLimitPerRepo: getCommitLimitPerRepo(req),
        });

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data,
        });

    } catch (error) {
        console.error(error);

        return sendError(res, error, "GitHub 상세 조회 실패");
    }
}

/**
 * POST /api/github/storage
 *
 * GitHub 정보 DB 저장
 * - route middleware에서 req.githubSession 주입 필요
 */
async function storage(req, res) {
    try {
        const memberId = getMemberId(req);

        const result = await githubService.storage({
            githubSession: req.githubSession,
            memberId,
            limitRepoCount: getLimitRepoCount(req),
            commitLimitPerRepo: getCommitLimitPerRepo(req),
        });

        return res.status(201).json({
            success: true,
            message: result.message,
            data: result.data,
        });

    } catch (error) {
        console.error(error);

        return sendError(res, error, "GitHub 정보 저장 실패");
    }
}

module.exports = {
    login,
    issueToken,
    getInfo,
    getRepos,
    getDetailInfo,
    storage,
};