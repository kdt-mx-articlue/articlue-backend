/**
 * 소셜 계정 조회
 */
async function findByProviderAndProviderUserId(
    provider,
    providerUserId,
    conn
) {

    const sql = `
        SELECT
            SOCIAL_ACCOUNT_ID AS "socialAccountId",
            MEMBER_ID AS "memberId",
            PROVIDER AS "provider",
            PROVIDER_USER_ID AS "providerUserId",
            ACCESS_TOKEN AS "accessToken",
            REFRESH_TOKEN AS "refreshToken",
            EXPIRES_AT AS "expiresAt",
            CONNECTED_AT AS "connectedAt"
        FROM SOCIAL_ACCOUNT
        WHERE PROVIDER = :provider
          AND PROVIDER_USER_ID = :providerUserId
    `;

    const result = await conn.execute(
        sql,
        {
            provider,
            providerUserId
        },
        {
            outFormat: require("oracledb").OUT_FORMAT_OBJECT
        }
    );

    return result.rows[0];
}

/**
 * 회원 기준 소셜 계정 조회
 */
async function findByMemberId(
    memberId,
    conn
) {

    const sql = `
        SELECT
            SOCIAL_ACCOUNT_ID AS "socialAccountId",
            MEMBER_ID AS "memberId",
            PROVIDER AS "provider",
            PROVIDER_USER_ID AS "providerUserId"
        FROM SOCIAL_ACCOUNT
        WHERE MEMBER_ID = :memberId
    `;

    const result = await conn.execute(
        sql,
        { memberId },
        {
            outFormat: require("oracledb").OUT_FORMAT_OBJECT
        }
    );

    return result.rows;
}

/**
 * 소셜 계정 생성
 */
async function create(
    socialAccount,
    conn
) {

    const sql = `
        INSERT INTO SOCIAL_ACCOUNT (
            SOCIAL_ACCOUNT_ID,
            MEMBER_ID,
            PROVIDER,
            PROVIDER_USER_ID,
            ACCESS_TOKEN,
            REFRESH_TOKEN,
            EXPIRES_AT,
            CONNECTED_AT
        )
        VALUES (
            SEQ_SOCIAL_ACCOUNT.NEXTVAL,
            :memberId,
            :provider,
            :providerUserId,
            :accessToken,
            :refreshToken,
            :expiresAt,
            SYSDATE
        )
    `;

    await conn.execute(
        sql,
        {
            memberId: socialAccount.memberId,
            provider: socialAccount.provider,
            providerUserId: socialAccount.providerUserId,
            accessToken: socialAccount.accessToken || null,
            refreshToken: socialAccount.refreshToken || null,
            expiresAt: socialAccount.expiresAt || null
        }
    );
}

/**
 * 토큰 정보 수정
 */
async function updateToken(
    socialAccountId,
    socialAccount,
    conn
) {

    const sql = `
        UPDATE SOCIAL_ACCOUNT
           SET ACCESS_TOKEN = :accessToken,
               REFRESH_TOKEN = :refreshToken,
               EXPIRES_AT = :expiresAt,
               LAST_REFRESH_AT = SYSDATE
         WHERE SOCIAL_ACCOUNT_ID = :socialAccountId
    `;

    await conn.execute(
        sql,
        {
            socialAccountId,
            accessToken: socialAccount.accessToken || null,
            refreshToken: socialAccount.refreshToken || null,
            expiresAt: socialAccount.expiresAt || null
        }
    );
}

module.exports = {
    findByProviderAndProviderUserId,
    findByMemberId,
    create,
    updateToken
};