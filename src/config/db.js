const fs = require("fs");
const path = require("path");
const oracledb = require("oracledb");
const env = require("./env");

let poolInitialized = false;
let oracleClientInitialized = false;

function validateOracleClientLibDir() {
    // Windows: oci.dll / Linux: libclntsh.so
    const libFile = process.platform === "win32" ? "oci.dll" : "libclntsh.so";
    const ociPath = path.join(env.oracle.clientLibDir, libFile);

    if (!fs.existsSync(ociPath)) {
        throw new Error(
            [
                "Oracle Client 라이브러리를 찾을 수 없습니다.",
                `확인한 경로: ${ociPath}`,
                "ORACLE_CLIENT_LIB_DIR 값이 올바른지 확인하세요.",
            ].join("\n")
        );
    }
}

function initOracleClientFor11g() {
    if (oracleClientInitialized || oracledb.thin === false) {
        return;
    }

    // ORACLE_CLIENT_LIB_DIR 미설정 → thin mode (Oracle 12.1+ / Docker 환경)
    if (!env.oracle.clientLibDir) {
        console.log("Oracle thin mode 사용 (ORACLE_CLIENT_LIB_DIR 미설정)");
        return;
    }

    validateOracleClientLibDir();

    oracledb.initOracleClient({
        libDir: env.oracle.clientLibDir,
    });

    oracleClientInitialized = true;

    console.log("Oracle Thick mode enabled");
    console.log(`Oracle Client libDir: ${env.oracle.clientLibDir}`);
}

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

async function initOraclePool() {
    if (poolInitialized) {
        return;
    }

    initOracleClientFor11g();

    await oracledb.createPool({
        poolAlias: env.oracle.poolAlias,
        user: env.oracle.user,
        password: env.oracle.password,
        connectString: env.oracle.connectString,

        poolMin: env.oracle.poolMin,
        poolMax: env.oracle.poolMax,
        poolIncrement: env.oracle.poolIncrement,
        poolTimeout: env.oracle.poolTimeout,

        autoCommit: false,
    });

    poolInitialized = true;

    console.log(`Oracle pool created: ${env.oracle.poolAlias}`);
    console.log(`oracledb.thin: ${oracledb.thin}`);
}

async function getConnection() {
    if (!poolInitialized) {
        throw new Error("Oracle pool이 초기화되지 않았습니다. initOraclePool()을 먼저 호출하세요.");
    }

    return await oracledb.getConnection(env.oracle.poolAlias);
}

async function closeOraclePool() {
    if (!poolInitialized) {
        return;
    }

    try {
        await oracledb.getPool(env.oracle.poolAlias).close(10);
        poolInitialized = false;
        console.log(`Oracle pool closed: ${env.oracle.poolAlias}`);
    } catch (error) {
        console.error("Oracle pool close failed:", error.message);
    }
}

module.exports = {
    oracledb,
    initOraclePool,
    getConnection,
    closeOraclePool,
};