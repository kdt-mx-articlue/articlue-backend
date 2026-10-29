const crypto = require("crypto");
const bcrypt = require("bcryptjs");

/**
 * 비밀번호 해시 (bcrypt)
 *
 * - 가입 시 hashPassword 결과만 MEMBER.PASSWORD 에 저장한다.
 * - 이전에 평문으로 저장된 비밀번호는 기동 시 일괄 변환하고(hashLegacyPasswords),
 *   그 전에 로그인하면 verifyPassword 가 needsRehash 를 알려 그 자리에서 변환한다.
 */
const SALT_ROUNDS = 10;

function isHashed(stored) {
    return /^\$2[aby]\$\d{2}\$/.test(String(stored || ""));
}

async function hashPassword(plain) {
    return bcrypt.hash(String(plain), SALT_ROUNDS);
}

/**
 * @returns {{ ok: boolean, needsRehash: boolean }}
 */
async function verifyPassword(plain, stored) {
    if (!stored) return { ok: false, needsRehash: false };

    if (isHashed(stored)) {
        return { ok: await bcrypt.compare(String(plain), stored), needsRehash: false };
    }

    // 평문으로 저장된 기존 비밀번호 — 길이와 무관하게 일정한 시간으로 비교
    const a = crypto.createHash("sha256").update(String(plain)).digest();
    const b = crypto.createHash("sha256").update(String(stored)).digest();
    const ok = crypto.timingSafeEqual(a, b);

    return { ok, needsRehash: ok };
}

module.exports = {
    isHashed,
    hashPassword,
    verifyPassword,
};
