const express = require("express");
const crypto = require("crypto");

const adminController = require("../controllers/admin.controller");

const router = express.Router();

/**
 * 관리자 인증 — X-Admin-Token 헤더를 ADMIN_TOKEN 환경변수와 비교
 * ADMIN_TOKEN 이 비어 있으면 관리자 API 전체 비활성화
 */
function requireAdminToken(req, res, next) {
    const expected = process.env.ADMIN_TOKEN || "";

    if (!expected) {
        return res.status(503).json({
            success: false,
            message: "관리자 기능이 비활성화되어 있습니다. (ADMIN_TOKEN 미설정)",
        });
    }

    const actual = String(req.get("X-Admin-Token") || "");
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ success: false, message: "관리자 토큰이 올바르지 않습니다." });
    }

    return next();
}

router.use(requireAdminToken);

router.get("/batches", adminController.getBatchStatus);
router.post("/batches/:jobName/run", adminController.runBatch);

module.exports = router;
