const express = require("express");
const ctrl = require("../controllers/coverLetter.controller");
const { requireAuth, ownsResume, ownsCoverLetter } = require("../middlewares/auth.middleware");

const router = express.Router();

// 모두 로그인 필요 (AI 호출 비용 + 본인 자소서만)
router.use(requireAuth);
const ownCoverLetter = ownsCoverLetter((req) => req.params.coverLetterId);

// POST /api/cover-letters/extract-questions → AI 자소서 문항 추출
router.post("/extract-questions", ctrl.extractQuestions);

// POST /api/cover-letters/generate → 자소서 생성 (body.resumeId 는 본인 이력서만)
router.post("/generate", ownsResume((req) => req.body?.resumeId), ctrl.generate);

// GET  /api/cover-letters          → 내 자소서 목록 조회
router.get("/", ctrl.list);

// GET  /api/cover-letters/:id      → 자소서 상세 조회
router.get("/:coverLetterId", ownCoverLetter, ctrl.getDetail);

// PUT  /api/cover-letters/:id      → 자소서 수정
router.put("/:coverLetterId", ownCoverLetter, ctrl.update);

module.exports = router;
