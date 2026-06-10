const crypto = require("crypto");

const socialSessions = new Map();
const loginSessions = new Map();

const SOCIAL_SESSION_TTL_MS = 10 * 60 * 1000;
const LOGIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function createSessionId() {
    return crypto.randomBytes(32).toString("hex");
}

function createExpiresAt(ttlMs) {
    return new Date(Date.now() + ttlMs);
}

function isExpired(session) {
    if (!session || !session.expiresAt) {
        return true;
    }

    return new Date(session.expiresAt).getTime() < Date.now();
}

function createSocialSession({ provider, accessToken, socialUser, scope }) {
    const sessionId = createSessionId();

    socialSessions.set(sessionId, {
        type: "SOCIAL_PENDING",
        provider,
        accessToken,
        socialUser,
        scope,
        createdAt: new Date(),
        expiresAt: createExpiresAt(SOCIAL_SESSION_TTL_MS),
    });

    return sessionId;
}

function getSocialSession(sessionId) {
    if (!sessionId) {
        return null;
    }

    const session = socialSessions.get(sessionId);

    if (!session) {
        return null;
    }

    if (isExpired(session)) {
        socialSessions.delete(sessionId);
        return null;
    }

    return session;
}

function deleteSocialSession(sessionId) {
    if (!sessionId) {
        return false;
    }

    return socialSessions.delete(sessionId);
}

function createLoginSession({ memberId, loginType, provider = null, role = "USER" }) {
    const sessionId = createSessionId();

    loginSessions.set(sessionId, {
        type: "LOGIN",
        memberId,
        loginType,
        provider,
        role,
        createdAt: new Date(),
        expiresAt: createExpiresAt(LOGIN_SESSION_TTL_MS),
    });

    return sessionId;
}

function getLoginSession(sessionId) {
    if (!sessionId) {
        return null;
    }

    const session = loginSessions.get(sessionId);

    if (!session) {
        return null;
    }

    if (isExpired(session)) {
        loginSessions.delete(sessionId);
        return null;
    }

    return session;
}

function deleteLoginSession(sessionId) {
    if (!sessionId) {
        return false;
    }

    return loginSessions.delete(sessionId);
}

module.exports = {
    createSocialSession,
    getSocialSession,
    deleteSocialSession,

    createLoginSession,
    getLoginSession,
    deleteLoginSession,
};