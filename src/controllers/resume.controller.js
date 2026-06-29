const resumeService = require('../services/resume.service');
const db = require('../config/db');
const resumeAnalysisRepository = require('../repositories/resumeAnalysis.repository');

// 이력서 생성
async function createResume(req, res) {
    try {
        console.log("[RESUME CTRL] 요청 시작");
        console.log("[RESUME CTRL] body.memberId:", req.body.memberId || req.body.member_id);
        console.log("[RESUME CTRL] body.resumeTitle:", req.body.resumeTitle || req.body.resume_title);
        console.time("[RESUME CTRL] total");

        const result = await resumeService.createResumeAndAnalyze(req.body);

        console.timeEnd("[RESUME CTRL] total");
        console.log("[RESUME CTRL] 최종 응답 message:", result.message);
        console.log("[RESUME CTRL] 최종 응답 resumeId:", result.data?.resumeId);
        console.log("[RESUME CTRL] analysisStatus:", result.data?.analysisStatus);

        return res.status(200).json({
            success: true,
            message: result.message,
            data: {
                resumeId: result.data?.resumeId ?? null,
            },
        });

    } catch (error) {
        console.error(error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "서버 내부 오류가 발생했습니다."
        });
    }
}

/**
 * GET /api/resumes/:resumeId
 * 특정 이력서 전체 상세 조회
 */
async function getResumeDetail(req, res) {
    try {
        const result = await resumeService.getResumeDetail(req.params.resumeId);
        return res.status(200).json(result);
    } catch (error) {
        console.error(error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : "서버 내부 오류가 발생했습니다."
        });
    }
}

/**
 * GET /api/resumes/:resumeId/recommendations
 * 이력서 기반 기업 추천 결과 조회 (1차 분석)
 */
async function getResumeRecommendations(req, res) {
    let conn;
    try {
        const { resumeId } = req.params;
        // 프론트에서 ?stage=RESUME 또는 ?analysisStage=RESUME 둘 다 허용
        const analysisStage = req.query.stage || req.query.analysisStage || "RESUME";

        conn = await db.getConnection();
        const recommendations = await resumeAnalysisRepository.findRecommendationsByResume(
            conn,
            resumeId,
            analysisStage
        );

        // data를 flat array로 반환 (프론트 dashboardService와 정합)
        return res.status(200).json({
            success: true,
            message: "추천 기업 조회 성공",
            data: recommendations
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "추천 기업 조회 실패"
        });
    } finally {
        if (conn) await conn.close();
    }
}


/**
 * GET /api/resumes/:resumeId/action-plan?jobPostingId=X
 * 기업별 보완 필요 항목(portfolio_diagnosis) + 액션 추천(recommendation_action)
 */
async function getActionPlan(req, res) {
    let conn;
    try {
        const { resumeId } = req.params;
        const { jobPostingId } = req.query;

        if (!jobPostingId) {
            return res.status(400).json({ success: false, message: "jobPostingId가 필요합니다." });
        }

        conn = await db.getConnection();
        const result = await resumeAnalysisRepository.findActionPlanByResumeJob(
            resumeId, jobPostingId, conn
        );

        const { diagnosis, resumeActions, finalActions } = result;

        // portfolio_diagnosis 컬럼 → weaknesses 배열로 변환
        const weaknesses = [];
        if (diagnosis) {
            const fields = [
                { key: "techStackWeakness",          category: "TECH",     title: "기술스택 보완 필요" },
                { key: "projectExperienceWeakness",  category: "PROJECT",  title: "프로젝트 경험 보완 필요" },
                { key: "businessResultWeakness",     category: "BUSINESS", title: "비즈니스 성과 보완 필요" },
                { key: "domainUnderstandingWeakness",category: "DOMAIN",   title: "도메인 이해도 보완 필요" },
            ];
            fields.forEach(({ key, category, title }, idx) => {
                const text = diagnosis[key];
                if (text && String(text).trim()) {
                    weaknesses.push({ category, title, description: String(text), priority: idx + 1 });
                }
            });
        }

        // recommendation_action → recommendations 배열로 변환
        const toRecs = (actions) => actions.map((a, idx) => ({
            category:    a.category,
            title:       a.title,
            description: a.description ?? "",
            priority:    a.priority ?? idx + 1,
        }));

        return res.status(200).json({
            success: true,
            message: "액션 플랜 조회 성공",
            data: {
                diagnosisSummary:    diagnosis?.diagnosisSummary    ?? null,
                improvementPriority: diagnosis?.improvementPriority ?? null,
                weaknesses,                         // 공통 (1차/2차 동일)
                resumeRecommendations: toRecs(resumeActions),  // 1차 액션
                finalRecommendations:  toRecs(finalActions),   // 2차 액션
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "액션 플랜 조회 실패" });
    } finally {
        if (conn) await conn.close();
    }
}

/**
 * GET /api/resumes/:resumeId/job-match?jobPostingId=X&stage=RESUME
 * 관심 기업 클릭 시 해당 resumeId + jobPostingId 조합의 매칭률 단건 조회
 */
async function getJobMatch(req, res) {
    let conn;
    try {
        const { resumeId } = req.params;
        const { jobPostingId, stage } = req.query;
        const analysisStage = stage || "RESUME";

        if (!jobPostingId) {
            return res.status(400).json({ success: false, message: "jobPostingId가 필요합니다." });
        }

        conn = await db.getConnection();
        const rec = await resumeAnalysisRepository.findRecommendationByResumeAndJob(
            conn,
            resumeId,
            jobPostingId,
            analysisStage
        );

        return res.status(200).json({
            success: true,
            message: rec ? "매칭률 조회 성공" : "분석 결과 없음",
            data: rec ?? null,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "매칭률 조회 실패" });
    } finally {
        if (conn) await conn.close();
    }
}


async function analyzeResume(req, res) {
    try {
        const { resumeId } = req.params;
        const { analysisStage = "RESUME", recommendationLimit } = req.body;

        if (!resumeId) {
            return res.status(400).json({ success: false, message: "resumeId가 필요합니다." });
        }

        const result = await resumeService.analyzeSavedResume({
            resumeId,
            analysisStage,
            recommendationLimit,
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error(error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "분석 실패",
        });
    }
}

/**
 * POST /api/resumes/:resumeId/analyze-detail?jobPostingId=X
 * 특정 공고 1개에 대한 GPT 상세 분석 온디맨드 실행
 */
async function analyzeJobDetail(req, res) {
    try {
        const { resumeId } = req.params;
        const { jobPostingId } = req.query;

        if (!jobPostingId) {
            return res.status(400).json({ success: false, message: "jobPostingId가 필요합니다." });
        }

        const result = await resumeService.analyzeSingleJob({ resumeId, jobPostingId });
        return res.status(200).json(result);
    } catch (error) {
        console.error(error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "단일 기업 분석 실패",
        });
    }
}

module.exports = {
    getActionPlan,
    createResume,
    getResumeDetail,
    getResumeRecommendations,
    getJobMatch,
    analyzeResume,
    analyzeJobDetail,
};
