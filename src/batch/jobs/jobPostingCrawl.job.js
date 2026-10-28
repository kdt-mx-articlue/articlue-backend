const axios = require("axios");

const { getConnection } = require("../../config/db");
const repository = require("../../repositories/jobPostingCrawl.repository");
const wantedCrawler = require("../../crawler/jobs/wanted.crawler");
const saraminCrawler = require("../../crawler/jobs/saramin.crawler");
const jobkoreaCrawler = require("../../crawler/jobs/jobkorea.crawler");
const { sleep } = require("../../crawler/jobs/jobCrawler.common");

/**
 * 채용공고 주간 수집
 *
 * 1. 소스별 최신 목록만 조회 (원티드 API / 사람인·잡코리아 검색 1페이지)
 * 2. DB 와 비교해 신규·변경 공고만 상세 수집 → JOB_POSTING 저장
 * 3. 신규·변경 공고만 AI 서버에 전달 → LLM 파싱 + 벡터 반영 (전체 재파싱 없음)
 * 4. 마감일이 지난 수집 공고는 CLOSED 처리 + 벡터 제거
 *
 * 한 소스가 실패해도 나머지는 계속 진행하고 결과를 PARTIAL 로 남긴다.
 */
const CRAWLERS = [wantedCrawler, saraminCrawler, jobkoreaCrawler];

const LIST_LIMIT = Number(process.env.JOB_CRAWL_LIST_LIMIT || 40);
const MAX_NEW_PER_SOURCE = Number(process.env.JOB_CRAWL_MAX_NEW_PER_SOURCE || 20);
const INGEST_CHUNK_SIZE = 10;
const AI_BASE_URL = process.env.AI_SERVER_BASE_URL || "http://127.0.0.1:5000";
const AI_INGEST_TIMEOUT_MS = 15 * 60 * 1000;

function enabledCrawlers() {
    const enabled = String(process.env.JOB_CRAWL_SOURCES || "WANTED,SARAMIN,JOBKOREA")
        .toUpperCase()
        .split(",")
        .map((source) => source.trim());

    return CRAWLERS.filter((crawler) => enabled.includes(crawler.SOURCE));
}

async function withConnection(fn) {
    const conn = await getConnection();
    try {
        return await fn(conn);
    } finally {
        await conn.close();
    }
}

function toIngestPayload(jobPostingId, posting) {
    return {
        job_posting_id: jobPostingId,
        company_name: posting.companyName || "",
        job_title: posting.title || "",
        career_level: posting.careerCondition || "",
        deadline: posting.deadlineDate ? posting.deadlineDate.toISOString().slice(0, 10) : "",
        apply_url: posting.originalUrl || "",
        tech_stacks: posting.techStacks || "",
        requirements: posting.qualification || "",
        preferences: posting.preferredQualification || "",
        responsibilities: posting.mainTask || "",
        team_culture: posting.talentProfile || "",
        benefits: posting.benefits || "",
    };
}

/**
 * 소스 1개 수집 → 신규·변경 공고를 DB 에 저장하고 AI 반영 대상 반환
 */
async function collectSource(crawler, stats) {
    const items = await crawler.listPostings({ maxItems: LIST_LIMIT });

    const existing = await withConnection((conn) =>
        repository.findBySourceIds(conn, crawler.SOURCE, items.map((item) => item.sourceJobId))
    );

    const targets = items
        .filter((item) => existing.get(item.sourceJobId)?.contentHash !== item.listHash)
        .slice(0, MAX_NEW_PER_SOURCE);

    const sourceStats = { listed: items.length, targets: targets.length, saved: 0, detailFailed: 0 };
    stats.sources[crawler.SOURCE] = sourceStats;

    const ingestQueue = [];

    for (const item of targets) {
        try {
            const posting = await crawler.fetchDetail(item);

            if (!posting.companyName || !posting.title) {
                throw new Error("회사명 또는 공고명이 없습니다.");
            }

            const jobPostingId = await withConnection(async (conn) => {
                try {
                    const companyId = await repository.findOrCreateCompany(conn, posting.companyName, posting.workLocation);
                    const found = existing.get(item.sourceJobId);
                    let id;

                    if (found) {
                        id = found.jobPostingId;
                        await repository.updatePosting(conn, id, posting, companyId);
                    } else {
                        id = await repository.insertPosting(conn, posting, companyId);
                    }

                    await conn.commit();
                    return id;
                } catch (error) {
                    await conn.rollback();
                    throw error;
                }
            });

            ingestQueue.push({ jobPostingId, contentHash: item.listHash, payload: toIngestPayload(jobPostingId, posting) });
            sourceStats.saved += 1;
        } catch (error) {
            sourceStats.detailFailed += 1;
            console.warn(`[JobCrawl:${crawler.SOURCE}] ${item.sourceJobId} 수집 실패: ${error.message}`);
        }

        await sleep();
    }

    return ingestQueue;
}

