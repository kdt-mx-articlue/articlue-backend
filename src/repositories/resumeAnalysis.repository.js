const { oracledb } = require("../config/db");

/**
 * 같은 이력서 + 같은 분석단계의 기존 기업 추천 결과 삭제
 *
 * 사용 목적:
 * - 이력서 기반 기업 추천 분석을 다시 수행할 때
 * - 기존 추천 결과 N개와 그 하위 지표 데이터를 먼저 삭제한다.
 *
 * 삭제 기준:
 * - RESUME_ID
 * - ANALYSIS_STAGE
 *
 * 삭제 대상:
 * 1. RECOMMENDATION_ACTION
 * 2. RECOMMENDATION_METRIC_DETAIL
 * 3. COMPANY_RECOMMENDATION
 *
 * 주의:
 * - RESUME 원본 테이블은 절대 건드리지 않는다.
 * - EDUCATION, EXPERIENCE, COVER_LETTER 등 이력서 섹션도 건드리지 않는다.
 * - GENERATED_DOCUMENT, PORTFOLIO_DIAGNOSIS, ACTION_PLAN도 현재 기업추천 분석 흐름에서는 사용하지 않으므로 건드리지 않는다.
 */
async function deleteRecommendationResultsByResumeStage(
    {
        resumeId,
        analysisStage,
    },
    conn
) {
    const bind = {
        resumeId,
        analysisStage,
    };

    /*
     * 1. RECOMMENDATION_ACTION 삭제 (FK_REC_ACTION_REC)
     *
     * RECOMMENDATION_ACTION은 COMPANY_RECOMMENDATION의 자식 테이블이므로
     * 부모 삭제 전에 먼저 삭제해야 한다.
     */
    await conn.execute(
        `
        DELETE FROM RECOMMENDATION_ACTION
        WHERE RECOMMENDATION_ID IN (
            SELECT RECOMMENDATION_ID
            FROM COMPANY_RECOMMENDATION
            WHERE RESUME_ID = :resumeId
              AND ANALYSIS_STAGE = :analysisStage
        )
        `,
        bind
    );

    /*
     * 2. 추천 지표 상세 삭제
     *
     * RECOMMENDATION_METRIC_DETAIL은 COMPANY_RECOMMENDATION의 자식 테이블이므로
     * 부모인 COMPANY_RECOMMENDATION 삭제 전에 먼저 삭제해야 한다.
     */
    await conn.execute(
        `
        DELETE FROM RECOMMENDATION_METRIC_DETAIL
        WHERE RECOMMENDATION_ID IN (
            SELECT RECOMMENDATION_ID
            FROM COMPANY_RECOMMENDATION
            WHERE RESUME_ID = :resumeId
              AND ANALYSIS_STAGE = :analysisStage
        )
        `,
        bind
    );

    /*
     * 3. 기업 추천 결과 삭제
     *
     * 같은 resumeId + analysisStage 기준으로 기존 추천 결과를 삭제한다.
     * 이후 AI가 반환한 추천 N개를 다시 INSERT한다.
     */
    await conn.execute(
        `
        DELETE FROM COMPANY_RECOMMENDATION
        WHERE RESUME_ID = :resumeId
          AND ANALYSIS_STAGE = :analysisStage
        `,
        bind
    );
}

/**
 * 기업 추천 결과 생성
 *
 * 대상 테이블:
 * COMPANY_RECOMMENDATION
 *
 * 저장 단위:
 * - 추천 공고 1개당 COMPANY_RECOMMENDATION 1건
 *
 * 예:
 * - AI가 추천 공고 3개 반환 → COMPANY_RECOMMENDATION 3건
 * - AI가 추천 공고 20개 반환 → COMPANY_RECOMMENDATION 20건
 */
