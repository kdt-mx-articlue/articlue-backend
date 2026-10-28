const { http, cheerio, sha256, htmlToText, toDate, sleep, getKeywords, isDevPosting } = require("./jobCrawler.common");

/**
 * 잡코리아 — 공개 검색 결과 + 상세 페이지 JSON-LD + 상세 본문 iframe (로그인 불필요)
 * 키워드별 1페이지만 조회
 */
const SOURCE = "JOBKOREA";
const BASE_URL = "https://www.jobkorea.co.kr";

async function listPostings({ maxItems }) {
    const items = new Map();

    for (const keyword of getKeywords()) {
        if (items.size >= maxItems) break;

        const response = await http.get(`${BASE_URL}/Search/`, {
            params: { stext: keyword, tabType: "recruit", Page_No: 1 },
        });

        const $ = cheerio.load(response.data);

        $('a[href*="/Recruit/GI_Read/"]').each((_, element) => {
            const href = $(element).attr("href") || "";
            const sourceJobId = href.match(/GI_Read\/(\d+)/)?.[1];
            const title = $(element).text().replace(/\s+/g, " ").trim();

            // 같은 공고에 링크가 여러 개(로고, 회사명 등) → 제목이 있는 첫 링크만 사용
            if (!sourceJobId || !title || items.has(sourceJobId)) return;

            // 검색 결과 상단 광고·비개발 공고 제외
            if (!isDevPosting(title)) return;

            items.set(sourceJobId, {
                source: SOURCE,
                sourceJobId,
                title,
                companyName: null,
                originalUrl: `${BASE_URL}/Recruit/GI_Read/${sourceJobId}`,
                listHash: sha256(title),
            });
        });

        await sleep();
    }

    return [...items.values()].slice(0, maxItems);
}

function readJobPostingLd($) {
    for (const script of $('script[type="application/ld+json"]').toArray()) {
        try {
            const data = JSON.parse($(script).html());
            const list = Array.isArray(data) ? data : [data];
            const posting = list.find((entry) => entry?.["@type"] === "JobPosting");
            if (posting) return posting;
        } catch {
            // 다른 JSON-LD 블록은 무시
        }
    }
    return null;
}

async function fetchDetail(item) {
    const page = await http.get(item.originalUrl);
    const ld = readJobPostingLd(cheerio.load(page.data));

    if (!ld) {
        throw new Error(`잡코리아 상세 구조화 데이터 없음 (Gno=${item.sourceJobId})`);
    }

    await sleep();

    const body = await http
        .get(`${BASE_URL}/Recruit/GI_Read_Comt_Ifrm`, {
            params: { Gno: item.sourceJobId },
            headers: { Referer: item.originalUrl },
        })
        .then((response) => htmlToText(response.data))
        .catch(() => "");

    const address = ld.jobLocation?.address || ld.jobLocation?.[0]?.address;

    return {
        ...item,
        title: ld.title || item.title,
        companyName: ld.hiringOrganization?.name || item.companyName,
        careerCondition: ld.experienceRequirements || null,
        employmentType: ld.employmentType || null,
        workLocation: address?.streetAddress || address?.addressLocality || null,
        // 상세 본문은 자유 양식 → 항목 분리는 AI 파싱에 맡김
        mainTask: body || htmlToText(ld.description),
        qualification: null,
        preferredQualification: null,
        talentProfile: null,
        benefits: null,
        techStacks: "",
        deadlineDate: toDate(ld.validThrough),
    };
}

module.exports = { SOURCE, listPostings, fetchDetail };
