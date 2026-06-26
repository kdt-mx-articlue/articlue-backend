const aiClient = require("../../config/ai.config");

async function analyzeResume(resume) {

    const response = await aiClient.post(
        "/resume/analyze",
        resume
    );

    return response.data;
}

module.exports = {
    analyzeResume,
};