async function createCompanyRecommendation(data, conn) {
    const result = await conn.execute(
        `
        INSERT INTO COMPANY_RECOMMENDATION
        (
            RECOMMENDATION_ID,
            RESUME_ID,
            JOB_POSTING_ID,
            ANALYSIS_STAGE,
            OVERALL_SCORE,
            LATEST_INTERVIEW_ID,
            RECOMMEND_RANK,
            RECOMMENDED_DATE
        )
        VALUES
        (
            SEQ_COMPANY_RECOMMENDATION.NEXTVAL,
            :resumeId,
            :jobPostingId,
            :analysisStage,
            :overallScore,
            :latestInterviewId,
            :recommendRank,
            SYSDATE
        )
        RETURNING RECOMMENDATION_ID INTO :recommendationId
        `,
        {
            resumeId: data.resumeId,
            jobPostingId: data.jobPostingId,
            analysisStage: data.analysisStage,
            overallScore: data.overallScore,
            latestInterviewId: data.latestInterviewId || null,
            recommendRank: data.recommendRank || null,
            recommendationId: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        }
    );

    return result.outBinds.recommendationId[0];
}

/**
 * 추천 지표 상세 생성
 *
 * 대상 테이블:
 * RECOMMENDATION_METRIC_DETAIL
 *
 * 저장 단위:
 * - 추천 결과 1건당 방사형 지표 5건
 *
 * 고정 metricType:
 * 1. business_fit
 * 2. action_result_fit
 * 3. tech_stack_fit
 * 4. requirement_fit
 * 5. culture_fit
 */
async function createRecommendationMetricDetail(data, conn) {
    const sql = `
        INSERT INTO RECOMMENDATION_METRIC_DETAIL
        (
            RECOMMENDATION_METRIC_ID,
            RECOMMENDATION_ID,
            METRIC_TYPE,
            SCORE,
            REASON_TEXT
        )
        VALUES
        (
            SEQ_RECOMMENDATION_METRIC.NEXTVAL,
            :recommendationId,
            :metricType,
            :score,
            :reasonText
        )
    `;

    return await conn.execute(
        sql,
        {
            recommendationId: data.recommendationId,
            metricType: data.metricType,
            score: data.score,
            reasonText: data.reasonText,
        }
    );
}

/**
 * 이력서 기반 기업 추천 결과 조회
 *
 * COMPANY_RECOMMENDATION + RECOMMENDATION_METRIC_DETAIL + JOB_POSTING + COMPANY 조인
 * 결과를 recommendationId 기준으로 그룹핑하여 반환
 */
