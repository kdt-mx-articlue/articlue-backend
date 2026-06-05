const authService = require("../services/auth.service");

/**
 * 회원가입
 */
async function signup(req, res) {

    try {
        const result = await authService.signup(req.body);

        return res.status(201).json({
            success: true,
            message: result.message
        });

    } catch (error) {

        console.error(error);

        // 오류
        return res.status(error.statusCode).json({
            success: false,
            message: error.statusCode ? error.message : "서버 내부 오류가 발생했습니다."
        });

    }

}

/**
 * 로그인
 */
async function login(req, res) {

    try {
        const member = {
            "memberId":req.body.memberId,
            "memberPw":req.body.password
        }

        const result = await authService.login(member);

        return res.status(error.statusCode).json({
            success: true,
            message: result.message,
            data: {
                memberId: result.memberId,
                loginId: result.loginId,
                userType: result.userType
            }
        });

    } catch (error) {
        
        console.error(error);

        // 서버 오류
        return res.status(error.statusCode).json({
            success: false,
            message: error.statusCode ? error.message : "서버 내부 오류가 발생했습니다."
        });
    }

}

module.exports = { signup, login };