async function callAiIngest(jobs, removeIds) {
    const response = await axios.post(
        `${AI_BASE_URL}/jobs/ingest`,
        { jobs, remove_ids: removeIds },
        { timeout: AI_INGEST_TIMEOUT_MS }
    );

    return response.data;
}

async function run() {
    const stats = { sources: {}, ingested: 0, ingestFailed: 0, closed: 0 };
    const failedSources = [];
    const ingestQueue = [];

    for (const crawler of enabledCrawlers()) {
        try {
            ingestQueue.push(...(await collectSource(crawler, stats)));
        } catch (error) {
            failedSources.push({ source: crawler.SOURCE, message: error.message });
            console.error(`[JobCrawl:${crawler.SOURCE}] 목록 수집 실패: ${error.message}`);
        }
    }

    // 신규·변경 공고 AI 반영 (나눠서 전송 → 실패해도 앞 묶음은 반영 유지)
    for (let i = 0; i < ingestQueue.length; i += INGEST_CHUNK_SIZE) {
        const chunk = ingestQueue.slice(i, i + INGEST_CHUNK_SIZE);

        try {
            const result = await callAiIngest(chunk.map((entry) => entry.payload), []);
            const okIds = new Set((result?.ingested_ids || []).map(Number));
            const done = chunk.filter((entry) => okIds.has(entry.jobPostingId));

            await withConnection((conn) => repository.markIngested(conn, done));

            stats.ingested += done.length;
            stats.ingestFailed += chunk.length - done.length;
        } catch (error) {
            // CONTENT_HASH 가 비어 있으므로 다음 수집 때 다시 반영 시도
            stats.ingestFailed += chunk.length;
            console.error(`[JobCrawl] AI 반영 실패 (${chunk.length}건): ${error.message}`);
        }
    }

    if (stats.ingestFailed > 0) {
        failedSources.push({ source: "AI_INGEST", message: `${stats.ingestFailed}건 AI 반영 실패 (다음 실행 때 재시도)` });
    }

    // 마감 공고 정리
    try {
        const closedIds = await withConnection((conn) => repository.closeExpiredCrawledPostings(conn));

        if (closedIds.length > 0) {
            try {
                await callAiIngest([], closedIds);
                stats.closed = closedIds.length;
            } catch (error) {
                // 벡터 제거에 실패하면 다음 실행에서 다시 처리하도록 ACTIVE 로 되돌림
                await withConnection(async (conn) => {
                    await conn.executeMany(
                        `UPDATE JOB_POSTING SET POSTING_STATUS = 'ACTIVE' WHERE JOB_POSTING_ID = :id`,
                        closedIds.map((id) => ({ id })),
                        { autoCommit: true }
                    );
                });
                throw error;
            }
        }
    } catch (error) {
        failedSources.push({ source: "CLOSE_EXPIRED", message: error.message });
    }

    const enabledCount = enabledCrawlers().length;
    const crawlFailedCount = failedSources.filter((f) => CRAWLERS.some((c) => c.SOURCE === f.source)).length;

    if (enabledCount > 0 && crawlFailedCount === enabledCount) {
        // 모든 소스가 실패 → 전체 실패로 기록 (관리자 확인 필요)
        throw new Error(`모든 수집 소스 실패\n${failedSources.map((f) => `${f.source}: ${f.message}`).join("\n")}`);
    }

    return { summary: stats, failedSources };
}

module.exports = { run };