async function findRecommendationsByResume(conn, resumeId, analysisStage) {
    const sql = `
        SELECT
            cr.RECOMMENDATION_ID    AS "recommendationId",
            cr.JOB_POSTING_ID       AS "jobPostingId",
            cr.ANALYSIS_STAGE       AS "analysisStage",
            cr.OVERALL_SCORE        AS "overallScore",
            cr.RECOMMEND_RANK       AS "recommendRank",
            c.company_name          AS "companyName",
            c.industry_category     AS "industryCategory",
            jp.job_name             AS "jobName",
            jp.career_condition     AS "careerCondition",
            jp.original_url         AS "originalUrl",
            jp.deadline_date        AS "deadlineDate",
            rmd.METRIC_TYPE         AS "metricType",
            rmd.SCORE               AS "metricScore",
            rmd.REASON_TEXT         AS "reasonText"
        FROM COMPANY_RECOMMENDATION cr
        LEFT JOIN RECOMMENDATION_METRIC_DETAIL rmd ON cr.RECOMMENDATION_ID = rmd.RECOMMENDATION_ID
        LEFT JOIN job_posting jp ON cr.JOB_POSTING_ID = jp.JOB_POSTING_ID
        LEFT JOIN company c ON jp.COMPANY_ID = c.COMPANY_ID
        WHERE cr.RESUME_ID = :resumeId
          AND cr.ANALYSIS_STAGE = :analysisStage
        ORDER BY cr.RECOMMEND_RANK ASC NULLS LAST, cr.OVERALL_SCORE DESC NULLS LAST
    `;

    const result = await conn.execute(
        sql,
        { resumeId: Number(resumeId), analysisStage },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // recommendationId 기준으로 그룹핑
    const map = new Map();
    for (const row of result.rows) {
        const id = row.recommendationId;
        if (!map.has(id)) {
            map.set(id, {
                recommendationId: id,
                jobPostingId:     row.jobPostingId,
                analysisStage:    row.analysisStage,
                overallScore:     row.overallScore,
                recommendRank:    row.recommendRank,
                companyName:      row.companyName,
                industryCategory: row.industryCategory,
                jobName:          row.jobName,
                careerCondition:  row.careerCondition,
                originalUrl:      row.originalUrl,
                deadlineDate:     row.deadlineDate,
                metrics: {},
            });
        }
        if (row.metricType) {
            map.get(id).metrics[row.metricType] = {
                score:      row.metricScore,
                reasonText: row.reasonText,
            };
        }
    }

    return Array.from(map.values());
}

/**
 * 이력서 + 특정 채용공고의 매칭 결과 단건 조회
 *
 * 관심 기업 클릭 시 해당 기업의 overallScore + metrics를 DB에서 조회해
 * 카드에 표시하기 위해 사용합니다.
 */
async function findRecommendationByResumeAndJob(conn, resumeId, jobPostingId, analysisStage) {
    const sql = `
        SELECT
            cr.RECOMMENDATION_ID    AS "recommendationId",
            cr.JOB_POSTING_ID       AS "jobPostingId",
            cr.ANALYSIS_STAGE       AS "analysisStage",
            cr.OVERALL_SCORE        AS "overallScore",
            cr.RECOMMEND_RANK       AS "recommendRank",
            rmd.METRIC_TYPE         AS "metricType",
            rmd.SCORE               AS "metricScore",
            rmd.REASON_TEXT         AS "reasonText"
        FROM COMPANY_RECOMMENDATION cr
        LEFT JOIN RECOMMENDATION_METRIC_DETAIL rmd ON cr.RECOMMENDATION_ID = rmd.RECOMMENDATION_ID
        WHERE cr.RESUME_ID = :resumeId
          AND cr.JOB_POSTING_ID = :jobPostingId
          AND cr.ANALYSIS_STAGE = :analysisStage
        ORDER BY cr.OVERALL_SCORE DESC NULLS LAST
    `;

    const result = await conn.execute(
        sql,
        { resumeId: Number(resumeId), jobPostingId: Number(jobPostingId), analysisStage },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) return null;

    const first = result.rows[0];
    const rec = {
        recommendationId: first.recommendationId,
        jobPostingId:     first.jobPostingId,
        analysisStage:    first.analysisStage,
        overallScore:     first.overallScore,
        recommendRank:    first.recommendRank,
        metrics: {},
    };
    for (const row of result.rows) {
        if (row.recommendationId === rec.recommendationId && row.metricType) {
            rec.metrics[row.metricType] = {
                score:      row.metricScore,
                reasonText: row.reasonText,
            };
        }
    }
    return rec;
}


async function createPortfolioDiagnosis(data, conn) {
    const oracledb = require("oracledb");
    const sql = `
        INSERT INTO portfolio_diagnosis (
            diagnosis_id,
            resume_id,
            job_posting_id,
            diagnosis_summary,
            tech_stack_weakness,
            project_experience_weakness,
            business_result_weakness,
            domain_understanding_weakness,
            improvement_priority,
            diagnosis_date
        ) VALUES (
            SEQ_PORTFOLIO_DIAGNOSIS.NEXTVAL,
            :resumeId,
            :jobPostingId,
            :diagnosisSummary,
            :techStackWeakness,
            :projectExperienceWeakness,
            :businessResultWeakness,
            :domainUnderstandingWeakness,
            :improvementPriority,
            SYSDATE
        )
    `;
    await conn.execute(sql, {
        resumeId:                    Number(data.resumeId),
        jobPostingId:                Number(data.jobPostingId),
        diagnosisSummary:            data.diagnosisSummary            ?? null,
        techStackWeakness:           data.techStackWeakness           ?? null,
        projectExperienceWeakness:   data.projectExperienceWeakness   ?? null,
        businessResultWeakness:      data.businessResultWeakness      ?? null,
        domainUnderstandingWeakness: data.domainUnderstandingWeakness ?? null,
        improvementPriority:         data.improvementPriority         ?? null,
    }, { autoCommit: false });

    const idResult = await conn.execute(
        `SELECT SEQ_PORTFOLIO_DIAGNOSIS.CURRVAL AS "diagnosisId" FROM DUAL`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return idResult.rows[0].diagnosisId;
}

async function createActionPlan(data, conn) {
    const sql = `
        INSERT INTO action_plan (
            action_plan_id,
            diagnosis_id,
            action_plan_title,
            action_plan_summary,
            recommended_learning,
            priority,
            expected_period,
            created_date
        ) VALUES (
            SEQ_ACTION_PLAN.NEXTVAL,
            :diagnosisId,
            :actionPlanTitle,
            :actionPlanSummary,
            :recommendedLearning,
            :priority,
            :expectedPeriod,
            SYSDATE
        )
    `;
    await conn.execute(sql, {
        diagnosisId:        Number(data.diagnosisId),
        actionPlanTitle:    data.actionPlanTitle,
        actionPlanSummary:  data.actionPlanSummary   ?? null,
        recommendedLearning: data.recommendedLearning ?? null,
        priority:           data.priority             ?? null,
        expectedPeriod:     data.expectedPeriod       ?? null,
    }, { autoCommit: false });
}

async function createRecommendationAction(data, conn) {
    const sql = `
        INSERT INTO recommendation_action (
            recommendation_action_id,
            recommendation_id,
            category,
            title,
            description,
            type,
            priority
        ) VALUES (
            SEQ_RECOMMENDATION_ACTION.NEXTVAL,
            :recommendationId,
            :category,
            :title,
            :description,
            :type,
            :priority
        )
    `;
    await conn.execute(sql, {
        recommendationId: Number(data.recommendationId),
        category:         data.category    ?? 'ACTION',
        title:            data.title,
        description:      data.description ?? null,
        type:             data.type,
        priority:         data.priority    ?? null,
    }, { autoCommit: false });
}

async function deletePortfolioDiagnosisByResumeJob(resumeId, jobPostingId, conn) {
    await conn.execute(
        `DELETE FROM action_plan WHERE diagnosis_id IN (
            SELECT diagnosis_id FROM portfolio_diagnosis
            WHERE resume_id = :resumeId AND job_posting_id = :jobPostingId
        )`,
        { resumeId: Number(resumeId), jobPostingId: Number(jobPostingId) },
        { autoCommit: false }
    );
    await conn.execute(
        `DELETE FROM portfolio_diagnosis WHERE resume_id = :resumeId AND job_posting_id = :jobPostingId`,
        { resumeId: Number(resumeId), jobPostingId: Number(jobPostingId) },
        { autoCommit: false }
    );
}

async function deleteRecommendationActionsByRecommendationId(recommendationId, conn) {
    await conn.execute(
        `DELETE FROM recommendation_action WHERE recommendation_id = :recommendationId`,
        { recommendationId: Number(recommendationId) },
        { autoCommit: false }
    );
}

async function findActionPlanByResumeJob(resumeId, jobPostingId, conn) {
    const oracledb = require("oracledb");

    // 1. portfolio_diagnosis (weakness 데이터)
    const diagSql = `
        SELECT * FROM (
            SELECT
                diagnosis_id                    AS "diagnosisId",
                diagnosis_summary               AS "diagnosisSummary",
                tech_stack_weakness             AS "techStackWeakness",
                project_experience_weakness     AS "projectExperienceWeakness",
                business_result_weakness        AS "businessResultWeakness",
                domain_understanding_weakness   AS "domainUnderstandingWeakness",
                improvement_priority            AS "improvementPriority"
            FROM portfolio_diagnosis
            WHERE resume_id = :resumeId AND job_posting_id = :jobPostingId
            ORDER BY diagnosis_date DESC
        ) WHERE ROWNUM = 1
    `;
    const diagResult = await conn.execute(
        diagSql,
        { resumeId: Number(resumeId), jobPostingId: Number(jobPostingId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const diagnosis = diagResult.rows[0] ?? null;

    // 2. recommendation_action (stage별 액션 데이터)
    const actionSql = `
        SELECT
            ra.recommendation_action_id AS "actionId",
            ra.recommendation_id        AS "recommendationId",
            ra.category                 AS "category",
            ra.title                    AS "title",
            ra.description              AS "description",
            ra.type                     AS "type",
            ra.priority                 AS "priority"
        FROM recommendation_action ra
        JOIN company_recommendation cr ON ra.recommendation_id = cr.recommendation_id
        WHERE cr.resume_id = :resumeId AND cr.job_posting_id = :jobPostingId
        ORDER BY ra.type, ra.priority ASC NULLS LAST
    `;
    const actionResult = await conn.execute(
        actionSql,
        { resumeId: Number(resumeId), jobPostingId: Number(jobPostingId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const actions = actionResult.rows;

    return {
        diagnosis,
        resumeActions: actions.filter(a => String(a.type).toUpperCase() === 'RESUME'),
        finalActions:  actions.filter(a => String(a.type).toUpperCase() === 'FINAL'),
    };
}

/**
 * 특정 이력서 + 채용공고 + 분석단계의 추천 결과 단건 삭제
 *
 * 면접 완료 후 해당 공고의 FINAL 분석만 교체할 때 사용한다.
 * 다른 공고의 FINAL 결과는 건드리지 않는다.
 */
async function deleteRecommendationByResumeJobStage(
    { resumeId, jobPostingId, analysisStage },
    conn
) {
    const bind = { resumeId, jobPostingId, analysisStage };

    await conn.execute(
        `
        DELETE FROM RECOMMENDATION_ACTION
        WHERE RECOMMENDATION_ID IN (
            SELECT RECOMMENDATION_ID
            FROM COMPANY_RECOMMENDATION
            WHERE RESUME_ID = :resumeId
              AND JOB_POSTING_ID = :jobPostingId
              AND ANALYSIS_STAGE = :analysisStage
        )
        `,
        bind
    );

    await conn.execute(
        `
        DELETE FROM RECOMMENDATION_METRIC_DETAIL
        WHERE RECOMMENDATION_ID IN (
            SELECT RECOMMENDATION_ID
            FROM COMPANY_RECOMMENDATION
            WHERE RESUME_ID = :resumeId
              AND JOB_POSTING_ID = :jobPostingId
              AND ANALYSIS_STAGE = :analysisStage
        )
        `,
        bind
    );

    await conn.execute(
        `
        DELETE FROM COMPANY_RECOMMENDATION
        WHERE RESUME_ID = :resumeId
          AND JOB_POSTING_ID = :jobPostingId
          AND ANALYSIS_STAGE = :analysisStage
        `,
        bind
    );
}

/**
 * 특정 이력서의 RESUME 단계 추천 결과 건수 조회
 *
 * 사용 목적:
 * - 이력서는 있으나 1차 분석이 없는 오류 케이스 감지
 * - count = 0 이면 중간 오류로 분석이 저장되지 않은 상태
 */
async function countResumeRecommendations(resumeId, conn) {
    const sql = `
        SELECT COUNT(*) AS "cnt"
        FROM COMPANY_RECOMMENDATION
        WHERE RESUME_ID = :resumeId
          AND ANALYSIS_STAGE = 'RESUME'
    `;

    const result = await conn.execute(
        sql,
        { resumeId: Number(resumeId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows[0]?.cnt ?? 0;
}

/**
 * 단일 기업 상세 분석 시 metric reason text 갱신
 * SCORE는 변경하지 않고 REASON_TEXT만 UPDATE
 */
async function updateMetricReasonText(recommendationId, metricType, reasonText, conn) {
    const sql = `
        UPDATE RECOMMENDATION_METRIC_DETAIL
        SET REASON_TEXT = :reasonText
        WHERE RECOMMENDATION_ID = :recommendationId
          AND METRIC_TYPE = :metricType
    `;
    return await conn.execute(sql, {
        reasonText,
        recommendationId: Number(recommendationId),
        metricType,
    });
}

module.exports = {
    deleteRecommendationResultsByResumeStage,
    deleteRecommendationByResumeJobStage,
    createCompanyRecommendation,
    createRecommendationMetricDetail,
    findRecommendationsByResume,
    findRecommendationByResumeAndJob,
    createPortfolioDiagnosis,
    createActionPlan,
    createRecommendationAction,
    deletePortfolioDiagnosisByResumeJob,
    deleteRecommendationActionsByRecommendationId,
    findActionPlanByResumeJob,
    countResumeRecommendations,
    updateMetricReasonText,
};
