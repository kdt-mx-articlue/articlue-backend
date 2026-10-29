const express = require("express");
const resumeController = require("../controllers/resume.controller");
const { requireAuth, ownsResume } = require("../middlewares/auth.middleware");

const router = express.Router();

// 모두 로그인 필요, :resumeId 는 본인 이력서만
router.use(requireAuth);
const ownResume = ownsResume((req) => req.params.resumeId);

router.post("/", resumeController.createResume);

router.get("/:resumeId/recommendations", ownResume, resumeController.getResumeRecommendations);

router.get("/:resumeId/job-match", ownResume, resumeController.getJobMatch);

router.get("/:resumeId", ownResume, resumeController.getResumeDetail);

router.get("/:resumeId/action-plan", ownResume, resumeController.getActionPlan);

router.post("/:resumeId/analyze", ownResume, resumeController.analyzeResume);

router.post("/:resumeId/analyze-detail", ownResume, resumeController.analyzeJobDetail);

module.exports = router;
