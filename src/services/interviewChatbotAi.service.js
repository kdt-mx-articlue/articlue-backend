const { aiClient } = require("../config/ai.config");

/**
 * FastAPI LangGraph 면접 챗봇 실행
 *
 * 주의:
 * - TEXT / VOICE 여부와 관계없이 FastAPI에는 항상 텍스트 기반 payload만 보낸다.
 * - STT/TTS는 Node.js의 ElevenLabs service에서 처리한다.
 */
async function runInterviewGraph(payload) {
    try {
        const response = await aiClient.post(
            "/api/interview-graph/run",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        return response.data;

    } catch (error) {
        throw buildAiError(error, "FastAPI 면접 챗봇 호출 실패");
    }
}

function buildAiError(error, defaultMessage) {
    if (error.response) {
        const customError = new Error(
            `${defaultMessage}: ${JSON.stringify(error.response.data)}`
        );
        customError.status = 502;
        return customError;
    }

    if (error.code === "ECONNREFUSED") {
        const customError = new Error("FastAPI 서버에 연결할 수 없습니다.");
        customError.status = 502;
        return customError;
    }

    const customError = new Error(`${defaultMessage}: ${error.message}`);
    customError.status = 502;
    return customError;
}

module.exports = {
    runInterviewGraph,
};