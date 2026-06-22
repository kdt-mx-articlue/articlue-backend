const express = require("express");
const router = express.Router();

const { runPipeline } = require("../pipeline/article.pipeline");

router.post("/run", async (req, res) => {
    try {
        await runPipeline(5);

        res.json({
            success: true,
            message: "Pipeline completed."
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;