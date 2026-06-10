const express = require("express");
const resumeController = require("../controllers/resume.controller");

const router = express.Router();

router.post("/", resumeController.createResume);

module.exports = router;