function requireEnv(name) {
    const value = process.env[name];

    if (value === undefined || value === null || value === "") {
        throw new Error(`필수 환경변수 ${name} 값이 없습니다.`);
    }

    return value;
}

function numberEnv(name, defaultValue) {
    const value = process.env[name];

    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        throw new Error(`환경변수 ${name} 값은 숫자여야 합니다. 현재 값: ${value}`);
    }

    return parsed;
}

function booleanEnv(name, defaultValue) {
    const value = process.env[name];

    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    if (value !== "true" && value !== "false") {
        throw new Error(`환경변수 ${name} 값은 true 또는 false여야 합니다. 현재 값: ${value}`);
    }

    return value === "true";
}

function arrayEnv(name, defaultValue) {
    const value = process.env[name];

    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    return value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "");
}

const env = {
    nodeEnv: process.env.NODE_ENV || "development",
    port: numberEnv("PORT", 3000),

    github: {
        clientId: requireEnv("GITHUB_CLIENT_ID"),
        apiVersion: process.env.GITHUB_API_VERSION || "2022-11-28",
    },

    kakao: {
        restApiKey: requireEnv("KAKAO_REST_API_KEY"),
        redirectUri: requireEnv("KAKAO_REDIRECT_URI"),
        clientSecret: requireEnv("KAKAO_CLIENT_SECRET"),
    },   

    naver: {
        clientId: process.env.NAVER_CLIENT_ID,
        clientSecret: process.env.NAVER_CLIENT_SECRET,
        redirectUri: process.env.NAVER_REDIRECT_URI,
    },

    oracle: {
        user: requireEnv("ORACLE_USER"),
        password: requireEnv("ORACLE_PASSWORD"),
        connectString: requireEnv("ORACLE_CONNECT_STRING"),
        clientLibDir: requireEnv("ORACLE_CLIENT_LIB_DIR"),
        poolAlias: process.env.ORACLE_POOL_ALIAS || "main",
        poolMin: numberEnv("ORACLE_POOL_MIN", 0),
        poolMax: numberEnv("ORACLE_POOL_MAX", 1),
        poolIncrement: numberEnv("ORACLE_POOL_INCREMENT", 1),
        poolTimeout: numberEnv("ORACLE_POOL_TIMEOUT", 60),
    },

    cors: {
        origins: arrayEnv("CORS_ORIGINS", [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]),
        credentials: booleanEnv("CORS_CREDENTIALS", true),
        methods: arrayEnv("CORS_METHODS", [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS",
        ]),
        allowedHeaders: arrayEnv("CORS_ALLOWED_HEADERS", [
            "Content-Type",
            "Authorization",
        ]),
    },
};

module.exports = env;