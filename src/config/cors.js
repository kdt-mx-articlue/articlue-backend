const cors = require("cors");
const env = require("./env");

const corsOptions = {
    origin(origin, callback) {
        // Postman, 서버간 통신 등 origin 없는 요청 허용
        if (!origin) {
            return callback(null, true);
        }

        if (env.cors.origins.includes(origin)) {
            return callback(null, true);
        }

        return callback(
            new Error(`허용되지 않은 Origin입니다: ${origin}`)
        );
    },

    credentials: env.cors.credentials,
    methods: env.cors.methods,
    allowedHeaders: env.cors.allowedHeaders,
};

module.exports = cors(corsOptions);