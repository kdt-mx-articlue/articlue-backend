/* ==========================================================
   V005 모의 면접 질문별 피드백
   - 답변마다 AI 가 매기던 판정·점수·피드백(turnScore)은 메모리에만 있고 버려졌다
   - 질문별 판정/점수 + 최종 리포트의 질문별 피드백(JSON)을 INTERVIEW_QA 에 저장
   QA_FEEDBACK (JSON)
     { "turnFeedback": "...",            답변 직후 채점 피드백
       "verdict": "VALID|PARTIAL|WRONG|EVASIVE|INVALID",
       "strengths": "...", "problems": "...",
       "modelAnswer": "...", "keywords": ["..."] }   최종 리포트에서 채움
   ========================================================== */

ALTER TABLE INTERVIEW_QA ADD (
    ANSWER_STATUS  VARCHAR2(20),
    QA_SCORE       NUMBER(5,2),
    QA_FEEDBACK    CLOB
);
