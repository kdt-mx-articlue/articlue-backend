const authRepository =
    require("../repositories/auth.repository");

const { getConnection } =
    require("../config/db");

/**
 * 회원가입
 */
async function signup(member) {

    let conn;

    try {
        // DB 연결
        conn = await getConnection();

        // =====================
        // 1. 필수값 검사
        // =====================
        if (!member.loginId) { throw new Error("아이디를 입력하세요."); }
        if (!member.password) { throw new Error("비밀번호를 입력하세요."); }
        if (!member.email) { throw new Error("이메일을 입력하세요."); }

        // =====================
        // 2. 공백 검사
        // =====================
        if (member.loginId.includes(" ")) { throw new Error("아이디에 공백은 사용할 수 없습니다."); }

        // =====================
        // 3. 아이디 중복 검사
        // =====================
        const existLoginId =
            await authRepository.findByLoginId(member.loginId, conn);

        if (existLoginId.length > 0) {
            throw new Error("이미 사용중인 아이디입니다.");
        }

        // =====================
        // 4. 이메일 중복 검사
        // =====================
        const existEmail =
            await authRepository.findByEmail(member.email, conn);

        if (existEmail.length > 0) {
            throw new Error("이미 사용중인 이메일입니다.");
        }

        // =====================
        // 5. 회원 저장
        // =====================
        await authRepository.signup(member, conn);

        // =====================
        // 6. 저장 확정
        // =====================
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
        if (!member.loginId) {
            throw new Error("아이디를 입력하세요.");
        }

        // 비밀번호 입력 확인
        if (!member.password) {
            throw new Error("비밀번호를 입력하세요.");
        }

        // 회원 조회
        const loginMember =
            await authRepository.login(member.loginId, conn);

        // 존재하지 않는 아이디
        if (!loginMember) {
            throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        // 비밀번호 비교
        if (loginMember.password !== member.password) {
            throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
        }

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