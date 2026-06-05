const express = require("express");
const router = express.Router();

/**
 * resume 단위 테스트
 */
const resumeController = require("../controllers/resume.controller");
// 1. 이력서 생성
router.post("/resume", resumeController.createResume);

module.exports = router;