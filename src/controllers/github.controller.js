const githubService = require("../services/github.service");

function getMemberId(req) {
    return (
        req.query.memberId ||
        req.query.member_id ||
        req.body.memberId ||
        req.body.member_id
    );
}

function getLimitRepoCount(req) {
    return req.query.limitRepoCount || req.body.limitRepoCount;
}

function getCommitLimitPerRepo(req) {
    return req.query.commitLimitPerRepo || req.body.commitLimitPerRepo;
}

function sendError(res, error, defaultMessage) {
    return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : defaultMessage,
        error: error.response?.data || error.message,
    });
}

/**
 * POST /api/github/auth/login
 */
async function login(req, res) {
    try {
        console.log("컨트롤러 깃허브 요청 들어옴");
        console.log("요청 body", req.body);

        const defaultScope = "read:user user:email repo";

        const scope =
            typeof req.body?.scope === "string" && req.body.scope.trim() !== ""
                ? req.body.scope.trim()
                : defaultScope;

        console.log("스코프 값", scope);

        const result = await githubService.login(scope);

        return res.status(200).json({
            success: true,
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
 */
async function issueToken(req, res) {
    try {
        const deviceCode = req.body.deviceCode || req.body.device_code;

        const result = await githubService.issueToken(deviceCode);

        if (result.authenticated === false) {
            return res.status(202).json({
                success: true,
                message: result.message,
                data: result.data,
            });
        }

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data,
        });

    } catch (error) {
        console.error(error);

        return sendError(res, error, "GitHub 토큰 발급 실패");
    }
}

/**
 * POST /api/github/auth/complete
 */
async function completeLogin(req, res) {
    try {
        const memberId = getMemberId(req);

        const result = await githubService.completeLogin({
            githubSessionId: req.githubSessionId,
            githubSession: req.githubSession,
            memberId,
        });

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data,
        });

    } catch (error) {
        console.error(error);

        return sendError(res, error, "GitHub 소셜 로그인 완료 실패");
    }
}

/**
 * GET /api/github/info
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
    completeLogin,
    getInfo,
    getRepos,
    getDetailInfo,
    storage,
};