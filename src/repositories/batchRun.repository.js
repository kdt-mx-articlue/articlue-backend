const { oracledb } = require("../config/db");

/**
 * BATCH_RUN 실행 이력
 *
 * STATUS: RUNNING → SUCCESS | PARTIAL(일부 소스 실패) | FAILED
 * TRIGGER_TYPE: SCHEDULE(정기) | CATCHUP(기동 시 밀린 실행) | MANUAL(관리자 버튼)
 */

async function createRun({ jobName, triggerType }, conn) {
    const result = await conn.execute(
        `
        INSERT INTO BATCH_RUN (RUN_ID, JOB_NAME, TRIGGER_TYPE, STATUS, STARTED_AT)
        VALUES (SEQ_BATCH_RUN.NEXTVAL, :jobName, :triggerType, 'RUNNING', SYSDATE)
        RETURNING RUN_ID INTO :runId
        `,
        {
            jobName,
            triggerType,
            runId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: true }
    );

    return result.outBinds.runId[0];
}

async function finishRun({ runId, status, summary = null, errorMessage = null }, conn) {
    await conn.execute(
        `
        UPDATE BATCH_RUN
           SET STATUS = :status,
               FINISHED_AT = SYSDATE,
               SUMMARY = :summary,
               ERROR_MESSAGE = :errorMessage
         WHERE RUN_ID = :runId
           AND STATUS = 'RUNNING'
        `,
        {
            runId,
            status,
            summary: summary ? JSON.stringify(summary) : null,
            errorMessage: errorMessage ? String(errorMessage).slice(0, 4000) : null,
        },
        { autoCommit: true }
    );
}

/**
 * 이전 프로세스에서 RUNNING 으로 남은 실행을 FAILED 로 정리
 * (배치는 백엔드 자식 프로세스로 돌기 때문에 컨테이너 재시작 시 함께 종료됨)
 */
async function failOrphanRuns(conn) {
    const result = await conn.execute(
        `
        UPDATE BATCH_RUN
           SET STATUS = 'FAILED',
               FINISHED_AT = SYSDATE,
               ERROR_MESSAGE = '서버 재시작으로 실행이 중단되었습니다.'
         WHERE STATUS = 'RUNNING'
        `,
        {},
        { autoCommit: true }
    );

    return result.rowsAffected || 0;
}

/**
 * 마지막 정상 완료(SUCCESS/PARTIAL) 시각 — 기동 시 밀린 실행 판단용
 */
async function findLastCompletedAt(jobName, conn) {
    const result = await conn.execute(
        `
        SELECT MAX(STARTED_AT) AS "lastCompletedAt"
          FROM BATCH_RUN
         WHERE JOB_NAME = :jobName
           AND STATUS IN ('SUCCESS', 'PARTIAL')
        `,
        { jobName },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0]?.lastCompletedAt || null;
}

async function findRecentRuns(limit, conn) {
    const result = await conn.execute(
        `
        SELECT *
          FROM (
                SELECT RUN_ID        AS "runId",
                       JOB_NAME      AS "jobName",
                       TRIGGER_TYPE  AS "triggerType",
                       STATUS        AS "status",
                       STARTED_AT    AS "startedAt",
                       FINISHED_AT   AS "finishedAt",
                       SUMMARY       AS "summary",
                       ERROR_MESSAGE AS "errorMessage"
                  FROM BATCH_RUN
                 ORDER BY RUN_ID DESC
               )
         WHERE ROWNUM <= :limit
        `,
        { limit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => ({
        ...row,
        summary: row.summary ? safeJsonParse(row.summary) : null,
    }));
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

module.exports = {
    createRun,
    finishRun,
    failOrphanRuns,
    findLastCompletedAt,
    findRecentRuns,
};
