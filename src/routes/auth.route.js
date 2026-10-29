const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

/**
 * 회원가입
 */
router.post("/signup", authController.signup);

/**
 * 로그인 (성공 시 세션 쿠키 발급)
 */
router.post("/login", authController.login);

/**
 * 로그아웃 (세션 쿠키 삭제)
 */
router.post("/logout", authController.logout);

// 소셜 로그인
router.post("/kakao", authController.kakaoLogin);
router.get("/naver/callback", authController.naverLogin);

module.exports = router;
