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

module.exports = { create };