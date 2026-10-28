const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");

/**
 * 채용공고 수집 공통 유틸
 * - 로그인 없이 공개된 목록/상세만 수집, 요청 사이 지연을 둬 대상 사이트 부하 최소화
 */
const REQUEST_TIMEOUT = 15000;
const REQUEST_DELAY_MS = Number(process.env.JOB_CRAWL_DELAY_MS || 1500);

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
};

const http = axios.create({
    headers: DEFAULT_HEADERS,
    timeout: REQUEST_TIMEOUT,
    maxContentLength: 5 * 1024 * 1024,
});

function sleep(ms = REQUEST_DELAY_MS) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(text) {
    return crypto.createHash("sha256").update(String(text)).digest("hex");
}

/** HTML → 줄바꿈을 살린 평문 */
function htmlToText(html) {
    if (!html) return "";

    const $ = cheerio.load(html);
    $("script,style,noscript,iframe,svg,button,form").remove();
    $("br").replaceWith("\n");
    $("p,div,li,tr,h1,h2,h3,h4,section").append("\n");

    return normalizeText($.root().text());
}

function normalizeText(text) {
    return String(text || "")
        .replace(/\r/g, "")
        .replace(/[ \t ]+/g, " ")
        .replace(/\n\s*\n\s*\n+/g, "\n\n")
        .trim();
}

function truncate(text, max) {
    const value = String(text || "");
    return value.length > max ? value.slice(0, max) : value;
}

/** "YYYY-MM-DD..." 또는 Date 로 변환 가능한 값 → Date | null */
function toDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

// 사람인·잡코리아 키워드 검색에는 광고·비개발 공고가 섞여 있어 제목/직무분야로 한 번 더 거른다
const DEV_POSTING_PATTERN = new RegExp(
    [
        "개발", "developer", "백엔드", "back-?end", "프론트", "front-?end", "풀스택", "full-?stack",
        "서버", "server", "소프트웨어", "software", "데이터\\s*(엔지니어|사이언|분석)", "data\\s*(engineer|scien)",
        "\\bai\\b", "\\bml\\b", "머신러닝", "machine\\s*learning", "llm", "devops", "\\bsre\\b",
        "클라우드", "cloud", "인프라", "플랫폼\\s*엔지니어", "\\bqa\\b", "ios", "android", "안드로이드",
        "웹\\s*(개발|퍼블리)", "\\bweb\\b",
    ].join("|"),
    "i"
);

function isDevPosting(...texts) {
    return DEV_POSTING_PATTERN.test(texts.filter(Boolean).join(" "));
}

function getKeywords() {
    return String(process.env.JOB_CRAWL_KEYWORDS || "백엔드,프론트엔드,풀스택,데이터 엔지니어,AI 엔지니어")
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean);
}

module.exports = {
    http,
    cheerio,
    sleep,
    sha256,
    htmlToText,
    normalizeText,
    truncate,
    toDate,
    isDevPosting,
    getKeywords,
    DEFAULT_HEADERS,
};
