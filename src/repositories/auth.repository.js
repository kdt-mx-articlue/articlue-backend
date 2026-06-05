const { getConnection } = require("../config/db");

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
        )`;

    return await conn.execute(
        sql,
        {
            loginId: member.loginId,
            password: member.password,
            email: member.email,
            nickname: member.nickname
        }
    );
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

module.exports = {
    signup,
    findByLoginId,
    findByEmail,
    login
};