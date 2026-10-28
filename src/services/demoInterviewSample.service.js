const { oracledb, getConnection } = require("../config/db");
const { isDemoMember } = require("./interviewQuota.service");
const { REPORT_CATEGORY_KEYS, pickSample } = require("../data/demoInterviewSamples");

/**
 * 체험 계정 샘플 면접 기록
 *
 * 체험 계정의 이력서 분석이 끝나면 매칭 상위 3개 기업에 직군별 샘플 면접(질문별 피드백·리포트 포함)을 넣는다.
 * - LLM 호출 없음 (src/data/demoInterviewSamples.js 복사)
 * - IS_SAMPLE = 'Y' → 모의 면접 이용 횟수에서 제외. 체험 계정은 다른 기업으로 직접 면접도 볼 수 있음
 * - 이미 샘플이 있으면 다시 넣지 않음 (이력서 재분석 시 중복 방지)
 */
const SAMPLE_COMPANY_COUNT = 3;

// 순위별로 점수를 조금씩 달리해 세 기록이 똑같아 보이지 않게 함
const RANK_SCORE_OFFSET = [4, 0, -5];

function clampScore(value) {
    return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function fill(text, companyName) {
    return String(text || "").split("{company}").join(companyName);
}

async function findMemberByResume(conn, resumeId) {
    const result = await conn.execute(
        `
        SELECT m.MEMBER_ID AS "memberId", m.LOGIN_ID AS "loginId", m.EMAIL AS "email",
               (SELECT COUNT(*) FROM INTERVIEW_SESSION s JOIN RESUME r2 ON r2.RESUME_ID = s.RESUME_ID
                 WHERE r2.MEMBER_ID = m.MEMBER_ID AND s.IS_SAMPLE = 'Y') AS "sampleCount"
          FROM RESUME r JOIN MEMBER m ON m.MEMBER_ID = r.MEMBER_ID
         WHERE r.RESUME_ID = :resumeId
        `,
        { resumeId: Number(resumeId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0] || null;
}

async function findCompanyNames(conn, jobPostingIds) {
    const binds = {};
    const placeholders = jobPostingIds.map((id, index) => {
        binds[`id${index}`] = id;
        return `:id${index}`;
    });

    const result = await conn.execute(
        `
        SELECT jp.JOB_POSTING_ID AS "jobPostingId", c.COMPANY_NAME AS "companyName", jp.JOB_NAME AS "jobName"
          FROM JOB_POSTING jp JOIN COMPANY c ON c.COMPANY_ID = jp.COMPANY_ID
         WHERE jp.JOB_POSTING_ID IN (${placeholders.join(", ")})
        `,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return new Map(result.rows.map((row) => [row.jobPostingId, row]));
}

async function insertSampleSession(conn, { resumeId, posting, desiredJob, sample, rankIndex }) {
    const offset = RANK_SCORE_OFFSET[rankIndex] ?? 0;
    const companyName = posting.companyName;
    const hoursAgo = (rankIndex + 1) * 3;

    const sessionResult = await conn.execute(
        `
        INSERT INTO INTERVIEW_SESSION (
            INTERVIEW_SESSION_ID, RESUME_ID, JOB_POSTING_ID, INTERVIEW_TITLE, INTERVIEW_TYPE, INTERVIEW_FORMAT,
            ATTEMPT_NO, APPLY_INDUSTRY, APPLY_JOB, INTERVIEW_LEVEL, START_TIME, END_TIME, SESSION_STATUS,
            TOTAL_QUESTION_COUNT, TOTAL_ANSWER_COUNT, IS_SAMPLE
        ) VALUES (
            SEQ_INTERVIEW_SESSION.NEXTVAL, :resumeId, :jobPostingId, :title, 'GENERAL', 'ONE_TO_ONE',
            1, NULL, :applyJob, 'NORMAL', SYSDATE - :startOffset, SYSDATE - :endOffset, 'COMPLETED',
            :count, :count, 'Y'
        )
        RETURNING INTERVIEW_SESSION_ID INTO :sessionId
        `,
        {
            resumeId: Number(resumeId),
            jobPostingId: posting.jobPostingId,
            title: `[샘플] ${companyName} 모의 면접`,
            applyJob: desiredJob || null,
            startOffset: (hoursAgo + 0.3) / 24,
            endOffset: hoursAgo / 24,
            count: sample.questions.length,
            sessionId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        }
    );

    const sessionId = sessionResult.outBinds.sessionId[0];

    for (const [index, qa] of sample.questions.entries()) {
        const minutesAgo = hoursAgo * 60 - index * 5;
        await conn.execute(
            `
            INSERT INTO INTERVIEW_QA (
                INTERVIEW_QA_ID, INTERVIEW_SESSION_ID, PARENT_QA_ID, QUESTION_ORDER, QUESTION_TYPE, INTERVIEWER_ROLE,
                QUESTION_CONTENT, ANSWER_CONTENT, FOLLOW_UP_YN, QUESTION_CREATED_AT, ANSWERED_AT,
                ANSWER_STATUS, QA_SCORE, QA_FEEDBACK
            ) VALUES (
                SEQ_INTERVIEW_QA.NEXTVAL, :sessionId, NULL, :questionOrder, 'TECH', :role,
                :question, :answer, 'N', SYSDATE - :askedOffset, SYSDATE - :answeredOffset,
                :status, :score, :feedback
            )
            `,
            {
                sessionId,
                questionOrder: index + 1,
                role: index % 2 === 0 ? "실무면접관" : "기술면접관",
                question: fill(qa.question, companyName),
                answer: fill(qa.answer, companyName),
                askedOffset: minutesAgo / 1440,
                answeredOffset: (minutesAgo - 2) / 1440,
                status: qa.status,
                score: clampScore(qa.score + offset),
                feedback: {
                    val: JSON.stringify({ ...qa.feedback, verdict: qa.status }),
                    type: oracledb.CLOB,
                },
            }
        );
    }

    const s = sample.report.scores;
    const scores = {
        logic: clampScore(s.logic + offset),
        tech: clampScore(s.tech + offset),
        business: clampScore(s.business + offset),
        evidence: clampScore(s.evidence + offset),
        jobFit: clampScore(s.jobFit + offset),
    };
    const total = clampScore((scores.logic + scores.tech + scores.business + scores.evidence + scores.jobFit) / 5);

    const types = ["SUMMARY", "STRENGTH", "WEAKNESS", "OVERALL", ...REPORT_CATEGORY_KEYS];

    for (const [index, feedbackType] of types.entries()) {
        await conn.execute(
            `
            INSERT INTO INTERVIEW_REPORT (
                INTERVIEW_REPORT_ID, INTERVIEW_SESSION_ID, LOGIC_SCORE, TECH_UNDERSTANDING_SCORE, BUSINESS_LINK_SCORE,
                EVIDENCE_SCORE, JOB_FIT_SCORE, TOTAL_SCORE, FEEDBACK_CONTENT, FEEDBACK_TYPE, DISPLAY_ORDER, CREATED_DATE
            ) VALUES (
                SEQ_INTERVIEW_REPORT.NEXTVAL, :sessionId, :logic, :tech, :business,
                :evidence, :jobFit, :total, :content, :type, :displayOrder, SYSDATE
            )
            `,
            {
                sessionId,
                ...scores,
                total,
                content: fill(sample.report.items[feedbackType], companyName),
                type: feedbackType,
                displayOrder: index + 1,
            }
        );
    }

    return sessionId;
}

/**
 * 이력서 분석 직후 호출 — 체험 계정이고 샘플이 없을 때만 매칭 상위 3개 기업에 샘플 면접 생성
 * 실패해도 이력서 분석 결과에는 영향 없음 (호출 측에서 catch)
 */
async function ensureDemoSamples({ resumeId, desiredJob, recommendations }) {
    const conn = await getConnection();

    try {
        const member = await findMemberByResume(conn, resumeId);

        if (!member || !isDemoMember(member) || Number(member.sampleCount) > 0) {
            return { created: 0 };
        }

        const topJobIds = [...(recommendations || [])]
            .filter((rec) => rec.jobPostingId)
            .sort((a, b) => (a.recommendRank ?? 9999) - (b.recommendRank ?? 9999))
            .slice(0, SAMPLE_COMPANY_COUNT)
            .map((rec) => Number(rec.jobPostingId));

        if (topJobIds.length === 0) {
            return { created: 0 };
        }

        const postings = await findCompanyNames(conn, topJobIds);
        const sample = pickSample(desiredJob);
        const sessionIds = [];

        for (const [rankIndex, jobPostingId] of topJobIds.entries()) {
            const posting = postings.get(jobPostingId);
            if (!posting) continue;
            sessionIds.push(await insertSampleSession(conn, { resumeId, posting, desiredJob, sample, rankIndex }));
        }

        await conn.commit();

        console.log(`[DemoSample] resume=${resumeId} 샘플 면접 ${sessionIds.length}건 생성 (${sessionIds.join(", ")})`);
        return { created: sessionIds.length, sessionIds };

    } catch (error) {
        await conn.rollback();
        throw error;

    } finally {
        await conn.close();
    }
}

module.exports = {
    ensureDemoSamples,
};
