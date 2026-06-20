const express = require("express");
const multer = require("multer");

const interviewController = require("../controllers/interview.controller");

const router = express.Router();

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
router.post(
    "/sessions",
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
    upload.single("audioFile"),
    interviewController.submitAnswer
);

/**
 * 면접 종료 및 최종 리포트 생성
 */
router.post(
    "/sessions/:interviewSessionId/finish",
    interviewController.finishInterview
);

module.exports = router;