const { getConnection } = require("../config/db");
const aiClient = require("../config/ai.config");
const analysisRepository = require("../repositories/resumeAnalysis.repository");
const { createError } = require("../utils/error.util");

const RADAR_METRIC_TYPES = [
    "business_fit",
    "action_result_fit",
    "tech_stack_fit",
    "requirement_fit",
    "culture_fit",
];

const MAX_RECOMMENDATION_LIMIT = 20;

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

function unwrapAiResult(aiResult) {
    if (!aiResult) {
        throw createError("AI 분석 결과가 없습니다.", 502);
    }

    const root =
        aiResult.data ||
        aiResult.analysisResult ||
        aiResult.analysis_result ||
        aiResult;

    if (root.error) {
        throw createError(
            typeof root.error === "string"
                ? root.error
                : "AI 분석 중 오류가 발생했습니다.",
            502
        );
    }

    if (
        !isBlank(root.status) &&
        String(root.status).toLowerCase() !== "done" &&
        String(root.status).toLowerCase() !== "success"
    ) {
        throw createError(`AI 분석 상태가 완료 상태가 아닙니다. status=${root.status}`, 502);
    }

    return root.result || root;
}

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

function normalizeRadarMetrics(analysisItem) {
    const metricsSource = analysisItem.metrics;

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

function getAiJobMatches(aiRoot) {
    const jobMatches =
        aiRoot.jobMatches ||
        aiRoot.job_matches ||
        aiRoot.recommendations ||
        aiRoot.companyRecommendations ||
        aiRoot.company_recommendations;

    if (Array.isArray(jobMatches)) {
        return jobMatches;
    }

    const jobPostingId = pick(aiRoot, ["jobPostingId", "job_posting_id"]);

    if (!isBlank(jobPostingId) && aiRoot.metrics) {
        return [aiRoot];
    }

    throw createError("AI 분석 결과 job_matches 배열이 없습니다.", 502);
}

function normalizeAnalysisItems(aiRoot, analysisStage, recommendationLimit) {
    const jobMatches = getAiJobMatches(aiRoot);

    if (jobMatches.length === 0) {
        throw createError("AI 추천 결과가 비어 있습니다.", 502);
    }

    if (jobMatches.length > MAX_RECOMMENDATION_LIMIT) {
        throw createError("AI 추천 결과는 최대 20개까지만 저장할 수 있습니다.", 502);
    }

    const jobPostingIdSet = new Set();
    const analysisItems = [];
    const skippedItems = [];

    for (let index = 0; index < jobMatches.length; index++) {
        const item = jobMatches[index];

        const rawJobPostingId = pick(item, ["jobPostingId", "job_posting_id"]);
        const jobPostingIdNumber = Number(rawJobPostingId);

        if (
            !Number.isInteger(jobPostingIdNumber) ||
            jobPostingIdNumber <= 0
        ) {
            skippedItems.push({
                index,
                reason: "INVALID_JOB_POSTING_ID",
                jobPostingId: rawJobPostingId,
            });

            continue;
        }

        if (jobPostingIdSet.has(jobPostingIdNumber)) {
            skippedItems.push({
                index,
                reason: "DUPLICATED_JOB_POSTING_ID",
                jobPostingId: jobPostingIdNumber,
            });

            continue;
        }

        jobPostingIdSet.add(jobPostingIdNumber);

        const itemAnalysisStage = pick(
            item,
            ["analysisStage", "analysis_stage"],
            analysisStage
        );

        if (String(itemAnalysisStage).toUpperCase() !== String(analysisStage).toUpperCase()) {
            throw createError("추천 결과의 분석 단계가 요청 분석 단계와 다릅니다.", 502);
        }

        const metrics = normalizeRadarMetrics(item);

        const overallScoreValue = pick(
            item,
            ["overallScore", "overall_score"]
        );

        const overallScore = isBlank(overallScoreValue)
            ? calculateOverallScore(metrics)
            : normalizeScore(overallScoreValue, "overall_score");

        analysisItems.push({
            companyId: pick(item, ["companyId", "company_id"]),
            jobPostingId: jobPostingIdNumber,
            analysisStage,
            recommendRank: parseOptionalPositiveInt(
                pick(item, ["recommendRank", "recommend_rank", "rank"]),
                analysisItems.length + 1
            ),
            overallScore,
            metrics,
        });
    }

    if (analysisItems.length === 0) {
        throw createError("저장 가능한 AI 추천 결과가 없습니다.", 502);
    }

    if (analysisItems.length > recommendationLimit) {
        throw createError("AI 추천 결과 개수가 요청한 recommendation_limit보다 많습니다.", 502);
    }

    return {
        analysisItems,
        skippedItems,
    };
}

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
            { timeout }
        );

        return response.data;

    } catch (error) {
        console.error("[AI RESUME ANALYSIS ERROR]", {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
        });

        throw createError(
            "AI 서버 이력서 분석 요청에 실패했습니다.",
            error.response?.status || 502
        );
    }
}

async function analyzeAndSave({
    resumeId,
    analysisStage = "RESUME",
    recommendationLimit = MAX_RECOMMENDATION_LIMIT,
    resumeDetail,
}) {
    if (!resumeDetail) {
        throw createError("AI 분석에 사용할 이력서 상세 데이터가 없습니다.", 500);
    }

    const normalizedAnalysisStage = String(analysisStage).toUpperCase();
    const normalizedRecommendationLimit =
        normalizeRecommendationLimit(recommendationLimit);

    const aiPayload = {
        resume_id: resumeId,
        analysis_stage: normalizedAnalysisStage,
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
            analysisStage: normalizedAnalysisStage,
            recommendationLimit: normalizedRecommendationLimit,
            aiResult,
        });

        await conn.commit();

        return {
            success: true,
            message: "AI 기업 추천 분석 결과 저장 완료",
            data: {
                resumeId,
                analysisStage: normalizedAnalysisStage,
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

async function saveAiAnalysisResult({
    conn,
    resumeId,
    analysisStage,
    recommendationLimit,
    aiResult,
}) {
    const aiRoot = unwrapAiResult(aiResult);

    validateAiResumeId(aiRoot, resumeId);

    const { analysisItems, skippedItems } = normalizeAnalysisItems(
        aiRoot,
        analysisStage,
        recommendationLimit
    );

    await analysisRepository.deleteRecommendationResultsByResumeStage(
        {
            resumeId,
            analysisStage,
        },
        conn
    );

    const savedRecommendations = [];
    let savedMetricCount = 0;

    for (const analysisItem of analysisItems) {
        const recommendationId =
            await analysisRepository.createCompanyRecommendation(
                {
                    resumeId,
                    jobPostingId: analysisItem.jobPostingId,
                    analysisStage: analysisItem.analysisStage,
                    overallScore: analysisItem.overallScore,
                    latestInterviewId: null,
                    recommendRank: analysisItem.recommendRank,
                },
                conn
            );

        for (const metric of analysisItem.metrics) {
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
            companyId: analysisItem.companyId,
            jobPostingId: analysisItem.jobPostingId,
            recommendRank: analysisItem.recommendRank,
            overallScore: analysisItem.overallScore,
            metricCount: analysisItem.metrics.length,
        });
    }

    return {
        savedCount: {
            companyRecommendations: savedRecommendations.length,
            recommendationMetrics: savedMetricCount,
            skippedItems: skippedItems.length,
        },
        recommendations: savedRecommendations,
        skippedItems,
    };
}

module.exports = {
    analyzeAndSave,
};