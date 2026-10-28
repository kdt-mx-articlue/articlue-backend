const { http, cheerio, sha256, htmlToText, sleep, getKeywords, isDevPosting } = require("./jobCrawler.common");

/**
 * 사람인 — 공개 검색 결과 + 상세(view-detail) HTML (로그인 불필요)
 * 키워드별 최신 등록순 1페이지만 조회
 */
const SOURCE = "SARAMIN";
const BASE_URL = "https://www.saramin.co.kr";
const PAGE_SIZE = 20;

/** "~ 11/27(금)" → Date (올해 기준, 이미 지난 달이면 내년) / "상시채용" 등 → null */
function parseDeadline(text) {
    const match = String(text || "").match(/(\d{1,2})\/(\d{1,2})/);
    if (!match) return null;

    const now = new Date();
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    let year = now.getFullYear();

    if (month < now.getMonth() - 1) year += 1;

    return new Date(year, month, day, 23, 59, 0);
}

async function listPostings({ maxItems }) {
    const items = new Map();

    for (const keyword of getKeywords()) {
        if (items.size >= maxItems) break;

        const response = await http.get(`${BASE_URL}/zf_user/search/recruit`, {
            params: { searchword: keyword, recruitPageCount: PAGE_SIZE, recruitSort: "reg_dt" },
        });

        const $ = cheerio.load(response.data);

        $(".item_recruit").each((_, element) => {
            const row = $(element);
            const sourceJobId = row.attr("value");
            const title = row.find(".job_tit a").attr("title")?.trim();

            if (!sourceJobId || !title || items.has(sourceJobId)) return;

            const conditions = row.find(".job_condition span").map((__, span) => $(span).text().trim()).get();
            const deadlineText = row.find(".job_date .date").text().trim();
            const companyName = row.find(".corp_name a").text().trim();
            const sectors = row.find(".job_sector a").map((__, a) => $(a).text().trim()).get();

            // 제목에 개발 직군 단서가 없으면 제외 (직무분야 태그는 헤드헌팅 공고에서 부정확해 제목 기준)
            if (!isDevPosting(title)) return;

            items.set(sourceJobId, {
                source: SOURCE,
                sourceJobId,
                title,
                companyName,
                originalUrl: `${BASE_URL}/zf_user/jobs/relay/view?rec_idx=${sourceJobId}`,
                workLocation: conditions[0] || null,
                careerCondition: conditions[1] || null,
                employmentType: conditions[3] || null,
                techStacks: sectors.join(", "),
                deadlineDate: parseDeadline(deadlineText),
                listHash: sha256([title, companyName, deadlineText].join("|")),
            });
        });

        await sleep();
    }

    return [...items.values()].slice(0, maxItems);
}

async function fetchDetail(item) {
    const response = await http.get(`${BASE_URL}/zf_user/jobs/relay/view-detail`, {
        params: {
            rec_idx: item.sourceJobId,
            rec_seq: 0,
            t_category: "relay_view",
            t_content: "view_detail",
        },
        headers: { Referer: item.originalUrl },
    });

    // 사람인 상세는 기업마다 자유 양식 → 본문 전체를 주요업무에 담고 항목 분리는 AI 파싱에 맡김
    const body = htmlToText(response.data);

    if (!body) {
        throw new Error(`사람인 상세 본문 없음 (rec_idx=${item.sourceJobId}, 이미지 공고일 수 있음)`);
    }

    return {
        ...item,
        mainTask: body,
        qualification: null,
        preferredQualification: null,
        talentProfile: null,
        benefits: null,
    };
}

module.exports = { SOURCE, listPostings, fetchDetail };
