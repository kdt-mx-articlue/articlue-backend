const express = require("express");
const resumeController = require("../controllers/resume.controller");

const router = express.Router();

router.post("/", resumeController.createResume);

router.get("/:resumeId/recommendations", resumeController.getResumeRecommendations);

router.get("/:resumeId/job-match", resumeController.getJobMatch);

router.get("/:resumeId", resumeController.getResumeDetail);

router.get("/:resumeId/action-plan", resumeController.getActionPlan);

router.post("/:resumeId/analyze", resumeController.analyzeResume);

module.exports = router;
