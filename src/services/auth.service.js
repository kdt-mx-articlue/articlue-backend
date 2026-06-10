const authRepository = require("../repositories/auth.repository");
const memberProfileRepository = require("../repositories/memberProfile.repository");

const { getConnection } = require("../config/db");
const { createError } = require("../utils/error.util");

/**
 * 회원가입
 */
async function signup(member) {

    let conn;

    try {
        // DB 연결
        conn = await getConnection();

        // 1. 필수값 검사
        if (!member.loginId) { throw createError("아이디를 입력하세요.", 400); }
        if (!member.password) { throw createError("비밀번호를 입력하세요.", 400); }
        if (!member.passwordConfirm) { throw createError("비밀번호 확인을 입력하세요.", 400); }
        if (!member.email) { throw createError("이메일을 입력하세요.", 400); }

        if (!member.name) { throw createError("이름을 입력하세요.", 400); }
        if (!member.nickname) { throw createError("닉네임을 입력하세요.", 400); }
        if (!member.phone) { throw createError("전화번호를 입력하세요.", 400); }
        if (!member.birth) { throw createError("생년월일을 입력하세요.", 400); }
        if (!member.address) { throw createError("주소를 입력하세요.", 400); }
        if (!member.gender) { throw createError("성별을 선택하세요.", 400); }
        if (!member.military) { throw createError("병역여부를 선택하세요.", 400); }

        // 1-1. 비밀번호 일치 여부
        if (member.password !== member.passwordConfirm) { throw createError("비밀번호가 일치하지 않습니다.", 400); }

        // 1-2. 비밀번호 형식 검사
        const passwordRegex = /^(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!passwordRegex.test(member.password)) { throw createError( "비밀번호 형식이 올바르지 않습니다.", 400); }

        // 2. 공백 검사
        if (member.loginId.includes(" ")) { throw createError("아이디에 공백은 사용할 수 없습니다.", 400); }

        // 3. 아이디 중복 검사
        const existLoginId =
            await authRepository.findByLoginId(member.loginId, conn);

        if (existLoginId.length > 0) { throw createError("이미 사용중인 아이디입니다.", 409); }

        // 4. 이메일 중복 검사
        const existEmail = await authRepository.findByEmail(member.email, conn);

        if (existEmail.length > 0) { throw createError("이미 사용중인 이메일입니다.", 409); }

        // 5. 회원 저장
        const memberId = await authRepository.signup(member, conn);
        // 5-1. 회원 프로필 저장
        await memberProfileRepository.create( memberId, member, conn );

        console.log()
        
        // 6. 저장 확정
        await conn.commit();

        return {
            success: true,
            message: "회원가입 성공"
        };

    } catch (error) {

        // 실패 시 전체 취소
        if (conn) {
            await conn.rollback();
        }

        throw error;

    } finally {
        // DB 연결 반납
        if (conn) {
            await conn.close();
        }

    }
}

/**
 * 로그인
 */

async function login(member) {

    let conn;

    try {
        conn = await getConnection();

        // 아이디 입력 확인
        if (!member.loginId) { throw createError("아이디를 입력하세요.", 400); }

        // 비밀번호 입력 확인
        if (!member.password) { throw createError("비밀번호를 입력하세요.", 400); }

        // 회원 조회
        const loginMember = await authRepository.login(member.loginId, conn);

        // 존재하지 않는 아이디
        if (!loginMember) { throw createError("아이디 또는 비밀번호가 올바르지 않습니다.", 400); }

        // 비밀번호 비교
        if (loginMember.password !== member.password) { throw createError("아이디 또는 비밀번호가 올바르지 않습니다.", 400); }

        return {
            memberId:
                loginMember.memberId,

            loginId:
                loginMember.loginId,

            userType:
                loginMember.userType,

            message:
                "로그인 성공"
        };

    } finally {
        if (conn) {
            await conn.close();
        }
    }

}

module.exports = { signup, login };