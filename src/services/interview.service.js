const db = require("../config/db");

const interviewRepository = require("../repositories/interview.repository");
const interviewContextRepository = require("../repositories/interviewContext.repository");
const interviewChatbotAiService = require("./interviewChatbotAi.service");
const elevenlabsService = require("./voice/elevenlabs.service");
const openaiSpeechService = require("./voice/openaiSpeech.service");
const resumeAnalysisRepository = require("../repositories/resumeAnalysis.repository");
const resumeRepository = require("../repositories/resume.repository");

const {
    DEFAULT_RUNTIME_CONFIG,
    setRuntimeConfig,
    getRuntimeConfig,
    addTurnScore,
    getScores,
    removeRuntimeConfig,
} = require("../store/interviewRuntime.store");

async function startInterview(body) {
    validateStartBody(body);

    const config = buildStartConfig(body);

    const startData = await createInterviewSessionAndContext(config);

    const runtimeConfig = {
        ...config,

        // 프론트에서 targetCompany/jobPostingTitle을 보냈으면 그 값을 우선 사용한다.
        // 없으면 DB 공고 정보를 사용한다.
        targetCompany: config.targetCompany || startData.jobPosting.companyName,
        jobPostingTitle: config.jobPostingTitle || startData.jobPosting.postingTitle,
    };

    setRuntimeConfig(startData.interviewSessionId, runtimeConfig);

    const graphPayload = buildGraphPayload({
        eventType: "START",
        interviewSessionId: startData.interviewSessionId,
        config: runtimeConfig,
        resumeText: startData.resumeText,
        jobPostingText: startData.jobPostingText,
        weakPointsText: startData.weakPointsText || "",
        previousQas: [],
        previousScores: [],
        currentTurn: null,
        progress: {
            currentQuestionSetNo: 0,
            currentBaseQuestionId: null,
            currentFollowUpCount: 0,
            remainingQuestionSetCount: runtimeConfig.questionSetCount,
            remainingFollowUpCount: runtimeConfig.maxFollowUpPerQuestion,
            totalQuestionCount: 0,
            totalAnswerCount: 0,
        },
    });

    const graphResult = await interviewChatbotAiService.runInterviewGraph(graphPayload);

    if (!graphResult.question) {
        throw createError(502, "FastAPI가 첫 질문을 반환하지 않았습니다.");
    }

    const savedQuestion = await saveGeneratedQuestion({
        interviewSessionId: startData.interviewSessionId,
        graphQuestion: graphResult.question,
        config: runtimeConfig,
    });

    const audio = await buildQuestionAudioIfNeeded(
        runtimeConfig,
        savedQuestion.question.questionContent
    );

    return {
        interviewSessionId: startData.interviewSessionId,
        sessionStatus: "IN_PROGRESS",
        chatMode: runtimeConfig.chatMode,
        interviewType: runtimeConfig.interviewType,
        interviewerStyle: runtimeConfig.interviewerStyle,
        questionSetCount: runtimeConfig.questionSetCount,
        maxFollowUpPerQuestion: runtimeConfig.maxFollowUpPerQuestion,
        progress: savedQuestion.progress,
        question: {
            ...savedQuestion.question,
            audio,
        },
        nextClientAction: "SHOW_QUESTION",
    };
}

