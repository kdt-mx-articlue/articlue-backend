const express = require("express");
const memberController = require("../controllers/member.controller");

const router = express.Router();

router.get("/profile", memberController.getProfile);
router.put("/profile", memberController.updateProfile);
router.get("/me", memberController.getMe);

module.exports = router;
