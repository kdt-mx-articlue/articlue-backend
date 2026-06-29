const express = require("express");
const ctrl = require("../controllers/coverLetter.controller");

const router = express.Router();

// POST /api/cover-letters/extract-questions → AI 자소서 문항 추출
router.post("/extract-questions", ctrl.extractQuestions);

// POST /api/cover-letters/generate → 자소서 생성
router.post("/generate", ctrl.generate);

// GET  /api/cover-letters          → 자소서 목록 조회 (?memberId=)
router.get("/", ctrl.list);

// GET  /api/cover-letters/:id      → 자소서 상세 조회
router.get("/:coverLetterId", ctrl.getDetail);

// PUT  /api/cover-letters/:id      → 자소서 수정
router.put("/:coverLetterId", ctrl.update);

module.exports = router;
