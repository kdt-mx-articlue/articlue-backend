const { oracledb, getConnection } = require("../config/db");

/**
 * 모의 면접 이용 한도
 *
 * - 가입 회원: INTERVIEW_FREE_LIMIT 회 (기본 3)
 * - 체험 계정(데모로 체험하기): DEMO_INTERVIEW_LIMIT 회 (기본 2), 음성(VOICE) 면접 불가
 *
 * 프론트 화면 검사는 진입 경로에 따라 우회되므로 면접 시작 API 에서 항상 검사한다.
 * 체험 계정은 프론트 createDemoSession 이 만드는 login_id(demo_…) / 이메일(@demo.articlue.local)로 구분한다.
 */
const FREE_LIMIT = Number(process.env.INTERVIEW_FREE_LIMIT || 3);
const DEMO_LIMIT = Number(process.env.DEMO_INTERVIEW_LIMIT || 2);

function createError(status, message, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function isDemoMember(member) {
    return String(member.loginId || "").startsWith("demo_")
        || String(member.email || "").endsWith("@demo.articlue.local");
}

async function findMemberUsage(conn, { memberId, resumeId }) {
    const where = memberId ? "m.MEMBER_ID = :id" : "m.MEMBER_ID = (SELECT r.MEMBER_ID FROM RESUME r WHERE r.RESUME_ID = :id)";

    const result = await conn.execute(
        `
        SELECT m.MEMBER_ID AS "memberId",
               m.LOGIN_ID  AS "loginId",
               m.EMAIL     AS "email",
               (SELECT COUNT(*)
                  FROM INTERVIEW_SESSION s
                  JOIN RESUME r ON r.RESUME_ID = s.RESUME_ID
                 WHERE r.MEMBER_ID = m.MEMBER_ID
                   AND s.IS_SAMPLE = 'N') AS "usedCount"
          FROM MEMBER m
         WHERE ${where}
        `,
        { id: Number(memberId || resumeId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0] || null;
}

function toQuota(member) {
    const isDemo = isDemoMember(member);
    const limit = isDemo ? DEMO_LIMIT : FREE_LIMIT;
    const used = Number(member.usedCount || 0);

    return {
        isDemo,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        voiceAllowed: !isDemo,
    };
}

/**
 * GET /api/interviews/quota?memberId= (또는 resumeId=)
 */
async function getQuota({ memberId, resumeId }) {
    if (!memberId && !resumeId) {
        throw createError(400, "memberId 또는 resumeId 가 필요합니다.");
    }

    const conn = await getConnection();
    try {
        const member = await findMemberUsage(conn, { memberId, resumeId });
        if (!member) throw createError(404, "회원 정보를 찾을 수 없습니다.");
        return toQuota(member);
    } finally {
        await conn.close();
    }
}

/**
 * 면접 시작 전 검사 — 한도 초과 / 체험 계정 음성 면접이면 403
 */
async function assertCanStartInterview({ resumeId, chatMode }) {
    const quota = await getQuota({ resumeId });

    if (chatMode === "VOICE" && !quota.voiceAllowed) {
        throw createError(403, "음성(TTS) 면접은 회원가입 후 이용할 수 있습니다. 체험 계정은 텍스트 면접만 가능합니다.", "VOICE_NOT_ALLOWED");
    }

    if (quota.remaining <= 0) {
        throw createError(
            403,
            quota.isDemo
                ? `체험 계정은 모의 면접을 ${quota.limit}회까지 이용할 수 있습니다. 회원가입 후 이어서 이용해 주세요.`
                : `무료 모의 면접 ${quota.limit}회를 모두 사용했습니다.`,
            "INTERVIEW_LIMIT_EXCEEDED"
        );
    }

    return quota;
}

module.exports = {
    isDemoMember,
    getQuota,
    assertCanStartInterview,
};
