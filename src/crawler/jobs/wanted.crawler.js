const { http, sha256, normalizeText, toDate, sleep } = require("./jobCrawler.common");

/**
 * 원티드 — 공개 JSON API (로그인 불필요)
 * 목록: 개발 직군(tag_type_ids=518) 최신순 / 상세: /api/v4/jobs/{id}
 */
const SOURCE = "WANTED";
const BASE_URL = "https://www.wanted.co.kr";
const DEV_CATEGORY_ID = 518;
const PAGE_SIZE = 20;

async function listPostings({ maxItems }) {
    const items = [];

    for (let offset = 0; items.length < maxItems; offset += PAGE_SIZE) {
        const response = await http.get(`${BASE_URL}/api/v4/jobs`, {
            params: {
                country: "kr",
                tag_type_ids: DEV_CATEGORY_ID,
                job_sort: "job.latest_order",
                locations: "all",
                years: -1,
                limit: PAGE_SIZE,
                offset,
            },
        });

        const rows = response.data?.data || [];
        if (rows.length === 0) break;

        for (const row of rows) {
            items.push({
                source: SOURCE,
                sourceJobId: String(row.id),
                title: row.position,
                companyName: row.company?.name,
                originalUrl: `${BASE_URL}/wd/${row.id}`,
                listHash: sha256([row.position, row.company?.name, row.due_time].join("|")),
            });
        }

        if (rows.length < PAGE_SIZE) break;
        await sleep();
    }

    return items.slice(0, maxItems);
}

async function fetchDetail(item) {
    const response = await http.get(`${BASE_URL}/api/v4/jobs/${item.sourceJobId}`);
    const job = response.data?.job;

    if (!job) {
        throw new Error(`원티드 상세 응답 형식 오류 (id=${item.sourceJobId})`);
    }

    const detail = job.detail || {};
    const annual = job.annual_from === 0 && job.annual_to === 0
        ? "신입"
        : job.annual_from != null
            ? `경력 ${job.annual_from}-${job.annual_to}년`
            : null;

    return {
        ...item,
        title: job.position || item.title,
        companyName: job.company?.name || item.companyName,
        careerCondition: annual,
        employmentType: null,
        workLocation: job.address?.full_location || job.address?.location || null,
        mainTask: normalizeText(detail.main_tasks),
        qualification: normalizeText(detail.requirements),
        preferredQualification: normalizeText(detail.preferred_points),
        talentProfile: normalizeText(detail.intro),
        benefits: normalizeText(detail.benefits),
        techStacks: (job.skill_tags || []).map((tag) => tag.title).filter(Boolean).join(", "),
        deadlineDate: toDate(job.due_time),
    };
}

module.exports = { SOURCE, listPostings, fetchDetail };
