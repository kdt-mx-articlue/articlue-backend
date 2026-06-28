const { getConnection } = require("../config/db");
const aiConfig = require("../config/ai.config");
const analysisRepository = require("../repositories/resumeAnalysis.repository");
const { createError } = require("../utils/error.util");

/*
 * ai.config.js export 방식이
 * 1) module.exports = aiClient
 * 2) module.exports = { aiClient }
 * 둘 중 무엇이든 동작하게 처리합니다.
 */
const aiClient = aiConfig.aiClient || aiConfig;

const RADAR_METRIC_TYPES = [
    "business_fit",
    "action_result_fit",
    "tech_stack_fit",
    "requirement_fit",
    "culture_fit",
];

const MAX_RECOMMENDATION_LIMIT = 500;

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

/*
 * FastAPI / Python 쪽에서 None이 join에 들어가면 아래 오류가 발생합니다.
 *
 * TypeError: sequence item 0: expected str instance, NoneType found
 *
 * Node JSON의 null은 Python에서 None이 되므로,
 * AI 서버로 보내기 전에 null / undefined를 빈 문자열로 정리합니다.
 */
function replaceNullWithEmptyString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((item) => replaceNullWithEmptyString(item));
    }

    if (typeof value === "object") {
        const result = {};

        for (const [key, childValue] of Object.entries(value)) {
            result[key] = replaceNullWithEmptyString(childValue);
        }

        return result;
    }

    return value;
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
        throw createError("AI 추천 결과는 최대 500개까지만 저장할 수 있습니다.", 502);
    }

    const jobPostingIdSet = new Set();
    const analysisItems = [];
    const skippedItems = [];

    for (let index = 0; index < jobMatches.length; index++) {
        const item = jobMatches[index];

        /*
         * AI 응답 구조 대응
         *
         * 현재 AI는 아래 구조로 반환함:
         * {
         *   job_posting_id: 17,
         *   analysis: {
         *     type: "RESUME",
         *     overall_score: 20.9,
         *     metrics: { ... }
         *   }
         * }
         *
         * 기존 백엔드는 item.metrics를 기대했기 때문에
         * item.analysis.metrics도 같이 처리해야 함.
         */
        const nestedAnalysis =
            item.analysis && typeof item.analysis === "object"
                ? item.analysis
                : {};

        const normalizedItem = {
            ...item,
            analysisStage:
                item.analysisStage ||
                item.analysis_stage ||
                nestedAnalysis.analysisStage ||
                nestedAnalysis.analysis_stage ||
                analysisStage,
            overallScore:
                item.overallScore ||
                item.overall_score ||
                nestedAnalysis.overallScore ||
                nestedAnalysis.overall_score,
            metrics:
                item.metrics ||
                nestedAnalysis.metrics,
        };

        const rawJobPostingId = pick(
            normalizedItem,
            ["jobPostingId", "job_posting_id"]
        );

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
            normalizedItem,
            ["analysisStage", "analysis_stage"],
            analysisStage
        );

        if (
            String(itemAnalysisStage).toUpperCase() !==
            String(analysisStage).toUpperCase()
        ) {
            throw createError("추천 결과의 분석 단계가 요청 분석 단계와 다릅니다.", 502);
        }

        const metrics = normalizeRadarMetrics(normalizedItem);

        const overallScoreValue = pick(
            normalizedItem,
            ["overallScore", "overall_score"]
        );

        const overallScore = isBlank(overallScoreValue)
            ? calculateOverallScore(metrics)
            : normalizeScore(overallScoreValue, "overall_score");

        // AI 응답의 analysis 객체에서 diagnosis / action_plans 추출
        const nestedAnalysisForDiag =
            item.analysis && typeof item.analysis === "object" ? item.analysis : {};

        analysisItems.push({
            companyId: pick(normalizedItem, ["companyId", "company_id"]),
            jobPostingId: jobPostingIdNumber,
            analysisStage,
            // recommendRank은 아래에서 overallScore 기준으로 재할당하므로 임시값
            recommendRank: analysisItems.length + 1,
            overallScore,
            metrics,
            diagnosis:   nestedAnalysisForDiag.diagnosis   ?? null,
            actionPlans: nestedAnalysisForDiag.action_plans ?? [],
        });
    }

    if (analysisItems.length === 0) {
        throw createError("저장 가능한 AI 추천 결과가 없습니다.", 502);
    }

    if (analysisItems.length > recommendationLimit) {
        throw createError("AI 추천 결과 개수가 요청한 recommendation_limit보다 많습니다.", 502);
    }

    // AI가 rank=1로 일괄 반환하는 버그를 보정:
    // overallScore 내림차순으로 정렬 후 순서 기반으로 rank 재할당
    analysisItems.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
    analysisItems.forEach((item, idx) => {
        item.recommendRank = idx + 1;
    });

    return {
        analysisItems,
        skippedItems,
    };
}

