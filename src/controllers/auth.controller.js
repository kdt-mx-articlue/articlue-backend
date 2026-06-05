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

        // 클라이언트 오류
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });

        }

        // 서버 오류
        return res.status(500).json({
            success: false,
            message: "서버 내부 오류가 발생했습니다."
        });

    }

}

/**
 * 로그인
 */
async function login(req, res) {

    try {
        console.log("바디", req.body);
        const result = await authService.login(req.body);

        return res.status(200).json({
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

        // 사용자 입력 오류
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });

        }

        // 서버 오류
        return res.status(500).json({
            success: false,
            message: "서버 내부 오류가 발생했습니다."
        });

    }

}

module.exports = { signup, login };