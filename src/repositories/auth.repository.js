const oracledb = require("oracledb");

/**
 * 회원가입
 */
async function signup(member, conn) {

    const sql = `
        INSERT INTO MEMBER(
            MEMBER_ID,
            LOGIN_ID,
            PASSWORD,
            EMAIL,
            NICKNAME,
            USER_TYPE,
            CREATE_AT,
            UPDATE_AT
        )
        VALUES(
            SEQ_MEMBER.NEXTVAL,
            :loginId,
            :password,
            :email,
            :nickname,
            'COMMON',
            SYSDATE,
            NULL
        )
        RETURNING MEMBER_ID INTO :memberId`;

    const result = await conn.execute(
        sql,
        {
            loginId: member.loginId,
            password: member.password,
            email: member.email,
            nickname: member.nickname,

            memberId: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER
            }
        }
    );

    return result.outBinds.memberId[0];
}

/**
 * 아이디 중복 확인
 */
async function findByLoginId(loginId, conn) {

    const sql = `
        SELECT
            MEMBER_ID,
            LOGIN_ID
        FROM MEMBER
        WHERE LOGIN_ID = :loginId
    `;

    const result = await conn.execute(sql, { loginId });

    return result.rows;
}

/**
 * 이메일 중복 확인
 */
async function findByEmail(email, conn) {

    const sql = `
        SELECT
            MEMBER_ID,
            EMAIL
        FROM MEMBER
        WHERE EMAIL = :email
    `;

    const result = await conn.execute(sql, { email });

    return result.rows;
}

/**
 * 로그인
 */
async function login(loginId, conn) {

    const sql = `
        SELECT
            MEMBER_ID AS "memberId",
            LOGIN_ID AS "loginId",
            PASSWORD AS "password",
            USER_TYPE AS "userType"
        FROM MEMBER
        WHERE LOGIN_ID = :loginId
    `;

    const result = await conn.execute(sql, { loginId });

    return result.rows[0];
}

/**
 * 소셜 로그인 회원 생성
 */
async function signupSocial(member, conn) {

    const sql = `
        INSERT INTO MEMBER(
            MEMBER_ID,
            LOGIN_ID,
            PASSWORD,
            EMAIL,
            NICKNAME,
            USER_TYPE,
            CREATE_AT,
            UPDATE_AT
        )
        VALUES(
            SEQ_MEMBER.NEXTVAL,
            NULL,
            NULL,
            :email,
            :nickname,
            'COMMON',
            SYSDATE,
            NULL
        )
        RETURNING MEMBER_ID INTO :memberId
    `;

    const result = await conn.execute(
        sql,
        {
            email: member.email,
            nickname: member.nickname,

            memberId: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER
            }
        }
    );

    return result.outBinds.memberId[0];
}

async function findById(memberId, conn) {

    const sql = `
        SELECT
            MEMBER_ID AS "memberId",
            EMAIL AS "email",
            NICKNAME AS "nickname",
            USER_TYPE AS "userType"
        FROM MEMBER
        WHERE MEMBER_ID = :memberId
    `;

    const result = await conn.execute(
        sql,
        { memberId },
        {
            outFormat: oracledb.OUT_FORMAT_OBJECT
        }
    );

    return result.rows[0];
}

module.exports = {
    // 자사 회원가입, 로그인
    signup,
    findByLoginId,
    findByEmail,
    login,
    // 소셜 로그인
    signupSocial,
    findById
};