async function requestResumeAnalysisToAi(payload) {
    /*
     * 현재 FastAPI 라우터:
     * @router.post("/pipeline/analyze")
     *
     * main.py에서 prefix="/api" 없이 등록했다면:
     * /pipeline/analyze
     */
    const path =
        process.env.AI_RESUME_ANALYSIS_PATH ||
        "/pipeline/analyze";

    try {
        console.log("[AI REQUEST TARGET]", {
            baseURL: aiClient.defaults?.baseURL,
            path,
            aiClientPostType: typeof aiClient.post,
        });

        const response = await aiClient.post(
            path,
            payload,
            { timeout: 0 }
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

    /*
     * FastAPI PipelineRequest 구조:
     *
     * class PipelineRequest(BaseModel):
     *     success: bool
     *     message: str
     *     data: Dict[str, Any]
     *
     * 그래서 resume_id / resume 형태가 아니라
     * success / message / data 형태로 보내야 합니다.
     */
    const sanitizedResumeDetail = replaceNullWithEmptyString(resumeDetail);

    const aiPayload = {
        success: true,
        message: "이력서 상세 조회 성공",
        data: sanitizedResumeDetail,
        analysis_stage: normalizedAnalysisStage,
    };

    console.log(
        "[AI PAYLOAD CHECK] projectDescriptions:",
        sanitizedResumeDetail.githubRepositories?.map((repo) => repo.projectDescription)
    );

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

        console.log("[AI SAVE RESULT]", JSON.stringify(savedResult, null, 2));
        console.log("[AI SAVE COUNT]", JSON.stringify(savedResult.savedCount, null, 2));

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
        let recommendationId;
        try {
            recommendationId =
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
        } catch (err) {
            // Oracle FK 위반: JOB_POSTING 테이블에 해당 공고가 없으면 skip
            if (err.errorNum === 2291 || (err.message && err.message.includes("ORA-02291"))) {
                console.warn(`[ANALYSIS] job_posting_id=${analysisItem.jobPostingId} 가 JOB_POSTING 테이블에 없어 추천 저장 스킵`);
                continue;
            }
            throw err;
        }

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

        // portfolio_diagnosis 저장 (weakness 진단)
        const diag = analysisItem.diagnosis;
        if (diag && typeof diag === "object") {
            try {
                await analysisRepository.deletePortfolioDiagnosisByResumeJob(
                    resumeId, analysisItem.jobPostingId, conn
                );
                await analysisRepository.createPortfolioDiagnosis({
                    resumeId,
                    jobPostingId:                analysisItem.jobPostingId,
                    diagnosisSummary:            diag.diagnosis_summary             ?? null,
                    techStackWeakness:           diag.tech_stack_weakness           ?? null,
                    projectExperienceWeakness:   diag.project_experience_weakness   ?? null,
                    businessResultWeakness:      diag.business_result_weakness      ?? null,
                    domainUnderstandingWeakness: diag.domain_understanding_weakness ?? null,
                    improvementPriority:         diag.improvement_priority          ?? null,
                }, conn);
            } catch (diagErr) {
                if (diagErr.errorNum === 2291 || (diagErr.message && diagErr.message.includes("ORA-02291"))) {
                    console.warn(`[ANALYSIS] portfolio_diagnosis job_posting_id=${analysisItem.jobPostingId} FK 위반 스킵`);
                } else {
                    throw diagErr;
                }
            }
        }

        // recommendation_action 저장 (1차/2차 구분 액션 추천)
        const plans = Array.isArray(analysisItem.actionPlans) ? analysisItem.actionPlans : [];
        if (plans.length > 0) {
            await analysisRepository.deleteRecommendationActionsByRecommendationId(
                recommendationId, conn
            );
            for (const plan of plans) {
                await analysisRepository.createRecommendationAction({
                    recommendationId,
                    category:    plan.category           ?? 'ACTION',
                    title:       plan.action_plan_title  ?? "액션 플랜",
                    description: plan.action_plan_summary ?? "",
                    type:        analysisItem.analysisStage, // 'RESUME' or 'FINAL'
                    priority:    plan.priority            ?? null,
                }, conn);
            }
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

async function requestSingleJobAnalysisToAi(payload) {
    const path =
        process.env.AI_SINGLE_JOB_ANALYSIS_PATH ||
        "/pipeline/analyze-single";

    try {
        const response = await aiClient.post(
            path,
            payload,
            { timeout: 0 }
        );
        return response.data;
    } catch (error) {
        console.error("[AI SINGLE JOB ANALYSIS ERROR]", {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
        });
        throw createError(
            "AI 서버 단일 기업 분석 요청에 실패했습니다.",
            error.response?.status || 502
        );
    }
}

/**
 * 단일 공고에 대한 GPT 상세 분석을 수행하고 DB에 저장한다.
 * 기존 COMPANY_RECOMMENDATION 점수는 변경하지 않고,
 * PORTFOLIO_DIAGNOSIS + RECOMMENDATION_ACTION만 갱신한다.
 */
async function analyzeSingleJob({ resumeId, jobPostingId, resumeDetail }) {
    if (!resumeDetail) {
        throw createError("이력서 상세 데이터가 없습니다.", 500);
    }

    const sanitizedResumeDetail = replaceNullWithEmptyString(resumeDetail);

    const aiPayload = {
        success: true,
        message: "이력서 상세 조회 성공",
        data: sanitizedResumeDetail,
        job_posting_id: Number(jobPostingId),
        analysis_stage: "RESUME",
    };

    console.log(`[SINGLE JOB ANALYSIS] resumeId=${resumeId}, jobPostingId=${jobPostingId}`);

    const aiResponse = await requestSingleJobAnalysisToAi(aiPayload);
    const result = aiResponse?.result || aiResponse;

    const conn = await getConnection();
    try {
        // 기존 추천 레코드 조회 (recommendation_action FK 참조용)
        const rec = await analysisRepository.findRecommendationByResumeAndJob(
            conn,
            resumeId,
            jobPostingId,
            "RESUME"
        );

        if (!rec) {
            throw createError(
                `이력서(${resumeId}) + 공고(${jobPostingId})의 1차 분석 결과가 없습니다. 이력서를 먼저 제출해주세요.`,
                404
            );
        }

        const recommendationId = rec.recommendationId;

        // portfolio_diagnosis 갱신 (DELETE → INSERT)
        const diagnosis = result?.diagnosis;
        if (diagnosis && typeof diagnosis === "object") {
            await analysisRepository.deletePortfolioDiagnosisByResumeJob(resumeId, jobPostingId, conn);
            await analysisRepository.createPortfolioDiagnosis({
                resumeId,
                jobPostingId,
                diagnosisSummary:            diagnosis.diagnosis_summary             ?? null,
                techStackWeakness:           diagnosis.tech_stack_weakness           ?? null,
                projectExperienceWeakness:   diagnosis.project_experience_weakness   ?? null,
                businessResultWeakness:      diagnosis.business_result_weakness      ?? null,
                domainUnderstandingWeakness: diagnosis.domain_understanding_weakness ?? null,
                improvementPriority:         diagnosis.improvement_priority          ?? null,
            }, conn);
        }

        // recommendation_action 갱신 (DELETE → INSERT)
        const actionPlans = Array.isArray(result?.action_plans) ? result.action_plans : [];
        if (actionPlans.length > 0) {
            await analysisRepository.deleteRecommendationActionsByRecommendationId(recommendationId, conn);
            for (const plan of actionPlans) {
                await analysisRepository.createRecommendationAction({
                    recommendationId,
                    category:    plan.category            ?? "ACTION",
                    title:       plan.action_plan_title   ?? "액션 플랜",
                    description: plan.action_plan_summary ?? "",
                    type:        "RESUME",
                    priority:    plan.priority            ?? null,
                }, conn);
            }
        }

        // metric reason text 갱신 (SCORE 유지, REASON_TEXT만 UPDATE)
        const reasons = result?.reasons ?? {};
        for (const metricType of RADAR_METRIC_TYPES) {
            const reasonText = reasons[metricType];
            if (reasonText && reasonText !== "-") {
                await analysisRepository.updateMetricReasonText(
                    recommendationId,
                    metricType,
                    reasonText,
                    conn
                );
            }
        }

        await conn.commit();

        console.log(`[SINGLE JOB ANALYSIS] 저장 완료: recommendationId=${recommendationId}`);

        return {
            success: true,
            message: "단일 기업 상세 분석 완료",
            data: { resumeId, jobPostingId, recommendationId },
        };

    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        await conn.close();
    }
}

module.exports = {
    analyzeAndSave,
    analyzeSingleJob,
};
