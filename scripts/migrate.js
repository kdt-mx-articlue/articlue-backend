/**
 * Articlue DB 마이그레이션 도구 (Oracle)
 *
 * db/migrations/V<번호>__<설명>.sql 파일을 번호 순서대로 실행하고
 * SCHEMA_MIGRATIONS 테이블에 적용 이력(checksum 포함)을 남깁니다.
 *
 * 사용법
 *   npm run migrate                 미적용 마이그레이션 실행
 *   npm run migrate:status          적용/미적용 목록 확인
 *   npm run migrate:create -- 설명   다음 번호의 빈 마이그레이션 파일 생성
 *   npm run migrate:baseline -- 2   이미 스키마가 있는 DB에서 V002 까지 "적용됨"으로만 기록
 *
 * 주의
 *   - Oracle DDL 은 자동 커밋되어 롤백되지 않습니다. 중간에 실패하면 실패한 구문 번호를
 *     확인해 수동으로 정리한 뒤 다시 실행하세요. (실패한 마이그레이션은 이력에 기록되지 않음)
 *   - 이미 적용된 파일을 수정하면 checksum 불일치로 실행이 중단됩니다. 변경은 새 파일로 추가하세요.
 *   - PL/SQL 블록(BEGIN/DECLARE/CREATE OR REPLACE ...)은 SQL*Plus 처럼 단독 줄의 "/" 로 끝냅니다.
 */
require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const oracledb = require("oracledb");

const MIGRATIONS_DIR = path.join(__dirname, "../db/migrations");
const HISTORY_TABLE = "SCHEMA_MIGRATIONS";
const FILE_PATTERN = /^V(\d+)__(.+)\.sql$/;

// env.js 는 소셜 로그인 키 등을 필수로 요구하므로 DB 접속 정보만 직접 읽음
function getConnectConfig() {
    const required = ["ORACLE_USER", "ORACLE_PASSWORD", "ORACLE_HOST"];
    const missing = required.filter((name) => !process.env[name]);

    if (missing.length > 0) {
        throw new Error(`필수 환경변수 ${missing.join(", ")} 값이 없습니다.`);
    }

    const port = process.env.ORACLE_PORT || 1521;
    const serviceName = process.env.ORACLE_SERVICE_NAME || "xe";

    return {
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASSWORD,
        connectString: `${process.env.ORACLE_HOST}:${port}/${serviceName}`,
    };
}

function initOracleClient() {
    if (process.env.ORACLE_CLIENT_LIB_DIR) {
        oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB_DIR });
    }
}

