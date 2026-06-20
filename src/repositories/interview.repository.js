const oracledb = require("oracledb");

async function createSession(conn, data) {
    const sql = `
        INSERT INTO interview_session (
            interview_session_id,
            resume_id,
            job_posting_id,
            portfolio_id,
            interview_title,
            interview_type,
            interview_format,
            attempt_no,
            apply_industry,
            apply_job,
            interview_level,
            start_time,
            end_time,
            session_status,
            total_question_count,
            total_answer_count
        ) VALUES (
            seq_interview_session.NEXTVAL,
            :resumeId,
            :jobPostingId,
            :portfolioId,
            :interviewTitle,
            :interviewType,
            :interviewFormat,
            :attemptNo,
            :applyIndustry,
            :applyJob,
            :interviewLevel,
            SYSDATE,
            NULL,
            :sessionStatus,
            0,
            0
        )
        RETURNING interview_session_id INTO :interviewSessionId
    `;

    const result = await conn.execute(
        sql,
        {
            resumeId: data.resumeId,
            jobPostingId: data.jobPostingId,
            portfolioId: data.portfolioId,
            interviewTitle: data.interviewTitle,
            interviewType: data.interviewType,
            interviewFormat: data.interviewFormat,
            attemptNo: data.attemptNo,
            applyIndustry: data.applyIndustry,
            applyJob: data.applyJob,
            interviewLevel: data.interviewLevel,
            sessionStatus: data.sessionStatus,
            interviewSessionId: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        },
        { autoCommit: false }
    );

    return result.outBinds.interviewSessionId[0];
}

