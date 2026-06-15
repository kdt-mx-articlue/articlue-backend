const authRepository = require("../repositories/auth.repository");
const memberProfileRepository = require("../repositories/memberProfile.repository");

const { getConnection } = require("../config/db");
const { createError } = require("../utils/error.util");

const axios = require("axios");
const env = require("../config/env");
const socialAccountRepository =
    require("../repositories/socialAccount.repository");

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

// 카카오 소셜 로그인 
async function kakaoLogin(code) {

    let conn;

    try {

        if (!code) {
            throw createError(
                "인가코드가 없습니다.",
                400
            );
        }

        conn = await getConnection();

        // 1. access token 발급
        const tokenResponse =
        await axios.post(
            "https://kauth.kakao.com/oauth/token",
            new URLSearchParams({
                grant_type: "authorization_code",
                client_id: env.kakao.restApiKey,
                client_secret: env.kakao.clientSecret,
                redirect_uri: env.kakao.redirectUri,
                code
            }),
            {
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                }
            }
        );

        const accessToken =
            tokenResponse.data.access_token;

        // 2. 카카오 회원 조회
        const userResponse =
            await axios.get(
                "https://kapi.kakao.com/v2/user/me",
                {
                    headers: {
                        Authorization:
                            `Bearer ${accessToken}`
                    }
                }
            );

        const kakaoUser =
            userResponse.data;

        const provider = "KAKAO";
        const providerUserId =
            String(kakaoUser.id);

        const email =
            kakaoUser.kakao_account?.email;

        if (!email) {
            throw createError(
                "카카오 이메일 제공 동의가 필요합니다.",
                400
            );
        }

        const nickname =
            kakaoUser.properties?.nickname ||
            "카카오회원";

        // 3. SOCIAL_ACCOUNT 조회
        let socialAccount =
            await socialAccountRepository
                .findByProviderAndProviderUserId(
                    "KAKAO",
                    providerUserId,
                    conn
                );

        let memberId;

        // 최초 로그인
        if (!socialAccount) {

            memberId =
                await authRepository.signupSocial(
                    {
                        email,
                        nickname
                    },
                    conn
                );

            await socialAccountRepository.create(
                {
                    memberId,
                    provider: "KAKAO",
                    providerUserId,
                    accessToken
                },
                conn
            );

        } else {

            memberId =
                socialAccount.memberId;

            await socialAccountRepository
                .updateToken(
                    socialAccount.socialAccountId,
                    {
                        accessToken
                    },
                    conn
                );
        }

        await conn.commit();

        const member =
            await authRepository.findById(
                memberId,
                conn
            );

        return {
            memberId:
                member.memberId,
            email:
                member.email,
            nickname:
                member.nickname,
            userType:
                member.userType,
            provider:
                "KAKAO",
            message:
                "카카오 로그인 성공"
        };

    } catch (error) {

        if (conn) {
            await conn.rollback();
        }

        throw error;

    } finally {

        if (conn) {
            await conn.close();
        }
    }
}

// 네이버 소셜 로그인
async function naverLogin(code, state) {

    let conn;

    try {

        if (!code) {
            throw createError(
                "인가코드가 없습니다.",
                400
            );
        }

        conn = await getConnection();

        // 1. access token 발급
        const tokenResponse =
        await axios.post(
            "https://nid.naver.com/oauth2.0/token",
            null,
            {
                params: {
                    grant_type: "authorization_code",
                    client_id: env.naver.clientId,
                    client_secret: env.naver.clientSecret,
                    code,
                    state
                }
            }
        );

        const accessToken =
            tokenResponse.data.access_token;

        // 2. 네이버 회원 조회
        const userResponse =
            await axios.get(
                "https://openapi.naver.com/v1/nid/me",
                {
                    headers: {
                        Authorization:
                            `Bearer ${accessToken}`
                    }
                }
            );

        const naverUser =
            userResponse.data.response;

        const provider = "NAVER";
        const providerUserId =
            String(naverUser.id);

        const email =
            naverUser.email;

        if (!email) {
            throw createError(
                "네이버 이메일 제공 동의가 필요합니다.",
                400
            );
        }

        const nickname =
            naverUser.nickname ||
            naverUser.name ||
            "네이버회원";

        // 3. SOCIAL_ACCOUNT 조회
        let socialAccount =
            await socialAccountRepository
                .findByProviderAndProviderUserId(
                    provider,
                    providerUserId,
                    conn
                );

        let memberId;

        // 최초 로그인
        if (!socialAccount) {

            memberId =
                await authRepository.signupSocial(
                    {
                        email,
                        nickname
                    },
                    conn
                );

            await socialAccountRepository.create(
                {
                    memberId,
                    provider,
                    providerUserId,
                    accessToken
                },
                conn
            );

        } else {

            memberId =
                socialAccount.memberId;

            await socialAccountRepository
                .updateToken(
                    socialAccount.socialAccountId,
                    {
                        accessToken
                    },
                    conn
                );
        }

        await conn.commit();

        const member =
            await authRepository.findById(
                memberId,
                conn
            );

        return {
            memberId:
                member.memberId,
            email:
                member.email,
            nickname:
                member.nickname,
            userType:
                member.userType,
            provider:
                "NAVER",
            message:
                "네이버 로그인 성공"
        };

    } catch (error) {

        console.log(error.response?.data);

        if (conn) {
            await conn.rollback();
        }

        throw error;

    } finally {

        if (conn) {
            await conn.close();
        }
    }
}

module.exports = { signup, login, kakaoLogin, naverLogin };