// =========================
// 마이그레이션 파일
// =========================
function loadMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        return [];
    }

    const migrations = fs.readdirSync(MIGRATIONS_DIR)
        .map((fileName) => {
            const match = fileName.match(FILE_PATTERN);

            if (!match) {
                return null;
            }

            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8")
                .replace(/^﻿/, "")
                .replace(/\r\n/g, "\n");

            return {
                version: Number(match[1]),
                description: match[2].replace(/_/g, " "),
                fileName,
                sql,
                checksum: crypto.createHash("sha256").update(sql).digest("hex"),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.version - b.version);

    const seen = new Set();
    for (const migration of migrations) {
        if (seen.has(migration.version)) {
            throw new Error(`마이그레이션 버전이 중복됩니다: V${migration.version}`);
        }
        seen.add(migration.version);
    }

    return migrations;
}

// =========================
// SQL 구문 분리
//   - 문자열('...')·주석 안의 ; 는 무시
//   - 일반 구문은 ; 로 종료, PL/SQL 블록은 단독 줄 "/" 로 종료
// =========================
const PLSQL_START = /^(BEGIN|DECLARE|CREATE\s+(OR\s+REPLACE\s+)?(EDITIONABLE\s+|NONEDITIONABLE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE))\b/i;

function splitStatements(sql) {
    const statements = [];
    let current = "";
    let inQuote = false;
    let i = 0;

    const pushCurrent = () => {
        const text = current.trim();
        if (text) {
            statements.push(text);
        }
        current = "";
    };

    while (i < sql.length) {
        const ch = sql[i];
        const next = sql[i + 1];
        const atLineStart = i === 0 || sql[i - 1] === "\n";

        if (inQuote) {
            current += ch;
            if (ch === "'") {
                if (next === "'") {
                    current += next;
                    i += 2;
                    continue;
                }
                inQuote = false;
            }
            i += 1;
            continue;
        }

        // PL/SQL 종료: 단독 줄의 "/"
        if (atLineStart && ch === "/" && /^\/[ \t]*(\n|$)/.test(sql.slice(i, i + 64))) {
            pushCurrent();
            const lineEnd = sql.indexOf("\n", i);
            i = lineEnd === -1 ? sql.length : lineEnd + 1;
            continue;
        }

        if (ch === "-" && next === "-") {
            const lineEnd = sql.indexOf("\n", i);
            i = lineEnd === -1 ? sql.length : lineEnd;
            continue;
        }

        if (ch === "/" && next === "*") {
            const blockEnd = sql.indexOf("*/", i + 2);
            i = blockEnd === -1 ? sql.length : blockEnd + 2;
            continue;
        }

        if (ch === "'") {
            inQuote = true;
            current += ch;
            i += 1;
            continue;
        }

        if (ch === ";" && !PLSQL_START.test(current.trim())) {
            pushCurrent();
            i += 1;
            continue;
        }

        current += ch;
        i += 1;
    }

    if (inQuote) {
        throw new Error("닫히지 않은 문자열 리터럴(')이 있습니다.");
    }

    pushCurrent();

    return statements;
}

// =========================
// 이력 테이블
// =========================
async function ensureHistoryTable(conn) {
    const result = await conn.execute(
        "SELECT COUNT(*) AS CNT FROM USER_TABLES WHERE TABLE_NAME = :name",
        { name: HISTORY_TABLE }
    );

    if (result.rows[0].CNT > 0) {
        return;
    }

    await conn.execute(`
        CREATE TABLE ${HISTORY_TABLE} (
            version       NUMBER         NOT NULL,
            description   VARCHAR2(200)  NOT NULL,
            file_name     VARCHAR2(300)  NOT NULL,
            checksum      VARCHAR2(64)   NOT NULL,
            applied_at    TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
            execution_ms  NUMBER,
            baseline_yn   CHAR(1)        DEFAULT 'N' NOT NULL,
            CONSTRAINT pk_schema_migrations PRIMARY KEY (version)
        )
    `);

    console.log(`[migrate] ${HISTORY_TABLE} 테이블 생성`);
}

async function getAppliedMigrations(conn) {
    const result = await conn.execute(
        `SELECT version, checksum, file_name, baseline_yn,
                TO_CHAR(applied_at, 'YYYY-MM-DD HH24:MI:SS') AS applied_at
           FROM ${HISTORY_TABLE}
          ORDER BY version`
    );

    return new Map(result.rows.map((row) => [Number(row.VERSION), row]));
}

async function recordMigration(conn, migration, executionMs, baseline) {
    await conn.execute(
        `INSERT INTO ${HISTORY_TABLE}
            (version, description, file_name, checksum, execution_ms, baseline_yn)
         VALUES (:version, :description, :fileName, :checksum, :executionMs, :baseline)`,
        {
            version: migration.version,
            description: migration.description,
            fileName: migration.fileName,
            checksum: migration.checksum,
            executionMs,
            baseline: baseline ? "Y" : "N",
        }
    );
    await conn.commit();
}

function validateChecksums(migrations, applied) {
    const mismatched = migrations.filter((migration) => {
        const row = applied.get(migration.version);
        return row && row.BASELINE_YN !== "Y" && row.CHECKSUM !== migration.checksum;
    });

    if (mismatched.length > 0) {
        const names = mismatched.map((migration) => migration.fileName).join(", ");
        throw new Error(
            `이미 적용된 마이그레이션 파일이 변경되었습니다: ${names}\n` +
            "적용된 파일은 수정하지 말고 새 마이그레이션 파일로 변경 사항을 추가하세요."
        );
    }
}

// =========================
// 명령
// =========================
async function up(conn) {
    const migrations = loadMigrationFiles();
    const applied = await getAppliedMigrations(conn);

    validateChecksums(migrations, applied);

    const pending = migrations.filter((migration) => !applied.has(migration.version));

    if (pending.length === 0) {
        console.log("[migrate] 적용할 마이그레이션이 없습니다. (최신 상태)");
        return;
    }

    for (const migration of pending) {
        const statements = splitStatements(migration.sql);
        const startedAt = Date.now();

        console.log(`[migrate] ${migration.fileName} 실행 (${statements.length}개 구문)`);

        for (let index = 0; index < statements.length; index++) {
            try {
                await conn.execute(statements[index]);
            } catch (error) {
                await conn.rollback();
                const preview = statements[index].replace(/\s+/g, " ").slice(0, 200);
                throw new Error(
                    `${migration.fileName} 의 ${index + 1}번째 구문 실패: ${error.message}\n  → ${preview}`
                );
            }
        }

        await conn.commit();
        await recordMigration(conn, migration, Date.now() - startedAt, false);

        console.log(`[migrate] ${migration.fileName} 완료 (${Date.now() - startedAt}ms)`);
    }
}

async function status(conn) {
    const migrations = loadMigrationFiles();
    const applied = await getAppliedMigrations(conn);

    console.log("VERSION  STATUS     APPLIED_AT           FILE");

    for (const migration of migrations) {
        const row = applied.get(migration.version);
        let state = "PENDING";

        if (row) {
            state = row.BASELINE_YN === "Y" ? "BASELINE" : "APPLIED";
            if (row.BASELINE_YN !== "Y" && row.CHECKSUM !== migration.checksum) {
                state = "CHANGED!";
            }
        }

        console.log(
            `V${String(migration.version).padEnd(7)} ${state.padEnd(10)} ${(row?.APPLIED_AT || "-").padEnd(20)} ${migration.fileName}`
        );
    }

    for (const [version, row] of applied) {
        if (!migrations.some((migration) => migration.version === version)) {
            console.log(`V${String(version).padEnd(7)} MISSING    ${row.APPLIED_AT.padEnd(20)} ${row.FILE_NAME} (파일 없음)`);
        }
    }
}

async function baseline(conn, targetVersion) {
    if (!Number.isInteger(targetVersion) || targetVersion < 1) {
        throw new Error("baseline 할 버전 번호를 지정하세요. 예) npm run migrate:baseline -- 2");
    }

    const migrations = loadMigrationFiles();
    const applied = await getAppliedMigrations(conn);
    const targets = migrations.filter(
        (migration) => migration.version <= targetVersion && !applied.has(migration.version)
    );

    for (const migration of targets) {
        await recordMigration(conn, migration, 0, true);
        console.log(`[migrate] ${migration.fileName} → BASELINE 기록 (실행하지 않음)`);
    }

    if (targets.length === 0) {
        console.log("[migrate] baseline 으로 기록할 마이그레이션이 없습니다.");
    }
}

function create(description) {
    if (!description) {
        throw new Error("마이그레이션 설명을 입력하세요. 예) npm run migrate:create -- add_member_role");
    }

    const migrations = loadMigrationFiles();
    const nextVersion = migrations.length > 0 ? migrations[migrations.length - 1].version + 1 : 1;
    const slug = description.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, "_").replace(/^_|_$/g, "");
    const fileName = `V${String(nextVersion).padStart(3, "0")}__${slug}.sql`;

    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    fs.writeFileSync(
        path.join(MIGRATIONS_DIR, fileName),
        `-- ${fileName}\n-- 작성일: ${new Date().toISOString().slice(0, 10)}\n\n`,
        "utf8"
    );

    console.log(`[migrate] 생성: db/migrations/${fileName}`);
}

async function main() {
    const [command = "up", arg] = process.argv.slice(2);

    if (command === "create") {
        create(process.argv.slice(3).join(" "));
        return;
    }

    if (!["up", "status", "baseline"].includes(command)) {
        throw new Error(`알 수 없는 명령: ${command} (up | status | baseline | create)`);
    }

    initOracleClient();
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

    const conn = await oracledb.getConnection(getConnectConfig());

    try {
        // VARCHAR2 길이를 byte 가 아닌 문자 수 기준으로 (한글 1자 = 3byte 문제 방지)
        await conn.execute("ALTER SESSION SET NLS_LENGTH_SEMANTICS = CHAR");
        await ensureHistoryTable(conn);

        if (command === "up") await up(conn);
        if (command === "status") await status(conn);
        if (command === "baseline") await baseline(conn, Number(arg));
    } finally {
        await conn.close();
    }
}

main().catch((error) => {
    console.error(`[migrate] 실패: ${error.message}`);
    process.exit(1);
});
