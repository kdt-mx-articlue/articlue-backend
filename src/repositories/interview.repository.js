const oracledb = require("oracledb");

// =============================================================
// CLOB 헬퍼
//
// DBMS_LOB.SUBSTR 로 SQL 안에서 잘라오면 한글 기준으로
// VARCHAR2 버퍼 한계(4000 byte)를 초과해 ORA-06502 가 발생한다.
// SQL 에서는 CLOB 컬럼을 그대로 SELECT 하고,
// node-oracledb 가 LOB 객체로 반환한 뒤 Node.js 스트림으로
// 전체를 읽어서 문자열로 변환한다.
// connection 이 살아 있는 동안(repository 함수 return 전)
// 반드시 스트림을 끝까지 읽어야 한다.
// =============================================================

/**
 * LOB 객체를 utf-8 문자열로 변환한다.
 * - null / undefined  → null 반환
 * - 이미 string 이면 그대로 반환 (작은 CLOB 은 자동으로 string 이 되기도 함)
 * - LOB 객체이면 data/end/error 이벤트로 스트림 전체를 읽는다
 */
function readLobToString(lob) {
    return new Promise((resolve, reject) => {
        if (!lob) return resolve(null);
        if (typeof lob === "string") return resolve(lob);

        let data = "";
        lob.setEncoding("utf8");
        lob.on("data",  (chunk) => { data += chunk; });
        lob.on("end",   ()      => { resolve(data); });
        lob.on("error", (err)   => { reject(err); });
    });
}

/**
 * 하나의 row 에서 지정한 필드들의 LOB → string 변환을 일괄 처리한다.
 * @param {object}   row    - oracledb OUT_FORMAT_OBJECT 한 행
 * @param {string[]} fields - LOB 일 수 있는 필드명 목록
 */
async function resolveClobRow(row, fields) {
    if (!row) return row;
    const resolved = { ...row };
    for (const field of fields) {
        if (resolved[field] !== undefined) {
            resolved[field] = await readLobToString(resolved[field]);
        }
    }
    return resolved;
}

