const runtimeStore = new Map();

const DEFAULT_RUNTIME_CONFIG = {
    interviewLevel: "NORMAL",
    interviewFormat: "ONE_TO_ONE",
    interviewerStyle: "NORMAL",
    questionSetCount: 3,
    maxFollowUpPerQuestion: 3,
    chatMode: "TEXT",
    portfolioId: null,
    scores: [],
};

function setRuntimeConfig(interviewSessionId, config) {
    runtimeStore.set(Number(interviewSessionId), {
        ...DEFAULT_RUNTIME_CONFIG,
        ...config,
        scores: [],
    });
}

function getRuntimeConfig(interviewSessionId) {
    return runtimeStore.get(Number(interviewSessionId)) || {
        ...DEFAULT_RUNTIME_CONFIG,
        scores: [],
    };
}

function addTurnScore(interviewSessionId, score) {
    const key = Number(interviewSessionId);
    const current = getRuntimeConfig(key);
    const scores = Array.isArray(current.scores) ? current.scores : [];

    runtimeStore.set(key, {
        ...current,
        scores: [...scores, score],
    });
}

function getScores(interviewSessionId) {
    const current = getRuntimeConfig(interviewSessionId);
    return Array.isArray(current.scores) ? current.scores : [];
}

function removeRuntimeConfig(interviewSessionId) {
    runtimeStore.delete(Number(interviewSessionId));
}

module.exports = {
    DEFAULT_RUNTIME_CONFIG,
    setRuntimeConfig,
    getRuntimeConfig,
    addTurnScore,
    getScores,
    removeRuntimeConfig,
};