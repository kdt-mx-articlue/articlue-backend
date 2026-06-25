const db = require("../config/db");
const jobPostingRepository = require("../repositories/jobPosting.repository");

async function getJobPostings(query) {
    let conn;

    try {
        conn = await db.getConnection();

        const page = Number(query.page || 1);
        const size = Number(query.size || 20);

        const filters = {
            page,
            size,
            keyword: query.keyword || null,
            jobName: query.jobName || null,
        };

        const items = await jobPostingRepository.findAll(conn, filters);
        const totalCount = await jobPostingRepository.countAll(conn, filters);

        return {
            page,
            size,
            totalCount,
            items,
        };

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function getJobPostingDetail(jobPostingId) {
    let conn;

    try {
        conn = await db.getConnection();

        const posting = await jobPostingRepository.findById(
            conn,
            Number(jobPostingId)
        );

        if (!posting) {
            const error = new Error("채용공고를 찾을 수 없습니다.");
            error.status = 404;
            throw error;
        }

        return posting;

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

async function getJobPostingContext(jobPostingId) {
    let conn;

    try {
        conn = await db.getConnection();

        const result = await jobPostingRepository.findContextById(
            conn,
            Number(jobPostingId)
        );

        if (!result) {
            const error = new Error("채용공고를 찾을 수 없습니다.");
            error.status = 404;
            throw error;
        }

        return result;

    } finally {
        if (conn) {
            await conn.close();
        }
    }
}

module.exports = {
    getJobPostings,
    getJobPostingDetail,
    getJobPostingContext,
};