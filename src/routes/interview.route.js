const express = require("express");
const multer = require("multer");

const interviewController = require("../controllers/interview.controller");
const { requireAuth, ownsResume, ownsInterviewSession } = require("../middlewares/auth.middleware");

const router = express.Router();

// 모두 로그인 필요, 이력서·면접 세션은 본인 것만
router.use(requireAuth);
const ownSession = ownsInterviewSession((req) => req.params.interviewSessionId);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB
    },
});

/**
 * 면접 세션 시작
 *
 * TEXT / VOICE 구분은 body.chatMode로 처리한다.
 */
router.get(
    "/sessions",
    interviewController.getSessions
);

/**
 * 모의 면접 이용 한도 (남은 횟수, 체험 계정 음성 면접 불가)
 */
router.get(
    "/quota",
    interviewController.getQuota
);

router.post(
    "/sessions",
    ownsResume((req) => req.body?.resumeId),
    interviewController.startInterview
);

/**
 * 답변 제출
 *
 * API는 TEXT / VOICE로 분리하지 않는다.
 *
 * TEXT:
 * - Content-Type: application/json
 * - body.answerContent 사용
 *
 * VOICE:
 * - Content-Type: multipart/form-data
 * - audioFile 사용
 *
 * 실제 TEXT / VOICE 판단은 req.body가 아니라
 * 서버에 저장된 session runtimeConfig.chatMode 기준으로 service에서 처리한다.
 */
router.post(
    "/sessions/:interviewSessionId/questions/:interviewQaId/answer",
    ownSession,
    upload.single("audioFile"),
    interviewController.submitAnswer
);

/**
 * 면접 종료 및 최종 리포트 생성
 */
router.post(
    "/sessions/:interviewSessionId/finish",
    ownSession,
    interviewController.finishInterview
);


router.get(
    "/sessions/:interviewSessionId/history",
    ownSession,
    interviewController.getHistory
);

router.get(
    "/sessions/:interviewSessionId/report",
    ownSession,
    interviewController.getReport
);

module.exports = router;