const axios = require("axios");

const aiClient = axios.create({
    baseURL: process.env.AI_SERVER_BASE_URL || "http://127.0.0.1:5000",
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 0, // 타임아웃 없음. 필요시 개별 지정하기.
});

module.exports = aiClient;