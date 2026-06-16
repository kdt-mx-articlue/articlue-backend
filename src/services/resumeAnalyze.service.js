const { getConnection } = require("../config/db");
const aiClient = require("../config/ai.config");

const analysisRepository = require("../repositories/resumeAnalysis.repository");

const { createError } = require("../utils/error.util");

/* =========================================================
   기업 추천 방사형 지표 고정 목록
   ========================================================= */

const RADAR_METRIC_TYPES = [
    "business_fit",
    "action_result_fit",
    "tech_stack_fit",
    "requirement_fit",
    "culture_fit",
];

const MAX_RECOMMENDATION_LIMIT = 20;

/* =========================================================
   공통 유틸
   ========================================================= */

function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
}

function pick(target, fieldNames, defaultValue = null) {
    if (!target) {
        return defaultValue;
    }

    for (const fieldName of fieldNames) {
        if (!isBlank(target[fieldName])) {
            return target[fieldName];
        }
    }

    return defaultValue;
}

function requireText(value, message) {
    if (isBlank(value)) {
        throw createError(message, 502);
    }

    return String(value).trim();
}

function parsePositiveInt(value, message) {
    const numberValue = Number(value);

    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw createError(message, 502);
    }

    return numberValue;
}

function parseOptionalPositiveInt(value, defaultValue) {
    if (isBlank(value)) {
        return defaultValue;
    }

    const numberValue = Number(value);

    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        return defaultValue;
    }

    return numberValue;
}

function normalizeScore(value, fieldName) {
    if (isBlank(value)) {
        throw createError(`${fieldName} 점수가 없습니다.`, 502);
    }

    const numberValue = Number(value);

    if (Number.isNaN(numberValue)) {
        throw createError(`${fieldName} 점수가 숫자 형식이 아닙니다.`, 502);
    }

    if (numberValue < 0 || numberValue > 100) {
        throw createError(`${fieldName} 점수는 0점 이상 100점 이하이어야 합니다.`, 502);
    }

    return Number(numberValue.toFixed(2));
}

function normalizeRecommendationLimit(value) {
    const limit = isBlank(value)
        ? MAX_RECOMMENDATION_LIMIT
        : Number(value);

    if (!Number.isInteger(limit) || limit <= 0) {
        throw createError("추천 결과 개수가 올바르지 않습니다.", 500);
    }

    if (limit > MAX_RECOMMENDATION_LIMIT) {
        throw createError(`추천 결과는 최대 ${MAX_RECOMMENDATION_LIMIT}개까지 요청할 수 있습니다.`, 500);
    }

    return limit;
}

function calculateOverallScore(metrics) {
    const total = metrics.reduce(
        (sum, metric) => sum + Number(metric.score || 0),
        0
    );

    return Number((total / metrics.length).toFixed(2));
}

/**
 * AI 응답 wrapper 제거
 *
 * 허용 형태:
 * 1. { success, message, data: {...} }
 * 2. { analysis: {...} }
 * 3. { recommendations: [...] }
 */
function unwrapAiResult(aiResult) {
    if (!aiResult) {
        throw createError("AI 분석 결과가 없습니다.", 502);
    }

    return (
        aiResult.data ||
        aiResult.analysis ||
        aiResult.analysisResult ||
        aiResult.analysis_result ||
        aiResult
    );
}

/* =========================================================
   AI 응답 검증 / 정규화
   ========================================================= */

function validateAiResumeId(aiRoot, resumeId) {
    const aiResumeId = pick(aiRoot, ["resumeId", "resume_id"]);

    if (isBlank(aiResumeId)) {
        return;
    }

    const parsedAiResumeId = parsePositiveInt(
        aiResumeId,
        "AI 분석 결과의 이력서 번호가 올바르지 않습니다."
    );

    if (parsedAiResumeId !== Number(resumeId)) {
        throw createError("AI 분석 결과의 이력서 번호가 요청 이력서 번호와 다릅니다.", 502);
    }
}

function validateAiAnalysisStage(aiRoot, analysisStage) {
    const aiAnalysisStage = pick(aiRoot, ["analysisStage", "analysis_stage"]);

    if (isBlank(aiAnalysisStage)) {
        return;
    }

    if (String(aiAnalysisStage).toUpperCase() !== String(analysisStage).toUpperCase()) {
        throw createError("AI 분석 결과의 분석 단계가 요청 분석 단계와 다릅니다.", 502);
    }
}

