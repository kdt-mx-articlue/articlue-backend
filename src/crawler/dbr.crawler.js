const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require("playwright");

// [엄격한 규칙]
// fs, path 모듈 사용 금지
// articleContext.util.js 호출 금지
// 필터링, 개수 제한(5개), ID 생성 금지 (모두 Service/Pipeline 위임)

const DBR_BASE_URL = 'https://dbr.donga.com';
const DBR_AJAX_URL = 'https://dbr.donga.com/article/viewmore/1904';

// 설정 상수 분리
const REQUEST_TIMEOUT = 10000;
const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9"
};

/**
 * URL이 상대경로일 경우 절대경로로 변환합니다.
 */
function resolveUrl(urlPath) {
    if (!urlPath) return null;
    return urlPath.startsWith('http') ? urlPath : `${DBR_BASE_URL}${urlPath}`;
}

/**
 * "443호 (2026년 6월 Issue 2)" 형식에서 날짜(YYYY.MM.DD) 추출 시도
 * 추출 실패 시 크롤링 당일 날짜의 YYYY.MM.01 로 폴백(Fallback)
 */
function extractDateFromIssue(issueText) {
    if (!issueText) return null;
    
    const match = issueText.match(/(\d{4})년\s*(\d{1,2})월/);
    if (match) {
        const year = match[1];
        const month = match[2].padStart(2, '0');
        return `${year}.${month}.01`;
    }
    
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}.${m}.01`;
}

/**
 * [Step 1] 기사 목록 수집 (List Crawling)
 */
async function crawlList(startNum = 1, endNum = 20) {
    try {
        const params = new URLSearchParams({
            start_num: startNum,
            end_num: endNum
        });

        const response = await axios.post(DBR_AJAX_URL, params.toString(), {
            headers: {
                ...DEFAULT_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: REQUEST_TIMEOUT
        });

        const $ = cheerio.load(response.data);
        const articles = [];

        $('li.js-load').each((index, element) => {
            const title = $(element).find('.aticle_tit').text().trim();
            const preview = $(element).find('.aticle_txt').text().trim();
            const rawUrl = $(element).find('a').first().attr('href'); 
            const rawThumbnail = $(element).find('.thunb_img img').attr('src');
            const issueText = $(element).find('.article_issue').text().trim();

            if (!title) return true; // 비정상 태그 스킵

            articles.push({
                title,
                preview,
                url: resolveUrl(rawUrl),
                thumbnail: resolveUrl(rawThumbnail),
                source: "DBR",
                publishedAt: extractDateFromIssue(issueText)
            });
        });

        return articles;

    } catch (error) {
        throw new Error(`[DBR_CRAWL_ERROR] 목록 수집 실패 - ${error.message}`);
    }
}

/**
 * [Step 2] 기사 본문 수집 (Deep Crawling)
 */
async function crawlArticle(url) {

    let context;

    if (!url) return "";

    console.log("=================================================");
    console.log("URL :", url);

    try {

        context = await chromium.launchPersistentContext(
            "./browser/chrome-profile",
            {
                channel: "chrome",
                headless: true
            }
        );
        
        const page = await context.newPage();

        await page.goto(url, {
            waitUntil: "networkidle",
            timeout: REQUEST_TIMEOUT
        });

        const html = await page.content();

        const isLogin = await page.locator("text=로그인").count();

        if (isLogin > 0) {
            throw new Error("DBR 로그인 세션이 만료되었습니다.");
        }       

        const $ = cheerio.load(html);

        // ===============================
        // 기존 selector 검사
        // ===============================

        let rawBody = "";

        const selectors = [
            ".article-free-zone",
            ".cont-article",
            ".articleBody",
            "#article_content",
            ".article_body",
            ".article_txt",
            ".view_con",
            ".article_view",
            "article",
            "main"
        ];

        for (const selector of selectors) {

            const target = $(selector);

            console.log(
                `Selector [${selector}] -> ${target.length}`
            );

            if (target.length > 0) {

                target.find(
                    "script,style,iframe,form,button,noscript,svg"
                ).remove();

                target.find("br").replaceWith("\n");

                target.find("p").append("\n\n");

                target.find("div,section,article").append("\n");

                target.find("li").append("\n");

                rawBody = target.text().trim();

                console.log(
                    "선택된 Selector :",
                    selector
                );

                console.log(
                    "본문 길이 :",
                    rawBody.length
                );

                break;
            }
        }

        if (!rawBody) {

            console.warn("본문 Selector를 찾지 못했습니다.");

        }

        return rawBody;

    } catch (error) {

        console.error(error);

        return "";

    } finally {

        if (context) {
            await context.close();
        }

    }

}

module.exports = {
    crawlList,
    crawlArticle
};