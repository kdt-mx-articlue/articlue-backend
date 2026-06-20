const { chromium } = require("playwright");

(async () => {

    const context = await chromium.launchPersistentContext(
        "./browser/chrome-profile",
        {
            channel: "chrome",
            headless: false
        }
    );

    const page = await context.newPage();

    await page.goto("https://dbr.donga.com");

    console.log("★★★★★");
    console.log("DBR 로그인하세요.");
    console.log("로그인 완료 후 Enter");
    console.log("★★★★★");

    process.stdin.once("data", async () => {

        await context.close();

        process.exit(0);

    });

})();