/**
 * recommendation.metrics 객체를 DB 저장용 배열로 변환
 *
 * FastAPI 응답 기준:
 *
 * metrics: {
 *   business_fit: {
 *     score: 85.12,
 *     reason_text: "..."
 *   },
 *   ...
 * }
 */
function normalizeRadarMetrics(recommendation) {
    const metricsSource = recommendation.metrics;

    if (
        !metricsSource ||
        typeof metricsSource !== "object" ||
        Array.isArray(metricsSource)
    ) {
        throw createError("AI 분석 결과 metrics 객체가 없습니다.", 502);
    }

    const metrics = [];

    for (const metricType of RADAR_METRIC_TYPES) {
        const metric = metricsSource[metricType];

        if (
            !metric ||
            typeof metric !== "object" ||
            Array.isArray(metric)
        ) {
            throw createError(`${metricType} 분석 지표가 없습니다.`, 502);
        }

        metrics.push({
            metricType,
            score: normalizeScore(metric.score, metricType),
            reasonText: requireText(
                pick(metric, ["reasonText", "reason_text", "reason"]),
                `${metricType} 분석 근거가 없습니다.`
            ),
        });
    }

    return metrics;
}

/**
 * AI가 반환한 recommendations 배열 정규화
 *
 * FastAPI 응답 기준:
 *
 * recommendations: [
 *   {
 *     rank: 1,
 *     company_id: 10,
 *     job_posting_id: 1,
 *     overall_score: 83.65,
 *     metrics: {...}
 *   }
 * ]
 */
function normalizeRecommendationItems(aiRoot, analysisStage, recommendationLimit) {
    const recommendations =
        aiRoot.recommendations ||
        aiRoot.companyRecommendations ||
        aiRoot.company_recommendations ||
        aiRoot.recommendationList ||
        aiRoot.recommendation_list;

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
        throw createError("AI 분석 결과 recommendations 배열이 없습니다.", 502);
    }

    if (recommendations.length > MAX_RECOMMENDATION_LIMIT) {
        throw createError("AI 추천 결과는 최대 20개까지만 저장할 수 있습니다.", 502);
    }

    if (recommendations.length > recommendationLimit) {
        throw createError("AI 추천 결과 개수가 요청한 recommendation_limit보다 많습니다.", 502);
    }

    const jobPostingIdSet = new Set();

    return recommendations.map((recommendation, index) => {
        const recommendationAnalysisStage = pick(
            recommendation,
            ["analysisStage", "analysis_stage"]
        );

        if (
            !isBlank(recommendationAnalysisStage) &&
            String(recommendationAnalysisStage).toUpperCase() !== String(analysisStage).toUpperCase()
        ) {
            throw createError("추천 결과의 분석 단계가 요청 분석 단계와 다릅니다.", 502);
        }

        const jobPostingId = parsePositiveInt(
            pick(recommendation, ["jobPostingId", "job_posting_id"]),
            "추천 결과의 공고 번호가 올바르지 않습니다."
        );

        if (jobPostingIdSet.has(jobPostingId)) {
            throw createError("AI 추천 결과에 중복된 공고 번호가 있습니다.", 502);
        }

        jobPostingIdSet.add(jobPostingId);

        const metrics = normalizeRadarMetrics(recommendation);

        const overallScoreValue = pick(
            recommendation,
            ["overallScore", "overall_score"]
        );

        const overallScore = isBlank(overallScoreValue)
            ? calculateOverallScore(metrics)
            : normalizeScore(overallScoreValue, "overall_score");

        return {
            companyId: pick(recommendation, ["companyId", "company_id"]),
            jobPostingId,
            analysisStage,
            recommendRank: parseOptionalPositiveInt(
                pick(recommendation, ["recommendRank", "recommend_rank", "rank"]),
                index + 1
            ),
            overallScore,
            metrics,
        };
    });
}

/* =========================================================
   AI 서버 호출
   ========================================================= */

async function requestResumeAnalysisToAi(payload) {
    const path =
        process.env.AI_RESUME_ANALYSIS_PATH ||
        "/api/ai/resumes/analyze";

    const timeout =
        Number(process.env.AI_RESUME_ANALYSIS_TIMEOUT_MS) ||
        120000;

    try {
        const response = await aiClient.post(
            path,
            payload,
            {
                timeout,
            }
        );

        return response.data.data || response.data;

    } catch (error) {
        console.error(
            "[AI RESUME ANALYSIS ERROR]",
            error.response?.data || error.message
        );

        throw createError(
            "AI 서버 이력서 분석 요청에 실패했습니다.",
            error.response?.status || 502
        );
    }
}

