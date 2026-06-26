const axios = require("axios");

const aiClient = axios.create({
    baseURL: process.env.AI_SERVER_BASE_URL || "http://127.0.0.1:5000",
    headers: {
        "Content-Type": "application/json",
    },
    timeout: Number(process.env.AI_TIMEOUT ?? 0),
});

console.log("AI_SERVER_BASE_URL:", process.env.AI_SERVER_BASE_URL || "http://127.0.0.1:5000");
console.log("aiClient created:", !!aiClient);
console.log("aiClient.post exists:", typeof aiClient.post);

module.exports = {
    aiClient,
};