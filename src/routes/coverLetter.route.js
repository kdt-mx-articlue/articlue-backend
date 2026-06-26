const express = require("express");
const ctrl = require("../controllers/coverLetter.controller");

const router = express.Router();

// POST   /api/cover-letters/generate   → 자소서 생성
// GET    /api/cover-letters             → 목록
// GET    /api/cover-letters/:id         → 상세
// PUT    /api/cover-letters/:id         → 수정

router.post("/generate",       ctrl.generate);
router.get("/",                ctrl.getList);
router.get("/:coverLetterId",  ctrl.getDetail);
router.put("/:coverLetterId",  ctrl.update);

module.exports = router;
