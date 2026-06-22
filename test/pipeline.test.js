const { runPipeline } = require("../src/pipeline/article.pipeline");

(async () => {
    try {
        const result = await runPipeline(5);

        console.log("\n===== 결과 =====");
        console.log(result);
    } catch (err) {
        console.error(err);
    }
})();