async function findSessionById(conn, interviewSessionId) {
    const sql = `
        SELECT
            interview_session_id AS "interviewSessionId",
            resume_id AS "resumeId",
            job_posting_id AS "jobPostingId",
            portfolio_id AS "portfolioId",
            interview_title AS "interviewTitle",
            interview_type AS "interviewType",
            interview_format AS "interviewFormat",
            attempt_no AS "attemptNo",
            apply_industry AS "applyIndustry",
            apply_job AS "applyJob",
            interview_level AS "interviewLevel",
            session_status AS "sessionStatus",
            total_question_count AS "totalQuestionCount",
            total_answer_count AS "totalAnswerCount"
        FROM interview_session
        WHERE interview_session_id = :interviewSessionId
    `;

    const result = await conn.execute(
        sql,
        { interviewSessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0] || null;
}

async function findNextAttemptNo(conn, resumeId, jobPostingId) {
    const sql = `
        SELECT NVL(MAX(attempt_no), 0) + 1 AS "nextAttemptNo"
        FROM interview_session
        WHERE resume_id = :resumeId
          AND job_posting_id = :jobPostingId
    `;

    const result = await conn.execute(
        sql,
        { resumeId, jobPostingId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0]?.nextAttemptNo || 1;
}

async function findNextQuestionOrder(conn, interviewSessionId) {
    const sql = `
        SELECT NVL(MAX(question_order), 0) + 1 AS "nextQuestionOrder"
        FROM interview_qa
        WHERE interview_session_id = :interviewSessionId
    `;

    const result = await conn.execute(
        sql,
        { interviewSessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0]?.nextQuestionOrder || 1;
}

async function createQa(conn, data) {
    const sql = `
        INSERT INTO interview_qa (
            interview_qa_id,
            interview_session_id,
            parent_qa_id,
            question_order,
            question_type,
            interviewer_role,
            question_content,
            answer_content,
            follow_up_yn,
            question_created_at,
            answered_at
        ) VALUES (
            seq_interview_qa.NEXTVAL,
            :interviewSessionId,
            :parentQaId,
            :questionOrder,
            :questionType,
            :interviewerRole,
            :questionContent,
            NULL,
            :followUpYn,
            SYSDATE,
            NULL
        )
        RETURNING interview_qa_id INTO :interviewQaId
    `;

    const result = await conn.execute(
        sql,
        {
            interviewSessionId: data.interviewSessionId,
            parentQaId: data.parentQaId,
            questionOrder: data.questionOrder,
            questionType: data.questionType,
            interviewerRole: data.interviewerRole,
            questionContent: data.questionContent,
            followUpYn: data.followUpYn,
            interviewQaId: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        },
        { autoCommit: false }
    );

    return result.outBinds.interviewQaId[0];
}

async function updateAnswer(conn, interviewSessionId, interviewQaId, answerContent) {
    const sql = `
        UPDATE interview_qa
        SET
            answer_content = :answerContent,
            answered_at = SYSDATE
        WHERE interview_session_id = :interviewSessionId
          AND interview_qa_id = :interviewQaId
    `;

    const result = await conn.execute(
        sql,
        {
            interviewSessionId,
            interviewQaId,
            answerContent,
        },
        { autoCommit: false }
    );

    return result.rowsAffected || 0;
}

async function incrementQuestionCount(conn, interviewSessionId) {
    const sql = `
        UPDATE interview_session
        SET total_question_count = NVL(total_question_count, 0) + 1
        WHERE interview_session_id = :interviewSessionId
    `;

    await conn.execute(sql, { interviewSessionId }, { autoCommit: false });
}

async function incrementAnswerCount(conn, interviewSessionId) {
    const sql = `
        UPDATE interview_session
        SET total_answer_count = NVL(total_answer_count, 0) + 1
        WHERE interview_session_id = :interviewSessionId
    `;

    await conn.execute(sql, { interviewSessionId }, { autoCommit: false });
}

async function findQaById(conn, interviewSessionId, interviewQaId) {
    const sql = `
        SELECT
            interview_qa_id AS "interviewQaId",
            interview_session_id AS "interviewSessionId",
            parent_qa_id AS "parentQaId",
            question_order AS "questionOrder",
            question_type AS "questionType",
            interviewer_role AS "interviewerRole",
            DBMS_LOB.SUBSTR(question_content, 4000, 1) AS "questionContent",
            DBMS_LOB.SUBSTR(answer_content, 4000, 1) AS "answerContent",
            follow_up_yn AS "followUpYn"
        FROM interview_qa
        WHERE interview_session_id = :interviewSessionId
          AND interview_qa_id = :interviewQaId
    `;

    const result = await conn.execute(
        sql,
        { interviewSessionId, interviewQaId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0] || null;
}

async function findQasBySessionId(conn, interviewSessionId) {
    const sql = `
        SELECT
            interview_qa_id AS "interviewQaId",
            interview_session_id AS "interviewSessionId",
            parent_qa_id AS "parentQaId",
            question_order AS "questionOrder",
            question_type AS "questionType",
            interviewer_role AS "interviewerRole",
            DBMS_LOB.SUBSTR(question_content, 4000, 1) AS "questionContent",
            DBMS_LOB.SUBSTR(answer_content, 4000, 1) AS "answerContent",
            follow_up_yn AS "followUpYn",
            question_created_at AS "questionCreatedAt",
            answered_at AS "answeredAt"
        FROM interview_qa
        WHERE interview_session_id = :interviewSessionId
        ORDER BY question_order
    `;

    const result = await conn.execute(
        sql,
        { interviewSessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows;
}

async function insertReportItem(conn, data) {
    const sql = `
        INSERT INTO interview_report (
            interview_report_id,
            interview_session_id,
            logic_score,
            tech_understanding_score,
            business_link_score,
            evidence_score,
            job_fit_score,
            total_score,
            feedback_content,
            feedback_type,
            display_order,
            created_date
        ) VALUES (
            seq_interview_report.NEXTVAL,
            :interviewSessionId,
            :logicScore,
            :techUnderstandingScore,
            :businessLinkScore,
            :evidenceScore,
            :jobFitScore,
            :totalScore,
            :feedbackContent,
            :feedbackType,
            :displayOrder,
            SYSDATE
        )
    `;

    await conn.execute(
        sql,
        {
            interviewSessionId: data.interviewSessionId,
            logicScore: data.logicScore,
            techUnderstandingScore: data.techUnderstandingScore,
            businessLinkScore: data.businessLinkScore,
            evidenceScore: data.evidenceScore,
            jobFitScore: data.jobFitScore,
            totalScore: data.totalScore,
            feedbackContent: data.feedbackContent,
            feedbackType: data.feedbackType,
            displayOrder: data.displayOrder,
        },
        { autoCommit: false }
    );
}

async function completeSession(conn, interviewSessionId) {
    const sql = `
        UPDATE interview_session
        SET
            session_status = 'COMPLETED',
            end_time = SYSDATE
        WHERE interview_session_id = :interviewSessionId
    `;

    await conn.execute(sql, { interviewSessionId }, { autoCommit: false });
}

module.exports = {
    createSession,
    findSessionById,
    findNextAttemptNo,
    findNextQuestionOrder,
    createQa,
    updateAnswer,
    incrementQuestionCount,
    incrementAnswerCount,
    findQaById,
    findQasBySessionId,
    insertReportItem,
    completeSession,
};