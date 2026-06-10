const { oracledb } = require("../config/db");

/**
 * tech_stack 테이블에서 사용 가능한 기술스택 목록을 조회한다.
 */
async function findActiveTechStackMap(conn) {
    const result = await conn.execute(
        `
        SELECT
            tech_stack_id AS "techStackId",
            tech_name AS "techName"
        FROM tech_stack
        WHERE use_yn = 'Y'
        `
    );

    const map = {};

    for (const row of result.rows) {
        map[String(row.techName).toLowerCase()] = row.techStackId;
    }

    return map;
}

/**
 * member_id + GitHub user id 기준으로 기존 GitHub 계정 확인
 */
async function findGithubAccountId(conn, { member_id, id }) {
    const result = await conn.execute(
        `
        SELECT
            github_account_id AS "githubAccountId"
        FROM github_account
        WHERE member_id = :member_id
          AND id = :id
        `,
        {
            member_id,
            id,
        }
    );

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0].githubAccountId;
}

async function insertGithubAccount(conn, row) {
    const result = await conn.execute(
        `
        INSERT INTO github_account (
            github_account_id,
            member_id,
            id,
            login,
            html_url,
            connected_at,
            last_sync_at
        ) VALUES (
            SEQ_GITHUB_ACCOUNT.NEXTVAL,
            :member_id,
            :id,
            :login,
            :html_url,
            SYSDATE,
            SYSDATE
        )
        RETURNING github_account_id INTO :github_account_id
        `,
        {
            member_id: row.member_id,
            id: row.id,
            login: row.login,
            html_url: row.html_url,
            github_account_id: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        }
    );

    return result.outBinds.github_account_id[0];
}

async function updateGithubAccount(conn, githubAccountId, row) {
    await conn.execute(
        `
        UPDATE github_account
        SET
            login = :login,
            html_url = :html_url,
            last_sync_at = SYSDATE
        WHERE github_account_id = :github_account_id
        `,
        {
            github_account_id: githubAccountId,
            login: row.login,
            html_url: row.html_url,
        }
    );

    return githubAccountId;
}

/**
 * github_account upsert
 */
async function upsertGithubAccount(conn, row) {
    const githubAccountId = await findGithubAccountId(conn, row);

    if (githubAccountId) {
        return await updateGithubAccount(conn, githubAccountId, row);
    }

    return await insertGithubAccount(conn, row);
}

/**
 * github_account_id + GitHub repository id 기준으로 기존 저장소 확인
 */
async function findGithubRepositoryId(conn, { github_account_id, id }) {
    const result = await conn.execute(
        `
        SELECT
            github_repository_id AS "githubRepositoryId"
        FROM github_repository
        WHERE github_account_id = :github_account_id
          AND id = :id
        `,
        {
            github_account_id,
            id,
        }
    );

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0].githubRepositoryId;
}

async function insertGithubRepository(conn, row) {
    const result = await conn.execute(
        `
        INSERT INTO github_repository (
            github_repository_id,
            github_account_id,
            id,
            name,
            full_name,
            html_url,
            description,
            fork,
            archived,
            default_branch,
            created_at,
            updated_at,
            pushed_at,
            last_sync_at
        ) VALUES (
            SEQ_GITHUB_REPOSITORY.NEXTVAL,
            :github_account_id,
            :id,
            :name,
            :full_name,
            :html_url,
            :description,
            :fork,
            :archived,
            :default_branch,
            :created_at,
            :updated_at,
            :pushed_at,
            SYSDATE
        )
        RETURNING github_repository_id INTO :github_repository_id
        `,
        {
            github_account_id: row.github_account_id,
            id: row.id,
            name: row.name,
            full_name: row.full_name,
            html_url: row.html_url,
            description: row.description,
            fork: row.fork,
            archived: row.archived,
            default_branch: row.default_branch,
            created_at: row.created_at,
            updated_at: row.updated_at,
            pushed_at: row.pushed_at,
            github_repository_id: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        }
    );

    return result.outBinds.github_repository_id[0];
}

async function updateGithubRepository(conn, githubRepositoryId, row) {
    await conn.execute(
        `
        UPDATE github_repository
        SET
            name = :name,
            full_name = :full_name,
            html_url = :html_url,
            description = :description,
            fork = :fork,
            archived = :archived,
            default_branch = :default_branch,
            created_at = :created_at,
            updated_at = :updated_at,
            pushed_at = :pushed_at,
            last_sync_at = SYSDATE
        WHERE github_repository_id = :github_repository_id
        `,
        {
            github_repository_id: githubRepositoryId,
            name: row.name,
            full_name: row.full_name,
            html_url: row.html_url,
            description: row.description,
            fork: row.fork,
            archived: row.archived,
            default_branch: row.default_branch,
            created_at: row.created_at,
            updated_at: row.updated_at,
            pushed_at: row.pushed_at,
        }
    );

    return githubRepositoryId;
}

/**
 * github_repository upsert
 */
async function upsertGithubRepository(conn, row) {
    const githubRepositoryId = await findGithubRepositoryId(conn, row);

    if (githubRepositoryId) {
        return await updateGithubRepository(conn, githubRepositoryId, row);
    }

    return await insertGithubRepository(conn, row);
}

