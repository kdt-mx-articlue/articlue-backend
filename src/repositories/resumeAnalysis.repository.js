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
 * 1. RECOMMENDATION_METRIC_DETAIL
 * 2. COMPANY_RECOMMENDATION
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
     * 1. 추천 지표 상세 삭제
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
     * 2. 기업 추천 결과 삭제
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

module.exports = {
    deleteRecommendationResultsByResumeStage,
    createCompanyRecommendation,
    createRecommendationMetricDetail,
};