async function createInterviewSessionAndContext(config) {
    let conn;

    try {
        conn = await db.getConnection();

        const resumeText = await interviewContextRepository.findResumeContext(
            conn,
            config.resumeId
        );

        if (!resumeText) {
            throw createError(404, "이력서를 찾을 수 없습니다.");
        }

        const jobPostingContext = await interviewContextRepository.findJobPostingContext(
            conn,
            config.jobPostingId
        );

        if (!jobPostingContext) {
            throw createError(404, "채용공고를 찾을 수 없습니다.");
        }

        const jobPosting = jobPostingContext.jobPosting;

        const attemptNo = await interviewRepository.findNextAttemptNo(
            conn,
            config.resumeId,
            config.jobPostingId
        );

        const interviewTitle = buildInterviewTitle(config, jobPosting);

        const interviewSessionId = await interviewRepository.createSession(
            conn,
            {
                resumeId: config.resumeId,
                jobPostingId: config.jobPostingId,
                portfolioId: config.portfolioId,
                interviewTitle,
                interviewType: config.interviewType,
                interviewFormat: config.interviewFormat,
                attemptNo,
                applyIndustry: jobPosting.industryCategory || null,
                applyJob: jobPosting.jobName || config.jobPostingTitle || null,
                interviewLevel: config.interviewLevel,
                sessionStatus: "IN_PROGRESS",
            }
        );

        // 1차 RESUME 분석 약점 로딩 (없으면 빈 문자열 사용)
        let weakPointsText = "";
        try {
            const resumeRec = await resumeAnalysisRepository.findRecommendationByResumeAndJob(
                conn,
                config.resumeId,
                config.jobPostingId,
                "RESUME"
            );
            weakPointsText = buildWeakPoints(resumeRec);
        } catch (_) {}

        await conn.commit();

        return {
            interviewSessionId,
            resumeText,
            jobPostingText: jobPostingContext.contextText,
            jobPosting,
            weakPointsText,
        };

    } catch (error) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (_) {}
        }

        throw error;

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function submitAnswer(params, body, file) {
    const interviewSessionId = Number(params.interviewSessionId);
    const interviewQaId = Number(params.interviewQaId);

    if (!interviewSessionId || !interviewQaId) {
        throw createError(400, "interviewSessionId 또는 interviewQaId가 올바르지 않습니다.");
    }

    const runtimeConfig = getRuntimeConfig(interviewSessionId);

    const resolvedAnswer = await resolveAnswerContent({
        chatMode: runtimeConfig.chatMode,
        body,
        file,
    });

    const answerContent = resolvedAnswer.answerContent;

    await saveAnswerFirst({
        interviewSessionId,
        interviewQaId,
        answerContent,
    });

    const turnContext = await loadTurnContext({
        interviewSessionId,
        interviewQaId,
        answerContent,
        runtimeConfig,
    });

    const graphPayload = buildGraphPayload({
        eventType: "ANSWER",
        interviewSessionId,
        config: turnContext.config,
        resumeText: turnContext.resumeText,
        jobPostingText: turnContext.jobPostingText,
        previousQas: turnContext.previousQas,
        previousScores: getScores(interviewSessionId),
        currentTurn: turnContext.currentTurn,
        progress: turnContext.progress,
    });

    const firstGraphResult = await interviewChatbotAiService.runInterviewGraph(graphPayload);

    if (firstGraphResult.turnScore) {
        addTurnScore(interviewSessionId, firstGraphResult.turnScore);
    }

    const controlledGraphResult = await resolveGraphResultWithNodeGuard({
        graphResult: firstGraphResult,
        graphPayload,
        progress: turnContext.progress,
        config: turnContext.config,
    });

    let nextQuestion = null;
    let progress = turnContext.progress;

    if (controlledGraphResult.question) {
        const controlledQuestion = applyNodeParentPolicyToQuestion({
            graphQuestion: controlledGraphResult.question,
            answeredQaId: interviewQaId,
        });

        const savedQuestion = await saveGeneratedQuestion({
            interviewSessionId,
            graphQuestion: controlledQuestion,
            config: turnContext.config,
        });

        progress = savedQuestion.progress;

        const audio = await buildQuestionAudioIfNeeded(
            turnContext.config,
            savedQuestion.question.questionContent
        );

        nextQuestion = {
            ...savedQuestion.question,
            audio,
        };
    }

    return {
        interviewSessionId,
        answeredQaId: interviewQaId,
        chatMode: runtimeConfig.chatMode,
        answer: {
            answerContent,
            transcribedText: resolvedAnswer.transcribedText,
        },
        turnScore: firstGraphResult.turnScore || null,
        nextAction: normalizeNextActionForClient(controlledGraphResult.nextAction),
        progress,
        question: nextQuestion,
        finishRequired: Boolean(controlledGraphResult.finishRequired),
        guardApplied: controlledGraphResult.guardApplied || false,
        guardReason: controlledGraphResult.guardReason || null,
        nextClientAction: controlledGraphResult.finishRequired
            ? "REQUEST_FINISH"
            : "SHOW_QUESTION",
    };
}

async function resolveAnswerContent({ chatMode, body, file }) {
    if (chatMode === "VOICE") {
        if (!file) {
            throw createError(400, "VOICE 모드에서는 audioFile이 필요합니다.");
        }

        let text;
        try {
            text = await elevenlabsService.transcribeAudio(file);
        } catch (e) {
            console.warn("ElevenLabs STT 실패, OpenAI Whisper로 폴백합니다.", e.message);
            text = await openaiSpeechService.transcribeAudio(file);
        }

        if (!text || !text.trim()) {
            throw createError(400, "음성 답변을 텍스트로 변환하지 못했습니다.");
        }

        return {
            answerContent: text.trim(),
            transcribedText: text.trim(),
        };
    }

    if (!body.answerContent || !body.answerContent.trim()) {
        throw createError(400, "answerContent는 필수입니다.");
    }

    return {
        answerContent: body.answerContent.trim(),
        transcribedText: null,
    };
}

