const { oracledb } = require("../config/db");

/**
 * TECH_CATEGORY 테이블에서 기술명 → 기술분류코드 맵 생성
 *
 * 최종 DDL 기준:
 * - TECH_CATEGORY_CODE
 * - TECH_CATEGORY_NAME
 * - TECH_NAME
 */
async function findActiveTechStackMap(conn) {
    const result = await conn.execute(
        `
        SELECT
            TECH_CATEGORY_CODE AS "techCategoryCode",
            TECH_NAME AS "techName"
        FROM TECH_CATEGORY
        `
    );

    const map = {};

    for (const row of result.rows) {
        map[String(row.techName).toLowerCase()] = row.techCategoryCode;
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
            GITHUB_ACCOUNT_ID AS "githubAccountId"
        FROM GITHUB_ACCOUNT
        WHERE MEMBER_ID = :member_id
          AND GITHUB_USER_ID = :github_user_id
        `,
        {
            member_id,
            github_user_id: id,
        }
    );

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0].githubAccountId;
}

/**
 * GitHub 계정 신규 저장
 */
async function insertGithubAccount(conn, row) {
    const result = await conn.execute(
        `
        INSERT INTO GITHUB_ACCOUNT (
            GITHUB_ACCOUNT_ID,
            MEMBER_ID,
            GITHUB_USER_ID,
            LOGIN,
            HTML_URL,
            ACCESS_TOKEN,
            REFRESH_TOKEN,
            EXPIRES_AT,
            CONNECTED_AT,
            LAST_SYNC_AT
        )
        VALUES (
            SEQ_GITHUB_ACCOUNT.NEXTVAL,
            :member_id,
            :github_user_id,
            :login,
            :html_url,
            :access_token,
            :refresh_token,
            :expires_at,
            SYSDATE,
            SYSDATE
        )
        RETURNING GITHUB_ACCOUNT_ID INTO :github_account_id
        `,
        {
            member_id: row.member_id,
            github_user_id: row.id,
            login: row.login,
            html_url: row.html_url,
            access_token: row.access_token || null,
            refresh_token: row.refresh_token || null,
            expires_at: row.expires_at || null,
            github_account_id: {
                dir: oracledb.BIND_OUT,
                type: oracledb.NUMBER,
            },
        }
    );

    return result.outBinds.github_account_id[0];
}

/**
 * GitHub 계정 갱신
 */
async function updateGithubAccount(conn, githubAccountId, row) {
    await conn.execute(
        `
        UPDATE GITHUB_ACCOUNT
        SET
            LOGIN = :login,
            HTML_URL = :html_url,
            ACCESS_TOKEN = NVL(:access_token, ACCESS_TOKEN),
            REFRESH_TOKEN = NVL(:refresh_token, REFRESH_TOKEN),
            EXPIRES_AT = NVL(:expires_at, EXPIRES_AT),
            LAST_SYNC_AT = SYSDATE
        WHERE GITHUB_ACCOUNT_ID = :github_account_id
        `,
        {
            github_account_id: githubAccountId,
            login: row.login,
            html_url: row.html_url,
            access_token: row.access_token || null,
            refresh_token: row.refresh_token || null,
            expires_at: row.expires_at || null,
        }
    );

    return githubAccountId;
}

/**
 * GitHub 계정 upsert
 */
async function upsertGithubAccount(conn, row) {
    const githubAccountId = await findGithubAccountId(conn, row);

    if (githubAccountId) {
        return await updateGithubAccount(conn, githubAccountId, row);
    }

    return await insertGithubAccount(conn, row);
}

/**
 * github_account_id + GitHub repository external id 기준으로 기존 저장소 확인
 */
async function findGithubRepositoryId(conn, { github_account_id, id }) {
    const result = await conn.execute(
        `
        SELECT
            GITHUB_REPOSITORY_ID AS "githubRepositoryId"
        FROM GITHUB_REPOSITORY
        WHERE GITHUB_ACCOUNT_ID = :github_account_id
          AND GITHUB_REPO_EXTERNAL_ID = :github_repo_external_id
        `,
        {
            github_account_id,
            github_repo_external_id: id,
        }
    );

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0].githubRepositoryId;
}

/**
 * GitHub 저장소 신규 저장
 */
async function insertGithubRepository(conn, row) {
    const result = await conn.execute(
        `
        INSERT INTO GITHUB_REPOSITORY (
            GITHUB_REPOSITORY_ID,
            GITHUB_ACCOUNT_ID,
            GITHUB_REPO_EXTERNAL_ID,
            NAME,
            FULL_NAME,
            HTML_URL,
            DESCRIPTION,
            FORK,
            ARCHIVED,
            DEFAULT_BRANCH,
            CREATED_AT,
            UPDATED_AT,
            PUSHED_AT,
            LAST_SYNC_AT
        )
        VALUES (
            SEQ_GITHUB_REPOSITORY.NEXTVAL,
            :github_account_id,
            :github_repo_external_id,
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
        RETURNING GITHUB_REPOSITORY_ID INTO :github_repository_id
        `,
        {
            github_account_id: row.github_account_id,
            github_repo_external_id: row.id,
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

/**
 * GitHub 저장소 갱신
 */
async function updateGithubRepository(conn, githubRepositoryId, row) {
    await conn.execute(
        `
        UPDATE GITHUB_REPOSITORY
        SET
            NAME = :name,
            FULL_NAME = :full_name,
            HTML_URL = :html_url,
            DESCRIPTION = :description,
            FORK = :fork,
            ARCHIVED = :archived,
            DEFAULT_BRANCH = :default_branch,
            CREATED_AT = :created_at,
            UPDATED_AT = :updated_at,
            PUSHED_AT = :pushed_at,
            LAST_SYNC_AT = SYSDATE
        WHERE GITHUB_REPOSITORY_ID = :github_repository_id
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
 * GitHub 저장소 upsert
 */
async function upsertGithubRepository(conn, row) {
    const githubRepositoryId = await findGithubRepositoryId(conn, row);

    if (githubRepositoryId) {
        return await updateGithubRepository(conn, githubRepositoryId, row);
    }

    return await insertGithubRepository(conn, row);
}

/**
 * 특정 GitHub 저장소의 기술스택 삭제
 */
async function deleteGithubRepoTechStacks(conn, githubRepositoryId) {
    await conn.execute(
        `
        DELETE FROM GITHUB_REPO_TECH_STACK
        WHERE GITHUB_REPOSITORY_ID = :github_repository_id
        `,
        {
            github_repository_id: githubRepositoryId,
        }
    );
}

/**
 * GitHub 저장소 기술스택 저장
 *
 * 최종 DDL 기준:
 * - TECH_CATEGORY_CODE 사용
 */
async function insertGithubRepoTechStack(conn, row) {
    const result = await conn.execute(
        `
        INSERT INTO GITHUB_REPO_TECH_STACK (
            GITHUB_REPO_TECH_ID,
            GITHUB_REPOSITORY_ID,
            TECH_CATEGORY_CODE,
            LANGUAGE_NAME,
            USAGE_RATIO,
            COLLECTED_AT
        )
        VALUES (
            SEQ_GITHUB_REPO_TECH.NEXTVAL,
            :github_repository_id,
            :tech_category_code,
            :language_name,
            :usage_ratio,
            SYSDATE
        )
        RETURNING GITHUB_REPO_TECH_ID INTO :github_repo_tech_id
        `,
        {
            github_repository_id: row.github_repository_id,
            tech_category_code: row.tech_category_code,
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

/**
 * 특정 GitHub 저장소의 일별 커밋 통계 삭제
 */
async function deleteGithubRepoCommitDaily(conn, githubRepositoryId) {
    await conn.execute(
        `
        DELETE FROM GITHUB_REPO_COMMIT_DAILY
        WHERE GITHUB_REPOSITORY_ID = :github_repository_id
        `,
        {
            github_repository_id: githubRepositoryId,
        }
    );
}

/**
 * GitHub 저장소 일별 커밋 통계 저장
 */
async function insertGithubRepoCommitDaily(conn, row) {
    const result = await conn.execute(
        `
        INSERT INTO GITHUB_REPO_COMMIT_DAILY (
            GITHUB_REPO_COMMIT_DAILY_ID,
            GITHUB_REPOSITORY_ID,
            COMMIT_DATE,
            COMMIT_COUNT,
            COLLECTED_AT
        )
        VALUES (
            SEQ_GITHUB_COMMIT_DAILY.NEXTVAL,
            :github_repository_id,
            :commit_date,
            :commit_count,
            SYSDATE
        )
        RETURNING GITHUB_REPO_COMMIT_DAILY_ID INTO :github_repo_commit_daily_id
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

/**
 * 회원의 최근 커밋 기준 상위 3개 저장소 조회
 *
 * Oracle 11g 기준:
 * - FETCH FIRST 사용 불가
 * - ROWNUM 방식 사용
 */
async function findTopRepositories(memberId, conn) {
    const sql = `
        SELECT *
        FROM (
            SELECT
                GR.GITHUB_REPOSITORY_ID AS "githubRepositoryId",
                GR.NAME AS "name",
                GR.FULL_NAME AS "fullName",
                GR.HTML_URL AS "htmlUrl",
                GR.DESCRIPTION AS "description",
                MAX(GCD.COMMIT_DATE) AS "lastCommitDate"
            FROM GITHUB_ACCOUNT GA
            INNER JOIN GITHUB_REPOSITORY GR
                ON GA.GITHUB_ACCOUNT_ID = GR.GITHUB_ACCOUNT_ID
            LEFT JOIN GITHUB_REPO_COMMIT_DAILY GCD
                ON GR.GITHUB_REPOSITORY_ID = GCD.GITHUB_REPOSITORY_ID
            WHERE GA.MEMBER_ID = :memberId
            GROUP BY
                GR.GITHUB_REPOSITORY_ID,
                GR.NAME,
                GR.FULL_NAME,
                GR.HTML_URL,
                GR.DESCRIPTION
            ORDER BY MAX(GCD.COMMIT_DATE) DESC NULLS LAST
        )
        WHERE ROWNUM <= 3
    `;

    const result = await conn.execute(
        sql,
        {
            memberId,
        }
    );

    return result.rows;
}

/**
 * 회원의 전체 GitHub 저장소 조회
 */
async function findAllRepositories(memberId, conn) {
    const sql = `
        SELECT
            GR.GITHUB_REPOSITORY_ID AS "githubRepositoryId",
            GR.NAME AS "name",
            GR.FULL_NAME AS "fullName",
            GR.HTML_URL AS "htmlUrl",
            GR.DESCRIPTION AS "description",
            MAX(GCD.COMMIT_DATE) AS "lastCommitDate"
        FROM GITHUB_ACCOUNT GA
        INNER JOIN GITHUB_REPOSITORY GR
            ON GA.GITHUB_ACCOUNT_ID = GR.GITHUB_ACCOUNT_ID
        LEFT JOIN GITHUB_REPO_COMMIT_DAILY GCD
            ON GR.GITHUB_REPOSITORY_ID = GCD.GITHUB_REPOSITORY_ID
        WHERE GA.MEMBER_ID = :memberId
        GROUP BY
            GR.GITHUB_REPOSITORY_ID,
            GR.NAME,
            GR.FULL_NAME,
            GR.HTML_URL,
            GR.DESCRIPTION
        ORDER BY
            MAX(GCD.COMMIT_DATE) DESC NULLS LAST
    `;

    const result = await conn.execute(
        sql,
        {
            memberId,
        }
    );

    return result.rows;
}

async function createResumeGithubRepository(conn, row) {
    const sql = `
        INSERT INTO RESUME_GITHUB_REPOSITORY
        (
            RESUME_GITHUB_REPO_ID,
            RESUME_ID,
            GITHUB_REPOSITORY_ID,
            DISPLAY_ORDER,
            PROJECT_DESCRIPTION,
            CREATED_DATE
        )
        VALUES
        (
            SEQ_RESUME_GITHUB_REPO.NEXTVAL,
            :resume_id,
            :github_repository_id,
            :display_order,
            :project_description,
            SYSDATE
        )
    `;

    return await conn.execute(
        sql,
        {
            resume_id: row.resume_id,
            github_repository_id: row.github_repository_id,
            display_order: row.display_order || null,
            project_description: row.project_description || null,
        }
    );
}

module.exports = {
    // 깃허브 저장소 가져오기.
    findActiveTechStackMap,
    findTopRepositories,
    findAllRepositories,
    // GitHub API 요청을 통한 기능 
    upsertGithubAccount,
    upsertGithubRepository,

    // 이력서-GitHub 저장소 연결
    createResumeGithubRepository,

    // 기술스택 관련 모듈
    deleteGithubRepoTechStacks,
    insertGithubRepoTechStack,

    // 커밋 통계ㅒ
    deleteGithubRepoCommitDaily,
    insertGithubRepoCommitDaily,
};