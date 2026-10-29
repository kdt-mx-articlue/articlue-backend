const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getConnection } = require("../config/db");

/**
 * 로그인 세션 (httpOnly 쿠키에 담은 JWT)
 *
 * - 로그인(아이디·카카오·네이버) 성공 시 issueSession 으로 쿠키 발급, 로그아웃 시 clearSession
 * - 회원 데이터 API 는 requireAuth 를 거쳐 req.memberId 만 믿는다 (화면이 보낸 memberId 는 무시)
 * - 이력서·면접·자소서 ID 를 받는 API 는 ownsResume 등으로 본인 데이터인지 확인한다
 *
 * JWT_SECRET 이 없으면 기동할 때마다 임시 키를 만든다 (재시작하면 다시 로그인 필요).
 */
const SESSION_COOKIE = "articlue_session";
const SESSION_DAYS = 7; // 프론트 LOGIN_EXPIRE_DAYS 와 같게

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.JWT_SECRET) {
    console.warn("[Auth] JWT_SECRET 이 없어 임시 키를 사용합니다. 서버를 재시작하면 모두 다시 로그인해야 합니다.");
}

// https 로 공개된 경우에만 Secure 쿠키 (로컬 http://localhost 에서도 로그인되도록)
const COOKIE_SECURE = String(process.env.CORS_ORIGINS || "").split(",")[0].trim().startsWith("https://");

function cookieOptions() {
    return {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: "lax",
        path: "/",
    };
}

function issueSession(res, memberId) {
    const token = jwt.sign({ sub: String(memberId) }, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });

    res.cookie(SESSION_COOKIE, token, {
        ...cookieOptions(),
        maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
}

function clearSession(res) {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function unauthorized(res) {
    return res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "로그인이 필요합니다. 다시 로그인해 주세요.",
    });
}

function notFound(res) {
    // 남의 데이터인지 여부를 알려 주지 않도록 없는 것과 같은 응답
    return res.status(404).json({ success: false, message: "요청한 정보를 찾을 수 없습니다." });
}

function requireAuth(req, res, next) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return unauthorized(res);

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const memberId = Number(payload.sub);
        if (!Number.isInteger(memberId) || memberId <= 0) return unauthorized(res);

        req.memberId = memberId;
        return next();
    } catch {
        return unauthorized(res);
    }
}

/**
 * 소유권 확인 미들웨어 생성
 * @param sql   :id, :memberId 를 받아 본인 데이터면 1행을 돌려주는 쿼리
 * @param pick  요청에서 ID 를 꺼내는 함수 — 값이 없으면 검사하지 않음(필수값 검사는 컨트롤러 몫)
 */
function owns(sql, pick) {
    return async (req, res, next) => {
        const id = pick(req);
        if (id === undefined || id === null || id === "") return next();

        const numericId = Number(id);
        if (!Number.isInteger(numericId) || numericId <= 0) return notFound(res);

        let conn;
        try {
            conn = await getConnection();
            const result = await conn.execute(sql, { id: numericId, memberId: req.memberId });
            return result.rows.length > 0 ? next() : notFound(res);
        } catch (error) {
            return next(error);
        } finally {
            if (conn) await conn.close();
        }
    };
}

const RESUME_SQL = `
    SELECT 1 FROM RESUME
     WHERE RESUME_ID = :id AND MEMBER_ID = :memberId`;

const INTERVIEW_SESSION_SQL = `
    SELECT 1 FROM INTERVIEW_SESSION s
      JOIN RESUME r ON r.RESUME_ID = s.RESUME_ID
     WHERE s.INTERVIEW_SESSION_ID = :id AND r.MEMBER_ID = :memberId`;

const COVER_LETTER_SQL = `
    SELECT 1 FROM COVER_LETTER c
      JOIN RESUME r ON r.RESUME_ID = c.RESUME_ID
     WHERE c.COVER_LETTER_ID = :id AND r.MEMBER_ID = :memberId`;

const ownsResume = (pick) => owns(RESUME_SQL, pick);
const ownsInterviewSession = (pick) => owns(INTERVIEW_SESSION_SQL, pick);
const ownsCoverLetter = (pick) => owns(COVER_LETTER_SQL, pick);

module.exports = {
    issueSession,
    clearSession,
    requireAuth,
    ownsResume,
    ownsInterviewSession,
    ownsCoverLetter,
};