async function saveAnswerFirst({ interviewSessionId, interviewQaId, answerContent }) {
    let conn;

    try {
        conn = await db.getConnection();

        const session = await interviewRepository.findSessionById(
            conn,
            interviewSessionId
        );

        if (!session) {
            throw createError(404, "면접 세션을 찾을 수 없습니다.");
        }

        if (session.sessionStatus !== "IN_PROGRESS") {
            throw createError(400, "진행 중인 면접 세션이 아닙니다.");
        }

        const qa = await interviewRepository.findQaById(
            conn,
            interviewSessionId,
            interviewQaId
        );

        if (!qa) {
            throw createError(404, "답변할 질문을 찾을 수 없습니다.");
        }

        const affected = await interviewRepository.updateAnswer(
            conn,
            interviewSessionId,
            interviewQaId,
            answerContent
        );

        if (affected < 1) {
            throw createError(500, "답변 저장에 실패했습니다.");
        }

        await interviewRepository.incrementAnswerCount(conn, interviewSessionId);

        await conn.commit();

    } catch (error) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (_) {}
        }

        throw error;

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function loadTurnContext({
    interviewSessionId,
    interviewQaId,
    answerContent,
    runtimeConfig,
}) {
    let conn;

    try {
        conn = await db.getConnection();

        const session = await interviewRepository.findSessionById(
            conn,
            interviewSessionId
        );

        if (!session) {
            throw createError(404, "면접 세션을 찾을 수 없습니다.");
        }

        const resumeText = await interviewContextRepository.findResumeContext(
            conn,
            session.resumeId
        );

        const jobPostingContext = await interviewContextRepository.findJobPostingContext(
            conn,
            session.jobPostingId
        );

        if (!jobPostingContext) {
            throw createError(404, "채용공고를 찾을 수 없습니다.");
        }

        const qas = await interviewRepository.findQasBySessionId(
            conn,
            interviewSessionId
        );

        const currentQa = qas.find((qa) => Number(qa.interviewQaId) === interviewQaId);

        if (!currentQa) {
            throw createError(404, "현재 질문 정보를 찾을 수 없습니다.");
        }

        const config = {
            ...runtimeConfig,
            resumeId: session.resumeId,
            jobPostingId: session.jobPostingId,
            interviewType: session.interviewType,
            interviewLevel: session.interviewLevel,
            interviewFormat: session.interviewFormat,
            targetCompany: runtimeConfig.targetCompany || jobPostingContext.jobPosting.companyName,
            jobPostingTitle: runtimeConfig.jobPostingTitle || jobPostingContext.jobPosting.postingTitle,
        };

        const previousQas = decorateQasWithQuestionSetNo(qas);
        const progress = calculateProgress(qas, config);

        return {
            session,
            config,
            resumeText,
            jobPostingText: jobPostingContext.contextText,
            previousQas,
            progress,
            currentTurn: {
                interviewQaId: currentQa.interviewQaId,
                parentQaId: currentQa.parentQaId,
                questionContent: currentQa.questionContent,
                answerContent,
                questionType: currentQa.questionType,
                followUpYn: currentQa.followUpYn,
            },
        };

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function saveGeneratedQuestion({ interviewSessionId, graphQuestion, config }) {
    let conn;

    try {
        conn = await db.getConnection();

        const questionOrder = await interviewRepository.findNextQuestionOrder(
            conn,
            interviewSessionId
        );

        const followUpYn = normalizeFollowUpYn(graphQuestion.followUpYn);
        const questionType = normalizeQuestionType(graphQuestion.questionType, followUpYn);

        const parentQaId = followUpYn === "Y"
            ? graphQuestion.parentQaId || null
            : null;

        const interviewQaId = await interviewRepository.createQa(
            conn,
            {
                interviewSessionId,
                parentQaId,
                questionOrder,
                questionType,
                interviewerRole: graphQuestion.interviewerRole || "면접관",
                questionContent: graphQuestion.questionContent,
                followUpYn,
            }
        );

        await interviewRepository.incrementQuestionCount(conn, interviewSessionId);

        await conn.commit();

        const qas = await interviewRepository.findQasBySessionId(conn, interviewSessionId);
        const progress = calculateProgress(qas, config);

        return {
            progress,
            question: {
                interviewQaId,
                parentQaId,
                questionSetNo: graphQuestion.questionSetNo || progress.currentQuestionSetNo,
                questionOrder,
                questionType,
                interviewerRole: graphQuestion.interviewerRole || "면접관",
                questionContent: graphQuestion.questionContent,
                followUpYn,
            },
        };

    } catch (error) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (_) {}
        }

        throw error;

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function finishInterview(params) {
    const interviewSessionId = Number(params.interviewSessionId);

    if (!interviewSessionId) {
        throw createError(400, "interviewSessionId가 올바르지 않습니다.");
    }

    const finishContext = await loadFinishContext(interviewSessionId);

    const graphPayload = buildGraphPayload({
        eventType: "FINISH",
        interviewSessionId,
        config: finishContext.config,
        resumeText: finishContext.resumeText,
        jobPostingText: finishContext.jobPostingText,
        previousQas: finishContext.previousQas,
        previousScores: getScores(interviewSessionId),
        currentTurn: null,
        progress: finishContext.progress,
    });

    const graphResult = await interviewChatbotAiService.runInterviewGraph(graphPayload);

    if (!graphResult.finalReport) {
        throw createError(502, "FastAPI가 최종 리포트를 반환하지 않았습니다.");
    }

    await saveFinalReportAndComplete({
        interviewSessionId,
        finalReport: graphResult.finalReport,
    });

    removeRuntimeConfig(interviewSessionId);

    // 면접 완료 후 2차 FINAL 분석 자동 트리거 (비동기 - 실패해도 면접 결과에 영향 없음)
    // 세션 생성 이후 이력서가 재업로드된 경우를 대비해 회원의 최신 resumeId를 조회해서 사용
    resolveLatestResumeId(finishContext.config.resumeId)
        .then((latestResumeId) => triggerFinalAnalysis({
            resumeId: latestResumeId,
            jobPostingId: finishContext.config.jobPostingId,
            companyName: finishContext.config.targetCompany || "",
            finalReport: graphResult.finalReport,
        }))
        .catch((err) => {
            console.error("[FINAL분석] 자동 트리거 실패 (무시됨):", err.message);
        });

    return {
        interviewSessionId,
        sessionStatus: "COMPLETED",
        finalReport: graphResult.finalReport,
        nextClientAction: "REDIRECT_REPORT",
    };
}

async function loadFinishContext(interviewSessionId) {
    let conn;

    try {
        conn = await db.getConnection();

        const session = await interviewRepository.findSessionById(
            conn,
            interviewSessionId
        );

        if (!session) {
            throw createError(404, "면접 세션을 찾을 수 없습니다.");
        }

        const runtimeConfig = getRuntimeConfig(interviewSessionId);

        const resumeText = await interviewContextRepository.findResumeContext(
            conn,
            session.resumeId
        );

        const jobPostingContext = await interviewContextRepository.findJobPostingContext(
            conn,
            session.jobPostingId
        );

        if (!jobPostingContext) {
            throw createError(404, "채용공고를 찾을 수 없습니다.");
        }

        const qas = await interviewRepository.findQasBySessionId(
            conn,
            interviewSessionId
        );

        const config = {
            ...runtimeConfig,
            resumeId: session.resumeId,
            jobPostingId: session.jobPostingId,
            interviewType: session.interviewType,
            interviewLevel: session.interviewLevel,
            interviewFormat: session.interviewFormat,
            targetCompany: runtimeConfig.targetCompany || jobPostingContext.jobPosting.companyName,
            jobPostingTitle: runtimeConfig.jobPostingTitle || jobPostingContext.jobPosting.postingTitle,
        };

        return {
            config,
            resumeText,
            jobPostingText: jobPostingContext.contextText,
            previousQas: decorateQasWithQuestionSetNo(qas),
            progress: calculateProgress(qas, config),
        };

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function saveFinalReportAndComplete({ interviewSessionId, finalReport }) {
    let conn;

    try {
        conn = await db.getConnection();

        const reportItems = finalReport.reportItems || [];

        if (!reportItems.length) {
            await interviewRepository.insertReportItem(conn, {
                interviewSessionId,
                logicScore: finalReport.logicScore,
                techUnderstandingScore: finalReport.techUnderstandingScore,
                businessLinkScore: finalReport.businessLinkScore,
                evidenceScore: finalReport.evidenceScore,
                jobFitScore: finalReport.jobFitScore,
                totalScore: finalReport.totalScore,
                feedbackContent: finalReport.summary || "최종 면접 리포트가 생성되었습니다.",
                feedbackType: "SUMMARY",
                displayOrder: 1,
            });
        } else {
            for (const item of reportItems) {
                await interviewRepository.insertReportItem(conn, {
                    interviewSessionId,
                    logicScore: finalReport.logicScore,
                    techUnderstandingScore: finalReport.techUnderstandingScore,
                    businessLinkScore: finalReport.businessLinkScore,
                    evidenceScore: finalReport.evidenceScore,
                    jobFitScore: finalReport.jobFitScore,
                    totalScore: finalReport.totalScore,
                    feedbackContent: item.feedbackContent,
                    feedbackType: item.feedbackType,
                    displayOrder: item.displayOrder,
                });
            }
        }

        await interviewRepository.completeSession(conn, interviewSessionId);

        await conn.commit();

    } catch (error) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (_) {}
        }

        throw error;

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

function buildStartConfig(body) {
    return {
        resumeId: Number(body.resumeId),
        jobPostingId: Number(body.jobPostingId),
        targetCompany: body.targetCompany || null,
        jobPostingTitle: body.jobPostingTitle || null,
        interviewType: body.interviewType || "GENERAL",
        interviewLevel: DEFAULT_RUNTIME_CONFIG.interviewLevel,
        interviewFormat: DEFAULT_RUNTIME_CONFIG.interviewFormat,
        interviewerStyle: body.interviewerStyle || DEFAULT_RUNTIME_CONFIG.interviewerStyle,
        questionSetCount: Number(
            body.questionSetCount || DEFAULT_RUNTIME_CONFIG.questionSetCount
        ),
        maxFollowUpPerQuestion: Number(
            body.maxFollowUpPerQuestion || DEFAULT_RUNTIME_CONFIG.maxFollowUpPerQuestion
        ),
        chatMode: body.chatMode || DEFAULT_RUNTIME_CONFIG.chatMode,
        portfolioId: DEFAULT_RUNTIME_CONFIG.portfolioId,
    };
}

function validateStartBody(body) {
    if (!body.resumeId) {
        throw createError(400, "resumeId는 필수입니다.");
    }

    if (!body.jobPostingId) {
        throw createError(400, "jobPostingId는 필수입니다.");
    }

    const interviewType = body.interviewType || "GENERAL";
    if (!["GENERAL", "PRESSURE"].includes(interviewType)) {
        throw createError(400, "interviewType은 GENERAL 또는 PRESSURE만 가능합니다.");
    }

    const chatMode = body.chatMode || "TEXT";
    if (!["TEXT", "VOICE"].includes(chatMode)) {
        throw createError(400, "chatMode는 TEXT 또는 VOICE만 가능합니다.");
    }

    const interviewerStyle = body.interviewerStyle || "NORMAL";
    if (!["NORMAL", "CALM", "SHARP", "FRIENDLY", "PRACTICAL"].includes(interviewerStyle)) {
        throw createError(400, "interviewerStyle 값이 올바르지 않습니다.");
    }

    const questionSetCount = Number(
        body.questionSetCount || DEFAULT_RUNTIME_CONFIG.questionSetCount
    );

    if (![3, 5, 7].includes(questionSetCount)) {
        throw createError(400, "questionSetCount는 3, 5, 7 중 하나여야 합니다.");
    }

    const maxFollowUpPerQuestion = Number(
        body.maxFollowUpPerQuestion || DEFAULT_RUNTIME_CONFIG.maxFollowUpPerQuestion
    );

    if (![0, 1, 2, 3].includes(maxFollowUpPerQuestion)) {
        throw createError(400, "maxFollowUpPerQuestion은 0, 1, 2, 3 중 하나여야 합니다.");
    }
}

function buildInterviewTitle(config, jobPosting) {
    const companyName = config.targetCompany || jobPosting.companyName || "기업";
    const jobTitle = config.jobPostingTitle || jobPosting.postingTitle || "공고";
    const typeName = config.interviewType === "PRESSURE" ? "압박면접" : "일반면접";

    return `${companyName} ${jobTitle} ${typeName}`;
}

function buildGraphPayload({
    eventType,
    interviewSessionId,
    config,
    resumeText,
    jobPostingText,
    weakPointsText = "",
    previousQas,
    previousScores,
    currentTurn,
    progress,
    extraControl = {},
}) {
    return {
        eventType,
        session: {
            interviewSessionId,
            resumeId: config.resumeId,
            jobPostingId: config.jobPostingId,
            targetCompany: config.targetCompany,
            jobPostingTitle: config.jobPostingTitle,
            interviewType: config.interviewType,
            interviewLevel: config.interviewLevel,
            interviewFormat: config.interviewFormat,
            interviewerStyle: config.interviewerStyle,
            chatMode: config.chatMode,
        },
        control: {
            questionSetCount: config.questionSetCount,
            maxFollowUpPerQuestion: config.maxFollowUpPerQuestion,
            currentQuestionSetNo: progress.currentQuestionSetNo,
            currentBaseQuestionId: progress.currentBaseQuestionId,
            currentFollowUpCount: progress.currentFollowUpCount,
            remainingQuestionSetCount: progress.remainingQuestionSetCount,
            remainingFollowUpCount: progress.remainingFollowUpCount,
            totalQuestionCount: progress.totalQuestionCount,
            totalAnswerCount: progress.totalAnswerCount,
            followUpAllowed: progress.remainingFollowUpCount > 0,
            forceNextAction: null,
            guardReason: null,

            ...extraControl,
        },
        context: {
            resumeText,
            jobPostingText,
            portfolioText: "",
            weakPointsText,
        },
        history: {
            previousQas,
            previousScores,
        },
        currentTurn,
    };
}

function decorateQasWithQuestionSetNo(qas) {
    let questionSetNo = 0;

    return qas.map((qa) => {
        if (qa.followUpYn === "N") {
            questionSetNo += 1;
        }

        return {
            interviewQaId: qa.interviewQaId,
            parentQaId: qa.parentQaId,
            questionSetNo,
            questionOrder: qa.questionOrder,
            questionType: qa.questionType,
            interviewerRole: qa.interviewerRole,
            questionContent: qa.questionContent,
            answerContent: qa.answerContent,
            followUpYn: qa.followUpYn,
        };
    });
}

function calculateProgress(qas, config) {
    const sortedQas = [...qas].sort(
        (a, b) => Number(a.questionOrder) - Number(b.questionOrder)
    );

    let currentQuestionSetNo = 0;
    let currentBaseQuestionId = null;
    let currentFollowUpCount = 0;

    for (const qa of sortedQas) {
        if (qa.followUpYn === "N") {
            currentQuestionSetNo += 1;
            currentBaseQuestionId = qa.interviewQaId;
            currentFollowUpCount = 0;
        } else if (qa.followUpYn === "Y") {
            currentFollowUpCount += 1;
        }
    }

    const questionSetCount = Number(config.questionSetCount || 0);
    const maxFollowUpPerQuestion = Number(config.maxFollowUpPerQuestion || 0);

    return {
        questionSetCount,
        currentQuestionSetNo,
        currentBaseQuestionId,
        currentFollowUpCount,
        maxFollowUpPerQuestion,
        remainingQuestionSetCount: Math.max(
            questionSetCount - currentQuestionSetNo,
            0
        ),
        remainingFollowUpCount: Math.max(
            maxFollowUpPerQuestion - currentFollowUpCount,
            0
        ),
        totalQuestionCount: sortedQas.length,
        totalAnswerCount: sortedQas.filter((qa) => !!qa.answerContent).length,
    };
}

async function resolveGraphResultWithNodeGuard({
    graphResult,
    graphPayload,
    progress,
    config,
}) {
    const wantsFollowUp = isFollowUpGraphResult(graphResult);

    const followUpLimitReached =
        Number(progress.currentFollowUpCount || 0) >=
        Number(config.maxFollowUpPerQuestion || 0);

    const baseQuestionLimitReached =
        Number(progress.currentQuestionSetNo || 0) >=
        Number(config.questionSetCount || 0);

    if (!wantsFollowUp || !followUpLimitReached) {
        return {
            ...graphResult,
            nextAction: normalizeNextActionForClient(graphResult.nextAction),
            guardApplied: false,
            guardReason: null,
        };
    }

    if (baseQuestionLimitReached) {
        return {
            ...graphResult,
            question: null,
            nextAction: "FINISH_INTERVIEW",
            finishRequired: true,
            guardApplied: true,
            guardReason: "현재 기본질문 세트의 꼬리질문 최대 개수에 도달했고, 기본 질문 세트도 완료되어 면접 종료로 전환합니다.",
        };
    }

    const nextBasePayload = {
        ...graphPayload,
        control: {
            ...graphPayload.control,
            followUpAllowed: false,
            forceNextAction: "NEXT_BASE_QUESTION",
            guardReason: "Node에서 현재 기본질문 세트의 꼬리질문 최대 개수에 도달했다고 판단했습니다. 다음 기본 질문을 생성해야 합니다.",
        },
    };

    const nextBaseResult = await interviewChatbotAiService.runInterviewGraph(nextBasePayload);

    if (!nextBaseResult.question) {
        throw createError(
            502,
            "꼬리질문 제한 도달 후 FastAPI가 다음 기본 질문을 반환하지 않았습니다."
        );
    }

    if (isFollowUpGraphResult(nextBaseResult)) {
        throw createError(
            502,
            "FastAPI가 꼬리질문 제한을 초과하여 FOLLOW_UP을 반환했습니다. FastAPI 프롬프트에서 forceNextAction 처리 규칙을 확인해야 합니다."
        );
    }

    return {
        ...nextBaseResult,
        nextAction: "ASK_NEXT_BASE_QUESTION",
        finishRequired: false,
        guardApplied: true,
        guardReason: "현재 기본질문 세트의 꼬리질문 최대 개수에 도달하여 다음 기본 질문으로 전환했습니다.",
    };
}

function isFollowUpGraphResult(graphResult) {
    if (!graphResult) {
        return false;
    }

    if (["FOLLOW_UP", "ASK_FOLLOW_UP"].includes(graphResult.nextAction)) {
        return true;
    }

    if (graphResult.question?.followUpYn === "Y") {
        return true;
    }

    if (graphResult.question?.questionType === "FOLLOW_UP") {
        return true;
    }

    return false;
}

function applyNodeParentPolicyToQuestion({ graphQuestion, answeredQaId }) {
    const followUpYn = normalizeFollowUpYn(graphQuestion.followUpYn);

    return {
        ...graphQuestion,
        followUpYn,
        questionType: normalizeQuestionType(graphQuestion.questionType, followUpYn),
        parentQaId: followUpYn === "Y"
            ? Number(answeredQaId)
            : null,
    };
}

function normalizeFollowUpYn(value) {
    return value === "Y" ? "Y" : "N";
}

function normalizeQuestionType(questionType, followUpYn) {
    if (followUpYn === "Y") {
        return "FOLLOW_UP";
    }

    const allowed = [
        "BASIC",
        "FOLLOW_UP",
        "PRESSURE",
        "TECH",
        "PROJECT",
        "EXPERIENCE",
        "JOB_FIT",
        "PERSONALITY",
        "TREND",
    ];

    if (allowed.includes(questionType)) {
        return questionType;
    }

    return "BASIC";
}

function normalizeNextActionForClient(nextAction) {
    if (nextAction === "FOLLOW_UP") {
        return "ASK_FOLLOW_UP";
    }

    if (nextAction === "NEXT_BASE_QUESTION") {
        return "ASK_NEXT_BASE_QUESTION";
    }

    if (nextAction === "FINISH") {
        return "FINISH_INTERVIEW";
    }

    return nextAction;
}

async function buildQuestionAudioIfNeeded(config, questionContent) {
    if (config.chatMode !== "VOICE") {
        return null;
    }

    try {
        return await elevenlabsService.synthesizeSpeech(questionContent);
    } catch (e) {
        console.warn("ElevenLabs TTS 실패, OpenAI TTS로 폴백합니다.", e.message);
        return await openaiSpeechService.synthesizeSpeech(questionContent);
    }
}

function createError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

/**
 * 1차 분석 metrics에서 약점 텍스트 생성 (score < 60인 항목)
 */
function buildWeakPoints(resumeRec) {
    if (!resumeRec || !resumeRec.metrics) return "";

    const METRIC_LABELS = {
        business_fit: "비즈니스 이해도",
        tech_stack_fit: "기술스택 적합도",
        requirement_fit: "경력/요건 충족도",
        action_result_fit: "성과/행동 역량",
        culture_fit: "문화적 적합도",
    };

    const weak = Object.entries(resumeRec.metrics)
        .filter(([, v]) => (v.score ?? 100) < 60)
        .sort(([, a], [, b]) => (a.score ?? 100) - (b.score ?? 100));

    if (weak.length === 0) return "";

    const lines = weak.map(([type, v]) =>
        `- ${METRIC_LABELS[type] || type}: ${v.score}점 (${v.reasonText || ""})`
    );

    return `[1차 분석 약점 영역]\n${lines.join("\n")}`;
}

/**
 * 면접 완료 후 2차 FINAL 분석 자동 저장
 *
 * 1차 RESUME metrics + 면접 점수를 합산하여
 * COMPANY_RECOMMENDATION (FINAL stage)에 저장한다.
 * 해당 resumeId + jobPostingId 의 FINAL 결과만 교체한다.
 */
/**
 * 세션의 resumeId로 해당 회원의 최신 resumeId를 반환한다.
 * 이력서 재업로드 시 세션에 저장된 resumeId가 구버전일 수 있으므로
 * 항상 최신 이력서 기준으로 FINAL 분석을 수행하기 위해 사용한다.
 */
async function resolveLatestResumeId(sessionResumeId) {
    const conn = await db.getConnection();
    try {
        const memberId = await resumeRepository.findMemberIdByResume(sessionResumeId, conn);
        if (!memberId) return sessionResumeId;
        const latestResumeId = await resumeRepository.findLatestResumeByMember(memberId, conn);
        return latestResumeId ?? sessionResumeId;
    } finally {
        await conn.close();
    }
}

async function triggerFinalAnalysis({ resumeId, jobPostingId, companyName, finalReport }) {
    let conn;

    console.log(`[FINAL분석] 시작 — resumeId:${resumeId}, jobPostingId:${jobPostingId}, companyName:${companyName}`);

    try {
        conn = await db.getConnection();

        // 1차 RESUME metrics 조회
        const resumeRec = await resumeAnalysisRepository.findRecommendationByResumeAndJob(
            conn,
            resumeId,
            jobPostingId,
            "RESUME"
        );

        if (!resumeRec || !resumeRec.metrics) {
            console.warn("[FINAL분석] 1차 분석 결과 없음 — FINAL 분석 생략");
            return;
        }

        const interviewData = {
            logic_score: finalReport.logicScore,
            tech_understanding_score: finalReport.techUnderstandingScore,
            business_link_score: finalReport.businessLinkScore,
            evidence_score: finalReport.evidenceScore,
            job_fit_score: finalReport.jobFitScore,
        };

        const resumeData = {
            metrics: {
                business_fit: {
                    score: resumeRec.metrics.business_fit?.score ?? 0,
                    reason_text: resumeRec.metrics.business_fit?.reasonText ?? "",
                },
                tech_stack_fit: {
                    score: resumeRec.metrics.tech_stack_fit?.score ?? 0,
                    reason_text: resumeRec.metrics.tech_stack_fit?.reasonText ?? "",
                },
                requirement_fit: {
                    score: resumeRec.metrics.requirement_fit?.score ?? 0,
                    reason_text: resumeRec.metrics.requirement_fit?.reasonText ?? "",
                },
                action_result_fit: {
                    score: resumeRec.metrics.action_result_fit?.score ?? 0,
                    reason_text: resumeRec.metrics.action_result_fit?.reasonText ?? "",
                },
                culture_fit: {
                    score: resumeRec.metrics.culture_fit?.score ?? 0,
                    reason_text: resumeRec.metrics.culture_fit?.reasonText ?? "",
                },
            },
        };

        // AI /interview/final-match 호출
        const finalMatchResult = await interviewChatbotAiService.callFinalMatch({
            resume_id: resumeId,
            job_posting_id: jobPostingId,
            company_name: companyName,
            resume: resumeData,
            interview: interviewData,
        });

        if (!finalMatchResult || !finalMatchResult.analysis) {
            console.warn("[FINAL분석] AI 응답 없음 — FINAL 분석 생략");
            return;
        }

        const { analysis } = finalMatchResult;
        const metrics = analysis.metrics;

        // 기존 FINAL 결과 삭제 (이 공고만)
        await resumeAnalysisRepository.deleteRecommendationByResumeJobStage(
            { resumeId, jobPostingId, analysisStage: "FINAL" },
            conn
        );

        // 새 FINAL 결과 저장
        const recommendationId = await resumeAnalysisRepository.createCompanyRecommendation(
            {
                resumeId,
                jobPostingId,
                analysisStage: "FINAL",
                overallScore: analysis.overall_score,
                latestInterviewId: null,
                recommendRank: resumeRec.recommendRank || 1,
            },
            conn
        );

        const METRIC_KEYS = [
            "business_fit",
            "tech_stack_fit",
            "requirement_fit",
            "action_result_fit",
            "culture_fit",
        ];

        for (const key of METRIC_KEYS) {
            const m = metrics[key];
            if (!m) continue;
            await resumeAnalysisRepository.createRecommendationMetricDetail(
                {
                    recommendationId,
                    metricType: key,
                    score: m.score,
                    reasonText: m.reason_text || m.reasonText || "",
                },
                conn
            );
        }

        // 2차 액션 플랜 저장
        const actionPlans = analysis.action_plans || [];
        for (const plan of actionPlans) {
            await resumeAnalysisRepository.createRecommendationAction(
                {
                    recommendationId,
                    category:    plan.category            ?? "ACTION",
                    title:       plan.action_plan_title   ?? "액션 플랜",
                    description: plan.action_plan_summary ?? "",
                    type:        "FINAL",
                    priority:    plan.priority            ?? 1,
                },
                conn
            );
        }

        await conn.commit();

        console.log(
            `[FINAL분석] 완료 — resumeId:${resumeId}, jobPostingId:${jobPostingId}, score:${analysis.overall_score}, 액션플랜:${actionPlans.length}개`
        );

    } catch (err) {
        if (conn) {
            try { await conn.rollback(); } catch (_) {}
        }
        throw err;

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function getSessionsByMemberId(memberId) {
    const conn = await db.getConnection();
    try {
        const sessions = await interviewRepository.findSessionsByMemberId(conn, memberId);
        return { success: true, message: "면접 세션 목록 조회 성공", data: sessions };
    } finally {
        await conn.close();
    }
}


async function getInterviewHistory(interviewSessionId) {
    const conn = await db.getConnection();
    try {
        const data = await interviewRepository.findHistoryBySessionId(conn, interviewSessionId);
        if (!data) {
            const err = new Error("세션을 찾을 수 없습니다.");
            err.statusCode = 404;
            throw err;
        }
        return { success: true, message: "면접 이력 조회 성공", data };
    } finally {
        await conn.close();
    }
}

async function getInterviewReport(interviewSessionId) {
    const conn = await db.getConnection();
    try {
        const items = await interviewRepository.findReportBySessionId(conn, interviewSessionId);
        return { success: true, message: "면접 리포트 조회 성공", data: items };
    } finally {
        await conn.close();
    }
}

module.exports = {
    getInterviewHistory,
    getInterviewReport,
    getSessionsByMemberId,
    startInterview,
    submitAnswer,
    finishInterview,
};