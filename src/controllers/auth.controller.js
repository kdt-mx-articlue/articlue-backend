const authService = require("../services/auth.service");

/**
 * 회원가입
 */
async function signup(req, res) {

    try {

        const result =
            await authService.signup(
                req.body
            );

        return res.status(201).json({
            success: true,
            message: result.message
        });

    } catch (error) {

        console.error(error);

        // 사용자가 잘못 입력한 경우
        if (error.statusCode === 400) {

            return res.status(400).json({
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

module.exports = {
    signup
};


/**
 * 로그인
 */
async function login(req, res) {

    try {

        const result =
            await authService.login(
                req.body
            );

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
        if (

            error.message === "아이디를 입력하세요." ||
            error.message === "비밀번호를 입력하세요." ||
            error.message === "아이디 또는 비밀번호가 올바르지 않습니다."

        ) {

            return res.status(400).json({
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

module.exports = {
    login
};