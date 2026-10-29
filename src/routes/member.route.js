const express = require("express");
const memberController = require("../controllers/member.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

// 모두 로그인한 본인 정보만 (memberId 는 세션 기준)
router.use(requireAuth);

router.get("/profile", memberController.getProfile);
router.put("/profile", memberController.updateProfile);
router.get("/me", memberController.getMe);

module.exports = router;
