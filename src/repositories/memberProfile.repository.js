const oracledb = require("oracledb");

/**
 * 회원 프로필 생성
 */
async function create(memberId, member, conn) {
    const sql = `
        INSERT INTO MEMBER_PROFILE(
            PROFILE_ID,
            MEMBER_ID,
            NAME,
            PHONE,
            BIRTH_DATE,
            ADDRESS,
            GENDER,
            MILITARY_STATUS,
            PROFILE_IMAGE_URL,
            CREATE_AT,
            UPDATE_AT
        )
        VALUES(
            SEQ_MEMBER_PROFILE.NEXTVAL,
            :memberId,
            :name,
            :phone,
            TO_DATE(:birth, 'YYYY-MM-DD'),
            :address,
            :gender,
            :military,
            NULL,
            SYSDATE,
            SYSDATE
        )
    `;
    return await conn.execute(sql, {
        memberId,
        name: member.name,
        phone: member.phone,
        birth: member.birth,
        address: `${member.address} ${member.detailAddress || ""}`.trim(),
        gender: member.gender,
        military: member.military
    });
}

/**
 * 회원 + 프로필 통합 조회
 * MEMBER JOIN MEMBER_PROFILE
 */
async function findMemberWithProfile(memberId, conn) {
    const sql = `
        SELECT
            m.MEMBER_ID         AS "memberId",
            m.LOGIN_ID          AS "loginId",
            m.EMAIL             AS "email",
            m.NICKNAME          AS "nickname",
            m.USER_TYPE         AS "userType",
            m.CREATE_AT         AS "joinedAt",
            mp.NAME             AS "name",
            mp.PHONE            AS "phone",
            mp.BIRTH_DATE       AS "birthDate",
            mp.ADDRESS          AS "address",
            mp.GENDER           AS "gender",
            mp.MILITARY_STATUS  AS "militaryStatus",
            mp.PROFILE_IMAGE_URL AS "profileImageUrl"
        FROM MEMBER m
        LEFT JOIN MEMBER_PROFILE mp ON m.MEMBER_ID = mp.MEMBER_ID
        WHERE m.MEMBER_ID = :memberId
    `;
    const result = await conn.execute(
        sql,
        { memberId: Number(memberId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0] ?? null;
}

/**
 * 활동 현황 카운트 조회
 * - 이력서 수, 면접 세션 수
 */
async function getActivityCounts(memberId, conn) {
    const id = Number(memberId);
    // OracleDB에서 동일 바인드 변수명 중복 사용 방지 → 별도 변수명 사용
    const sql = `
        SELECT
            (SELECT COUNT(*) FROM RESUME WHERE MEMBER_ID = :mid1) AS "resumeCount",
            (SELECT COUNT(*) FROM interview_session i
                JOIN RESUME r ON i.resume_id = r.RESUME_ID
                WHERE r.MEMBER_ID = :mid2) AS "interviewCount"
        FROM DUAL
    `;
    const result = await conn.execute(
        sql,
        { mid1: id, mid2: id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0] ?? { resumeCount: 0, interviewCount: 0 };
}

/**
 * 최신 이력서 조회
 */
async function getLatestResume(memberId, conn) {
    const sql = `
        SELECT * FROM (
            SELECT
                RESUME_ID       AS "resumeId",
                RESUME_TITLE    AS "resumeTitle",
                DESIRED_JOB     AS "desiredJob",
                RESUME_STATUS   AS "resumeStatus",
                CREATE_AT       AS "createdAt",
                UPDATE_AT       AS "updatedAt"
            FROM RESUME
            WHERE MEMBER_ID = :memberId
            ORDER BY CREATE_AT DESC
        ) WHERE ROWNUM = 1
    `;
    const result = await conn.execute(
        sql,
        { memberId: Number(memberId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0] ?? null;
}

/**
 * 프로필 수정
 */
async function updateProfile(memberId, data, conn) {
    const sql = `
        UPDATE MEMBER_PROFILE
        SET
            NAME            = NVL(:name, NAME),
            PHONE           = NVL(:phone, PHONE),
            ADDRESS         = NVL(:address, ADDRESS),
            GENDER          = NVL(:gender, GENDER),
            PROFILE_IMAGE_URL = NVL(:profileImageUrl, PROFILE_IMAGE_URL),
            UPDATE_AT       = SYSDATE
        WHERE MEMBER_ID = :memberId
    `;
    return await conn.execute(sql, {
        memberId:        Number(memberId),
        name:            data.name            ?? null,
        phone:           data.phone           ?? null,
        address:         data.address         ?? null,
        gender:          data.gender          ?? null,
        profileImageUrl: data.profileImageUrl ?? null,
    });
}

module.exports = {
    create,
    findMemberWithProfile,
    getActivityCounts,
    getLatestResume,
    updateProfile,
};
