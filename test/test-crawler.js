const { crawlArticle } = require("../src/crawler/dbr.crawler");

(async () => {

    const body = await crawlArticle(
        "https://dbr.donga.com/article/view/1904/article_no/12163/ac/a_list"
    );

    console.log(body);
    console.log(body.length);

})();