async function deleteGithubRepoTechStacks(conn, githubRepositoryId) {
    await conn.execute(
        `
        DELETE FROM github_repo_tech_stack
        WHERE github_repository_id = :github_repository_id
        `,
        {
            github_repository_id: githubRepositoryId,
        }
    );
}

async function insertGithubRepoTechStack(conn, row) {
    const result = await conn.execute(
        `
        INSERT INTO github_repo_tech_stack (
            github_repo_tech_id,
            github_repository_id,
            tech_stack_id,
            language_name,
            usage_ratio,
            collected_at
        ) VALUES (
            SEQ_GITHUB_REPO_TECH.NEXTVAL,
            :github_repository_id,
            :tech_stack_id,
            :language_name,
            :usage_ratio,
            SYSDATE
        )
        RETURNING github_repo_tech_id INTO :github_repo_tech_id
        `,
        {
            github_repository_id: row.github_repository_id,
            tech_stack_id: row.tech_stack_id,
            language_name: row.language_name,
            usage_ratio: row.usage_ratio,
            github_repo_tech_id: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        }
    );

    return result.outBinds.github_repo_tech_id[0];
}

async function deleteGithubRepoCommitDaily(conn, githubRepositoryId) {
    await conn.execute(
        `
        DELETE FROM github_repo_commit_daily
        WHERE github_repository_id = :github_repository_id
        `,
        {
            github_repository_id: githubRepositoryId,
        }
    );
}

async function insertGithubRepoCommitDaily(conn, row) {
    const result = await conn.execute(
        `
        INSERT INTO github_repo_commit_daily (
            github_repo_commit_daily_id,
            github_repository_id,
            commit_date,
            commit_count,
            collected_at
        ) VALUES (
            SEQ_GITHUB_REPO_COMMIT_DAILY.NEXTVAL,
            :github_repository_id,
            :commit_date,
            :commit_count,
            SYSDATE
        )
        RETURNING github_repo_commit_daily_id INTO :github_repo_commit_daily_id
        `,
        {
            github_repository_id: row.github_repository_id,
            commit_date: row.commit_date,
            commit_count: row.commit_count,
            github_repo_commit_daily_id: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        }
    );

    return result.outBinds.github_repo_commit_daily_id[0];
}

// 3개의 저장소 가져오기.
async function findTopRepositories(memberId,conn){
    const sql = `
        SELECT
            gr.GITHUB_REPOSITORY_ID AS githubRepositoryId,
            gr.NAME AS name,
            gr.FULL_NAME AS fullName,
            gr.HTML_URL AS htmlUrl,
            gr.DESCRIPTION AS description,
            MAX(gcd.COMMIT_DATE) AS lastCommitDate
        FROM GITHUB_ACCOUNT ga
        INNER JOIN GITHUB_REPOSITORY gr
            ON ga.GITHUB_ACCOUNT_ID = gr.GITHUB_ACCOUNT_ID
        INNER JOIN GITHUB_REPO_COMMIT_DAILY gcd
            ON gr.GITHUB_REPOSITORY_ID = gcd.GITHUB_REPOSITORY_ID
        WHERE ga.MEMBER_ID = :memberId
        GROUP BY
            gr.GITHUB_REPOSITORY_ID,
            gr.NAME,
            gr.FULL_NAME,
            gr.HTML_URL,
            gr.DESCRIPTION
        ORDER BY MAX(gcd.COMMIT_DATE) DESC
        FETCH FIRST 3 ROWS ONLY
    `;

    const result = await conn.execute(
        sql,
        {
            memberId
        }
    );

    return result.rows;
}

// 전체 저장소 가져오기.
async function findAllRepositories(memberId,conn){
    const sql = `
        SELECT
            gr.GITHUB_REPOSITORY_ID AS githubRepositoryId,
            gr.NAME AS name,
            gr.FULL_NAME AS fullName,
            gr.HTML_URL AS htmlUrl,
            gr.DESCRIPTION AS description,
            MAX(gcd.COMMIT_DATE) AS lastCommitDate
        FROM GITHUB_ACCOUNT ga
        INNER JOIN GITHUB_REPOSITORY gr
            ON ga.GITHUB_ACCOUNT_ID = gr.GITHUB_ACCOUNT_ID
        LEFT JOIN GITHUB_REPO_COMMIT_DAILY gcd
            ON gr.GITHUB_REPOSITORY_ID = gcd.GITHUB_REPOSITORY_ID
        WHERE ga.MEMBER_ID = :memberId
        GROUP BY
            gr.GITHUB_REPOSITORY_ID,
            gr.NAME,
            gr.FULL_NAME,
            gr.HTML_URL,
            gr.DESCRIPTION
        ORDER BY
            MAX(gcd.COMMIT_DATE) DESC NULLS LAST
    `;

    const result = await conn.execute(
        sql,
        {
            memberId
        }
    );

    return result.rows;
}

module.exports = {
    // 깃허브 저장소 가져오기.
    findActiveTechStackMap,
    findTopRepositories,

    // GitHub API 요청을 통한 기능 
    upsertGithubAccount,
    upsertGithubRepository,

    // 기술스택 관련 모듈
    deleteGithubRepoTechStacks,
    insertGithubRepoTechStack,

    deleteGithubRepoCommitDaily,
    insertGithubRepoCommitDaily,
};