async function createSession(conn, data) {
    const sql = `
        INSERT INTO interview_session (
            interview_session_id,
            resume_id,
            job_posting_id,
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
    // DBMS_LOB.SUBSTR 제거 → CLOB 원문 전체를 LOB 객체로 받아 Node.js 에서 변환
    const sql = `
        SELECT
            interview_qa_id      AS "interviewQaId",
            interview_session_id AS "interviewSessionId",
            parent_qa_id         AS "parentQaId",
            question_order       AS "questionOrder",
            question_type        AS "questionType",
            interviewer_role     AS "interviewerRole",
            question_content     AS "questionContent",
            answer_content       AS "answerContent",
            follow_up_yn         AS "followUpYn"
        FROM interview_qa
        WHERE interview_session_id = :interviewSessionId
          AND interview_qa_id = :interviewQaId
    `;

    const result = await conn.execute(
        sql,
        { interviewSessionId, interviewQaId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // connection 이 살아 있는 동안 LOB 스트림 전체를 읽는다
    return resolveClobRow(result.rows[0] || null, ["questionContent", "answerContent"]);
}

async function findQasBySessionId(conn, interviewSessionId) {
    // DBMS_LOB.SUBSTR 제거 → CLOB 원문 전체를 LOB 객체로 받아 Node.js 에서 변환.
    // 답변 제출 후 다음 질문 생성에 필요한 전체 Q/A 히스토리를 FastAPI 에 넘기므로
    // 문맥이 잘리면 안 된다. connection 이 살아 있는 동안 스트림을 모두 읽는다.
    const sql = `
        SELECT
            interview_qa_id      AS "interviewQaId",
            interview_session_id AS "interviewSessionId",
            parent_qa_id         AS "parentQaId",
            question_order       AS "questionOrder",
            question_type        AS "questionType",
            interviewer_role     AS "interviewerRole",
            question_content     AS "questionContent",
            answer_content       AS "answerContent",
            follow_up_yn         AS "followUpYn",
            question_created_at  AS "questionCreatedAt",
            answered_at          AS "answeredAt"
        FROM interview_qa
        WHERE interview_session_id = :interviewSessionId
        ORDER BY question_order
    `;

    const result = await conn.execute(
        sql,
        { interviewSessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // 수십 건 이하이므로 Promise.all 로 병렬 변환해도 무방하다
    return Promise.all(
        result.rows.map((row) =>
            resolveClobRow(row, ["questionContent", "answerContent"])
        )
    );
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


async function findSessionsByMemberId(conn, memberId) {
    const oracledb = require("oracledb");
    const sql = `
        SELECT
            s.interview_session_id  AS "interviewSessionId",
            s.resume_id             AS "resumeId",
            s.job_posting_id        AS "jobPostingId",
            s.interview_title       AS "interviewTitle",
            s.interview_type        AS "interviewType",
            s.interview_format      AS "interviewFormat",
            s.interview_level       AS "interviewLevel",
            s.apply_industry        AS "applyIndustry",
            s.apply_job             AS "applyJob",
            s.start_time            AS "startTime",
            s.end_time              AS "endTime",
            s.session_status        AS "sessionStatus",
            s.total_question_count  AS "totalQuestionCount",
            s.total_answer_count    AS "totalAnswerCount",
            jp.job_name             AS "jobName",
            c.company_name          AS "companyName",
            r.total_score           AS "totalScore",
            r.logic_score           AS "logicScore",
            r.tech_understanding_score AS "techUnderstandingScore",
            r.business_link_score   AS "businessLinkScore",
            r.evidence_score        AS "evidenceScore",
            r.job_fit_score         AS "jobFitScore"
        FROM interview_session s
        JOIN resume res ON s.resume_id = res.resume_id
        JOIN job_posting jp ON s.job_posting_id = jp.job_posting_id
        JOIN company c ON jp.company_id = c.company_id
        LEFT JOIN interview_report r ON s.interview_session_id = r.interview_session_id
            AND r.feedback_type = 'SUMMARY'
        WHERE res.member_id = :memberId
        ORDER BY s.start_time DESC
    `;
    const result = await conn.execute(
        sql,
        { memberId: Number(memberId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows;
}


async function findHistoryBySessionId(conn, interviewSessionId) {
    const oracledb = require("oracledb");
    const sessionSql = `
        SELECT
            s.interview_session_id  AS "interviewSessionId",
            s.resume_id             AS "resumeId",
            s.job_posting_id        AS "jobPostingId",
            s.interview_title       AS "interviewTitle",
            s.interview_type        AS "interviewType",
            s.interview_format      AS "interviewFormat",
            s.interview_level       AS "interviewLevel",
            s.apply_industry        AS "applyIndustry",
            s.apply_job             AS "applyJob",
            s.start_time            AS "startTime",
            s.end_time              AS "endTime",
            s.session_status        AS "sessionStatus",
            s.total_question_count  AS "totalQuestionCount",
            s.total_answer_count    AS "totalAnswerCount",
            jp.job_name             AS "jobName",
            c.company_name          AS "companyName"
        FROM interview_session s
        JOIN job_posting jp ON s.job_posting_id = jp.job_posting_id
        JOIN company c ON jp.company_id = c.company_id
        WHERE s.interview_session_id = :interviewSessionId
    `;
    const qaSql = `
        SELECT
            interview_qa_id         AS "interviewQaId",
            interview_session_id    AS "interviewSessionId",
            parent_qa_id            AS "parentQaId",
            question_order          AS "questionOrder",
            question_type           AS "questionType",
            interviewer_role        AS "interviewerRole",
            question_content        AS "questionContent",
            answer_content          AS "answerContent",
            follow_up_yn            AS "followUpYn",
            question_created_at     AS "questionCreatedAt",
            answered_at             AS "answeredAt"
        FROM interview_qa
        WHERE interview_session_id = :interviewSessionId
        ORDER BY question_order ASC
    `;
    const bind = { interviewSessionId: Number(interviewSessionId) };
    const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };

    const sessionResult = await conn.execute(sessionSql, bind, opts);
    const qaResult      = await conn.execute(qaSql,       bind, opts);

    const session = sessionResult.rows[0] ?? null;
    if (!session) return null;

    // qa 의 question_content, answer_content 는 CLOB 이므로 스트림 전체 변환
    session.qaList = await Promise.all(
        qaResult.rows.map((row) =>
            resolveClobRow(row, ["questionContent", "answerContent"])
        )
    );
    return session;
}

async function findReportBySessionId(conn, interviewSessionId) {
    const oracledb = require("oracledb");
    const sql = `
        SELECT
            interview_report_id         AS "interviewReportId",
            interview_session_id        AS "interviewSessionId",
            logic_score                 AS "logicScore",
            tech_understanding_score    AS "techUnderstandingScore",
            business_link_score         AS "businessLinkScore",
            evidence_score              AS "evidenceScore",
            job_fit_score               AS "jobFitScore",
            total_score                 AS "totalScore",
            feedback_content            AS "feedbackContent",
            feedback_type               AS "feedbackType",
            display_order               AS "displayOrder",
            created_date                AS "createdDate"
        FROM interview_report
        WHERE interview_session_id = :interviewSessionId
        ORDER BY display_order ASC NULLS LAST
    `;
    const result = await conn.execute(
        sql,
        { interviewSessionId: Number(interviewSessionId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // feedback_content 는 CLOB 이므로 스트림 전체 변환
    return Promise.all(
        result.rows.map((row) =>
            resolveClobRow(row, ["feedbackContent"])
        )
    );
}

module.exports = {
    findHistoryBySessionId,
    findReportBySessionId,
    findSessionsByMemberId,
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