const axios = require("axios");
const FormData = require("form-data");

const ELEVENLABS_BASE_URL =
    process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const ELEVENLABS_STT_MODEL_ID =
    process.env.ELEVENLABS_STT_MODEL_ID || "scribe_v2";

const ELEVENLABS_TTS_VOICE_ID =
    process.env.ELEVENLABS_TTS_VOICE_ID;

const ELEVENLABS_TTS_MODEL_ID =
    process.env.ELEVENLABS_TTS_MODEL_ID || "eleven_multilingual_v2";

const ELEVENLABS_TTS_OUTPUT_FORMAT =
    process.env.ELEVENLABS_TTS_OUTPUT_FORMAT || "mp3_44100_128";

/**
 * ElevenLabs STT
 *
 * audioFile:
 * - multer memoryStorage로 받은 req.file
 */
async function transcribeAudio(audioFile) {
    validateElevenLabsApiKey();

    if (!audioFile || !audioFile.buffer) {
        throw createError(400, "음성 파일이 없습니다.");
    }

    try {
        const form = new FormData();

        form.append("model_id", ELEVENLABS_STT_MODEL_ID);

        form.append("file", audioFile.buffer, {
            filename: audioFile.originalname || "answer.webm",
            contentType: audioFile.mimetype || "application/octet-stream",
        });

        const response = await axios.post(
            `${ELEVENLABS_BASE_URL}/v1/speech-to-text`,
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    "xi-api-key": ELEVENLABS_API_KEY,
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 60_000,
            }
        );

        const text = response.data?.text;

        if (!text || !String(text).trim()) {
            throw createError(502, "ElevenLabs STT 결과가 비어 있습니다.");
        }

        return String(text).trim();

    } catch (error) {
        if (error.status) {
            throw error;
        }

        throw buildElevenLabsError(error, "ElevenLabs STT 호출 실패");
    }
}

/**
 * ElevenLabs TTS
 *
 * 반환:
 * {
 *   audioBase64,
 *   mimeType,
 *   outputFormat
 * }
 */
async function synthesizeSpeech(text) {
    validateElevenLabsApiKey();

    if (!ELEVENLABS_TTS_VOICE_ID) {
        throw createError(500, "ELEVENLABS_TTS_VOICE_ID가 설정되지 않았습니다.");
    }

    if (!text || !String(text).trim()) {
        return null;
    }

    try {
        const response = await axios.post(
            `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_TTS_VOICE_ID}`,
            {
                text: String(text).trim(),
                model_id: ELEVENLABS_TTS_MODEL_ID,
            },
            {
                headers: {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                    Accept: "audio/mpeg",
                },
                params: {
                    output_format: ELEVENLABS_TTS_OUTPUT_FORMAT,
                },
                responseType: "arraybuffer",
                timeout: 60_000,
            }
        );

        const audioBuffer = Buffer.from(response.data);

        return {
            audioBase64: audioBuffer.toString("base64"),
            mimeType: "audio/mpeg",
            outputFormat: ELEVENLABS_TTS_OUTPUT_FORMAT,
        };

    } catch (error) {
        throw buildElevenLabsError(error, "ElevenLabs TTS 호출 실패");
    }
}

function validateElevenLabsApiKey() {
    if (!ELEVENLABS_API_KEY) {
        throw createError(500, "ELEVENLABS_API_KEY가 설정되지 않았습니다.");
    }
}

function buildElevenLabsError(error, defaultMessage) {
    if (error.response) {
        const responseBody = Buffer.isBuffer(error.response.data)
            ? error.response.data.toString("utf-8")
            : error.response.data;

        const customError = new Error(
            `${defaultMessage}: ${JSON.stringify(responseBody)}`
        );
        customError.status = 502;
        return customError;
    }

    if (error.code === "ECONNABORTED") {
        const customError = new Error(`${defaultMessage}: 요청 시간이 초과되었습니다.`);
        customError.status = 504;
        return customError;
    }

    const customError = new Error(`${defaultMessage}: ${error.message}`);
    customError.status = 502;
    return customError;
}

function createError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

module.exports = {
    transcribeAudio,
    synthesizeSpeech,
};