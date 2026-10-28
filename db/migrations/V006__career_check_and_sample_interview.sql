/* ==========================================================
   V006 경력 요건 판정 + 체험 계정 샘플 면접
   - COMPANY_RECOMMENDATION: 공고 요구 경력이 이력서 경력 + 2년을 넘으면 CAREER_MISMATCH_YN = 'Y'
     (AI 가 점수를 크게 감점하고, 화면에 "경력 요건 미달 (요구 N년 / 보유 M년)" 표시)
   - INTERVIEW_SESSION.IS_SAMPLE: 체험 계정에 미리 넣는 샘플 면접 기록 (이용 횟수에서 제외)
   ========================================================== */

ALTER TABLE COMPANY_RECOMMENDATION ADD (
    CAREER_MISMATCH_YN     CHAR(1),
    REQUIRED_CAREER_YEARS  NUMBER(3),
    RESUME_CAREER_YEARS    NUMBER(4,1)
);

ALTER TABLE INTERVIEW_SESSION ADD (
    IS_SAMPLE  CHAR(1) DEFAULT 'N' NOT NULL
);
