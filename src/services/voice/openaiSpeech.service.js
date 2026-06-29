const OpenAI = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TTS_MODEL = "tts-1";
const TTS_VOICE = "alloy";
const STT_MODEL = "whisper-1";

/**
 * OpenAI TTS (tts-1)
 * ElevenLabs TTS 실패 시 폴백으로 사용
 *
 * @param {string} text
 * @returns {{ audioBase64: string, mimeType: string }}
 */
async function synthesizeSpeech(text) {
    const response = await client.audio.speech.create({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: text,
        response_format: "mp3",
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
        audioBase64: buffer.toString("base64"),
        mimeType: "audio/mpeg",
    };
}

/**
 * OpenAI Whisper STT (whisper-1)
 * ElevenLabs STT 실패 시 폴백으로 사용
 *
 * @param {import("express").Request["file"]} audioFile - multer memoryStorage 파일
 * @returns {string}
 */
async function transcribeAudio(audioFile) {
    const { Readable } = require("stream");

    const stream = Readable.from(audioFile.buffer);
    stream.path = audioFile.originalname || "answer.webm";

    const transcription = await client.audio.transcriptions.create({
        model: STT_MODEL,
        file: stream,
        language: "ko",
    });

    return (transcription.text || "").trim();
}

module.exports = { synthesizeSpeech, transcribeAudio };