/* =========================================================
   외부 공개 함수
   ========================================================= */

/**
 * 이력서 상세 데이터 기반 기업 추천 분석 요청 + 저장
 *
 * 책임:
 * - FastAPI 호출
 * - AI 추천 결과 N개 저장
 * - 추천 결과별 방사형 지표 5개 저장
 *
 * 금지:
 * - RESUME 원본 조회
 * - RESUME 원본 생성/수정/삭제
 * - GitHub 저장소 생성/수정/삭제
 */
async function analyzeAndSave({
    resumeId,
    analysisStage,
    recommendationLimit = MAX_RECOMMENDATION_LIMIT,
    resumeDetail,
}) {
    if (!resumeDetail) {
        throw createError("AI 분석에 사용할 이력서 상세 데이터가 없습니다.", 500);
    }

    const normalizedRecommendationLimit =
        normalizeRecommendationLimit(recommendationLimit);

    const aiPayload = {
        resume_id: resumeId,
        analysis_stage: analysisStage,
        recommendation_limit: normalizedRecommendationLimit,
        resume: resumeDetail,
    };

    console.log("[AI REQUEST]", JSON.stringify(aiPayload, null, 2));

    const aiResult = await requestResumeAnalysisToAi(aiPayload);

    console.log("[AI RESPONSE]", JSON.stringify(aiResult, null, 2));

    const conn = await getConnection();

    try {
        const savedResult = await saveAiAnalysisResult({
            conn,
            resumeId,
            analysisStage,
            recommendationLimit: normalizedRecommendationLimit,
            aiResult,
        });

        await conn.commit();

        return {
            success: true,
            message: "AI 기업 추천 분석 결과 저장 완료",
            data: {
                resumeId,
                analysisStage,
                recommendationLimit: normalizedRecommendationLimit,
                savedResult,
                aiResult,
            },
        };

    } catch (error) {
        await conn.rollback();
        throw error;

    } finally {
        await conn.close();
    }
}

/* =========================================================
   분석 결과 저장
   ========================================================= */

async function saveAiAnalysisResult({
    conn,
    resumeId,
    analysisStage,
    recommendationLimit,
    aiResult,
}) {
    const aiRoot = unwrapAiResult(aiResult);

    validateAiResumeId(aiRoot, resumeId);
    validateAiAnalysisStage(aiRoot, analysisStage);

    const recommendations = normalizeRecommendationItems(
        aiRoot,
        analysisStage,
        recommendationLimit
    );

    /*
     * 같은 이력서 + 같은 분석단계의 기존 추천 결과 삭제
     *
     * 예:
     * - 기존 추천 3개 저장됨
     * - 재분석 후 추천 20개 반환
     * - 기존 3개 삭제 후 20개 새로 저장
     */
    await analysisRepository.deleteRecommendationResultsByResumeStage(
        {
            resumeId,
            analysisStage,
        },
        conn
    );

    const savedRecommendations = [];
    let savedMetricCount = 0;

    for (const recommendation of recommendations) {
        /*
         * 추천 공고 1개당 COMPANY_RECOMMENDATION 1건 생성
         */
        const recommendationId =
            await analysisRepository.createCompanyRecommendation(
                {
                    resumeId,
                    jobPostingId: recommendation.jobPostingId,
                    analysisStage: recommendation.analysisStage,
                    overallScore: recommendation.overallScore,
                    latestInterviewId: null,
                    recommendRank: recommendation.recommendRank,
                },
                conn
            );

        /*
         * 추천 공고 1개당 RECOMMENDATION_METRIC_DETAIL 5건 생성
         */
        for (const metric of recommendation.metrics) {
            await analysisRepository.createRecommendationMetricDetail(
                {
                    recommendationId,
                    metricType: metric.metricType,
                    score: metric.score,
                    reasonText: metric.reasonText,
                },
                conn
            );

            savedMetricCount++;
        }

        savedRecommendations.push({
            recommendationId,
            companyId: recommendation.companyId,
            jobPostingId: recommendation.jobPostingId,
            recommendRank: recommendation.recommendRank,
            overallScore: recommendation.overallScore,
            metricCount: recommendation.metrics.length,
        });
    }

    return {
        savedCount: {
            companyRecommendations: savedRecommendations.length,
            recommendationMetrics: savedMetricCount,
        },
        recommendations: savedRecommendations,
    };
}

module.exports = {
    analyzeAndSave,
};