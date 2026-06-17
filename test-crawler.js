const axios = require('axios');
const fs = require('fs');

async function testAjax() {
    console.log("DBR AJAX 요청 시작...");
    const params = new URLSearchParams({ start_num: 1, end_num: 20 });
    
    try {
        const response = await axios.post('https://dbr.donga.com/article/viewmore/1904', params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        fs.writeFileSync('dbr_ajax.html', response.data);
        console.log("✅ dbr_ajax.html 저장 완료! 이 파일의 내용을 복사해서 보여주세요.");
    } catch (error) {
        console.error("오류:", error.message);
    }
}

testAjax();