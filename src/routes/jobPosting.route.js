const express = require("express");
const jobPostingController = require("../controllers/jobPosting.controller");

const router = express.Router();

router.get("/", jobPostingController.getJobPostings);

router.get("/:jobPostingId", jobPostingController.getJobPostingDetail);

router.get("/:jobPostingId/context", jobPostingController.getJobPostingContext);

module.exports = router;