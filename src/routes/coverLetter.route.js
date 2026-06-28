const express = require("express");
const ctrl = require("../controllers/coverLetter.controller");

const router = express.Router();

// POST /api/cover-letters/generate → 자소서 생성 (COVER_LETTER_ITEM UPSERT)
router.post("/generate", ctrl.generate);

module.exports = router;
