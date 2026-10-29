/* ==========================================================
   V007 회원가입 IP 제한
   - MEMBER.SIGNUP_IP_HASH: 아이디 가입 시 접속 IP 의 SHA-256 (원본 IP 는 저장하지 않음)
   - 최근 24시간 동안 같은 IP 의 체험 계정·일반 가입 수, 전체 체험 계정 수를 세어 제한한다
     (signupLimit.service.js — DEMO_SIGNUP_IP_LIMIT / SIGNUP_IP_LIMIT / DEMO_SIGNUP_DAILY_LIMIT)
   - 소셜 로그인 가입과 기존 회원은 NULL
   ========================================================== */

ALTER TABLE MEMBER ADD (
    SIGNUP_IP_HASH  VARCHAR2(64)
);

CREATE INDEX IX_MEMBER_SIGNUP_IP ON MEMBER (SIGNUP_IP_HASH, CREATE_AT);
