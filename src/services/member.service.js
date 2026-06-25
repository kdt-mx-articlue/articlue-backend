const db = require("../config/db");
const memberProfileRepository = require("../repositories/memberProfile.repository");

/**
 * 회원 프로필 전체 조회
 * GET /api/member/profile?memberId=X
 */
async function getProfile(memberId) {
    let conn;
    try {
        conn = await db.getConnection();

        // OracleDB 단일 커넥션은 병렬 실행 불가 -> 순차 실행
        const memberRow = await memberProfileRepository.findMemberWithProfile(memberId, conn);
        const counts    = await memberProfileRepository.getActivityCounts(memberId, conn);
        const resume    = await memberProfileRepository.getLatestResume(memberId, conn);

        if (!memberRow) {
            throw Object.assign(new Error("회원 정보를 찾을 수 없습니다."), { status: 404 });
        }

        return {
            success: true,
            message: "프로필 조회 성공",
            data: {
                member: {
                    memberId:        memberRow.memberId,
                    name:            memberRow.name            ?? "-",
                    nickname:        memberRow.nickname        ?? "-",
                    email:           memberRow.email           ?? "-",
                    joinedAt:        memberRow.joinedAt        ?? null,
                    membership:      "FREE",
                    phone:           memberRow.phone           ?? null,
                    gender:          memberRow.gender          ?? null,
                    address:         memberRow.address         ?? null,
                    profileImageUrl: memberRow.profileImageUrl ?? null,
                },
                activity: {
                    resumeCount:          Number(counts.resumeCount   ?? 0),
                    coverLetterCount:     0,
                    interviewCount:       Number(counts.interviewCount ?? 0),
                    favoriteCompanyCount: 0,
                },
                resume:     resume ?? null,
                usage:      null,
                membership: null,
                portfolios: [],
                histories:  [],
                payments:   [],
            },
        };
    } finally {
        if (conn) await conn.close();
    }
}

/**
 * 회원 프로필 수정
 * PUT /api/member/profile
 */
async function updateProfile(memberId, data) {
    let conn;
    try {
        conn = await db.getConnection();
        await memberProfileRepository.updateProfile(memberId, data, conn);
        await conn.commit();
        return { success: true, message: "프로필 수정 성공" };
    } catch (e) {
        if (conn) await conn.rollback();
        throw e;
    } finally {
        if (conn) await conn.close();
    }
}

/**
 * 회원 기본정보 조회 (MEMBER + MEMBER_PROFILE)
 * GET /api/members/me?memberId=X
 */
async function getMe(memberId) {
    let conn;
    try {
        conn = await db.getConnection();
        const memberRow = await memberProfileRepository.findMemberWithProfile(memberId, conn);
        if (!memberRow) {
            throw Object.assign(new Error("회원 정보를 찾을 수 없습니다."), { status: 404 });
        }
        return {
            success: true,
            message: "회원 정보 조회 성공",
            data: {
                memberId:        memberRow.memberId,
                nickname:        memberRow.nickname        ?? "-",
                email:           memberRow.email           ?? "-",
                userType:        memberRow.userType        ?? "COMMON",
                joinedAt:        memberRow.joinedAt        ?? null,
                name:            memberRow.name            ?? null,
                phone:           memberRow.phone           ?? null,
                gender:          memberRow.gender          ?? null,
                address:         memberRow.address         ?? null,
                profileImageUrl: memberRow.profileImageUrl ?? null,
            },
        };
    } finally {
        if (conn) await conn.close();
    }
}

module.exports = { getProfile, updateProfile, getMe };
