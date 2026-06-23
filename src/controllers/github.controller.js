const githubService = require("../services/github.service");

/**
 * memberId 추출
 * - body/query 둘 다 지원
 */
function getMemberId(req) {
    return (
        req.body?.memberId ||
        req.body?.member_id ||
        req.query?.memberId ||
        req.query?.member_id
    );
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
 * 주의:
 * - 이 API는 GitHub 로그인을 완료하는 API가 아닙니다.
 * - GitHub 인증 페이지에서 입력할 user_code와 verification_uri를 발급합니다.
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
 * 프론트는 이 API를 반복 호출합니다.
 *
 * 응답 기준:
 * - 202: 아직 GitHub 인증 대기 중
 * - 200: GitHub 인증 완료, githubSessionId 발급 완료
 */
async function issueToken(req, res) {
    try {

        const deviceCode =
            req.body?.deviceCode ||
            req.body?.device_code;

        const result = await githubService.issueToken(deviceCode);
        console.log(result);
        /**
         * 아직 사용자가 GitHub 인증 페이지에서 승인을 완료하지 않은 상태
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
         * GitHub 인증 성공
         *
         * result.data 안에 githubSessionId / github_session_id가 포함됩니다.
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

        return sendError(
            res,
            error,
            "GitHub 토큰 발급 실패"
        );
    }
}

/**
 * POST /api/github/storage
 *
 * GitHub 연동 버튼 최종 저장 API
 *
 * 전제:
 * - route middleware에서 req.githubSession 주입 필요
 * - 프론트는 X-GitHub-Session-Id 헤더 또는 기존 방식으로 githubSessionId 전달
 *
 * 역할:
 * - GITHUB_ACCOUNT 저장
 * - GITHUB_REPOSITORY 전체 저장
 * - GITHUB_REPO_TECH_STACK 저장
 * - GITHUB_REPO_COMMIT_DAILY 저장
 *
 * 주의:
 * - RESUME_GITHUB_REPOSITORY는 여기서 저장하지 않습니다.
 * - 이력서가 아직 생성되지 않았기 때문에 RESUME_ID가 없습니다.
 * - 이력서 저장/분석 시점에 resume.service.js에서 연결합니다.
 */
async function storage(req, res) {
    try {
        const memberId = getMemberId(req);

        const result = await githubService.storage({
            githubSession: req.githubSession,
            memberId,

            /*
             * 프론트에서는 limitRepoCount를 보내지 않습니다.
             * github.service.js에서 전체 repository를 저장합니다.
             *
             * commitLimitPerRepo도 보내지 않으면 service 기본값을 사용합니다.
             */
        });

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
            "GitHub 정보 저장 실패"
        );
    }
}

module.exports = {
    login,
    issueToken,
    storage,
};