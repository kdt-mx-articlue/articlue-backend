const crypto = require("crypto");
const { oracledb } = require("../config/db");
const { createError } = require("../utils/error.util");
const { isDemoMember } = require("./interviewQuota.service");

/**
 * 회원가입 IP 제한 (아이디 가입만, 최근 24시간 기준)
 *
 * - 체험 계정(데모로 체험하기): 같은 IP 에서 DEMO_SIGNUP_IP_LIMIT 개 (기본 5)
 *   인사팀처럼 한 사무실(같은 공인 IP)에서 여러 명이 체험해도 막히지 않을 정도로 둔다.
 *   체험 계정은 비밀번호를 모르는 채 만들어지므로 다른 브라우저·기기에서 다시 들어오면 새로 생성된다.
 * - 일반 가입 포함 전체: 같은 IP 에서 SIGNUP_IP_LIMIT 개 (기본 10) — 아이디만 바꿔 체험 판정을 피하는 경우 차단
 * - 체험 계정 전체: DEMO_SIGNUP_DAILY_LIMIT 개 (기본 50) — 계정마다 이력서 분석 LLM 비용이 드므로 하루 상한
 *
 * 0 이면 해당 제한을 끈다. IP 는 SHA-256 으로만 저장한다.
 */
const DEMO_IP_LIMIT = Number(process.env.DEMO_SIGNUP_IP_LIMIT || 5);
const IP_LIMIT = Number(process.env.SIGNUP_IP_LIMIT || 10);
const DEMO_DAILY_LIMIT = Number(process.env.DEMO_SIGNUP_DAILY_LIMIT || 50);

/**
 * 요청한 브라우저의 IP
 * Cloudflare Tunnel → Nginx → 백엔드 순서라 CF-Connecting-IP 를 먼저 보고,
 * 터널 없이 접속한 경우 X-Forwarded-For 의 첫 값, 마지막으로 소켓 주소를 쓴다.
 */
function getClientIp(req) {
    const cfIp = req.headers["cf-connecting-ip"];
    if (cfIp) return String(cfIp).trim();

    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();

    return req.socket?.remoteAddress || "";
}

function hashIp(ip) {
    if (!ip) return null;
    return crypto.createHash("sha256").update(ip).digest("hex");
}

/**
 * 가입 전 검사 — 초과 시 429
 */
async function assertCanSignup({ member, ipHash }, conn) {
    const isDemo = isDemoMember(member);

    const result = await conn.execute(
        `
        SELECT
            (SELECT COUNT(*) FROM MEMBER
              WHERE SIGNUP_IP_HASH = :ipHash
                AND CREATE_AT > SYSDATE - 1) AS "ipCount",
            (SELECT COUNT(*) FROM MEMBER
              WHERE SIGNUP_IP_HASH = :ipHash
                AND CREATE_AT > SYSDATE - 1
                AND LOGIN_ID LIKE 'demo\\_%' ESCAPE '\\') AS "ipDemoCount",
            (SELECT COUNT(*) FROM MEMBER
              WHERE CREATE_AT > SYSDATE - 1
                AND LOGIN_ID LIKE 'demo\\_%' ESCAPE '\\') AS "demoCount"
          FROM DUAL
        `,
        { ipHash },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const { ipCount, ipDemoCount, demoCount } = result.rows[0];

    if (isDemo && DEMO_DAILY_LIMIT > 0 && demoCount >= DEMO_DAILY_LIMIT) {
        throw createError("오늘 준비된 체험 계정이 모두 소진되었습니다. 내일 다시 시도하거나 회원가입 후 이용해 주세요.", 429);
    }

    if (!ipHash) return;

    if (isDemo && DEMO_IP_LIMIT > 0 && ipDemoCount >= DEMO_IP_LIMIT) {
        throw createError(`같은 네트워크에서는 하루 ${DEMO_IP_LIMIT}개까지 체험 계정을 만들 수 있습니다. 잠시 후 다시 시도해 주세요.`, 429);
    }

    if (IP_LIMIT > 0 && ipCount >= IP_LIMIT) {
        throw createError("같은 네트워크에서 가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    }
}

module.exports = {
    getClientIp,
    hashIp,
    assertCanSignup,
};
