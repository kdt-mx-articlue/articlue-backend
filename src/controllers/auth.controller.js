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
        return res.status(error.statusCode || 500).json({
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
            "loginId":req.body.loginId,
            "password":req.body.password
        }

        const result = await authService.login(member);

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

        // 서버 오류
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "서버 내부 오류가 발생했습니다."
        });
    }

}

// 카카오 로그인
async function kakaoLogin(req, res) {

    try {

        const result =
            await authService.kakaoLogin(
                req.body.code
            );

        return res.status(200).json({
            success: true,
            message: "카카오 로그인 성공",
            data: result
        });

    } catch (error) {

        console.error(error);

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message || "서버 오류"
        });
    }
}

// 네이버 로그인
async function naverLogin(req, res, next) {

    try {

        const result =
            await authService.naverLogin(
                req.query.code,
                req.query.state
            );

        res.json(result);

    } catch (error) {
        next(error);
    }
}

module.exports = { signup, login, kakaoLogin, naverLogin };