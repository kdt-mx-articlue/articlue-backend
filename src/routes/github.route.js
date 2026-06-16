const express = require("express");
const githubController = require("../controllers/github.controller");
const { getSocialSession } = require("../store/socialSessionStore");
const { SOCIAL_PROVIDER } = require("../config/socialApi.config");

const router = express.Router();

/**
 * GitHub 인증이 필요한 API에서 사용하는 middleware
 *
 * 현재 Postman 테스트에서는 header로 session id를 받는다.
 *
 * 지원하는 header:
 * - X-GitHub-Session-Id : GitHub 전용 이름
 * - X-Social-Session-Id : 추후 소셜 로그인 공통 이름
 *
 * 나중에 프론트가 붙으면 공통 이름인 X-Social-Session-Id로 통일해도 된다.
 */
function requireGithubSession(req, res, next) {
  const sessionId =
    req.header("X-GitHub-Session-Id") || req.header("X-Social-Session-Id");

  const socialSession = getSocialSession(sessionId);

  if (!socialSession) {
    return res.status(401).json({
      message:
        "소셜 세션이 없습니다. 먼저 /api/github/auth/login, /api/github/auth/token 순서로 로그인하세요.",
    });
  }

  if (socialSession.provider !== SOCIAL_PROVIDER.GITHUB) {
    return res.status(403).json({
      message: "GitHub 세션이 아닙니다.",
      provider: socialSession.provider,
    });
  }

  req.githubSession = socialSession;
  next();
}

/**
 * 깃허브계정 로그인
 *
 * 실제 GitHub 로그인이 완료되는 것이 아니라,
 * GitHub Device Flow 인증용 user_code를 발급한다.
 */
router.post("/auth/login", githubController.login);

/**
 * 깃허브계정 토큰발급
 *
 * 사용자가 브라우저에서 user_code를 승인한 뒤 호출한다.
 * 성공 시 서버 내부 social session을 생성한다.
 */
router.post("/auth/token", githubController.issueToken);

/**
 * 깃허브 정보 저장
 *
 * GitHub 데이터를 실제 Oracle DB에 저장한다.
 */
router.post("/storage", requireGithubSession, githubController.storage);

module.exports = router;