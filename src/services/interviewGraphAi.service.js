const FormData = require("form-data");
const { aiClient } = require("../config/ai.config");

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
        console.error("FastAPI 면접 챗봇 호출 원본 에러:", error);

        throw buildAiError(error, "FastAPI 면접 챗봇 호출 실패");
    }
}

async function transcribeAudio(file, language = "ko") {
    try {
        const form = new FormData();

        form.append("audioFile", file.buffer, {
            filename: file.originalname || "answer.webm",
            contentType: file.mimetype || "application/octet-stream",
        });

        form.append("language", language);

        const response = await aiClient.post(
            "/api/interview-graph/stt",
            form,
            {
                headers: form.getHeaders(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            }
        );

        return response.data.text;

    } catch (error) {
        console.error("FastAPI STT 원본 에러:", error);
        throw buildAiError(error, "FastAPI STT 호출 실패");
    }
}

async function synthesizeSpeech(text, language = "ko") {
    try {
        const response = await aiClient.post(
            "/api/interview-graph/tts",
            { text, language },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        return response.data;

    } catch (error) {
        console.error("FastAPI TTS 호출 실패:", error.message);
        return null;
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
    transcribeAudio,
    synthesizeSpeech,
};