const { 
    REMOVE_PATTERNS, 
    INVALID_PATTERNS, 
    MIN_BODY_LENGTH 
} = require('../config/articleFilter.config');

/**
 * [Filter Service] 기사 본문 전처리 로직
 */
function cleanBody(rawBody, url = "") {
    if (!rawBody) {
        return { 
            cleanBody: "", 
            rawLength: 0, 
            cleanLength: 0, 
            isValid: false, 
            invalidReason: "EMPTY_BODY"
        };
    }

    let cleaned = rawBody;
    const rawLength = rawBody.length;

    // 1. 불필요한 섹션 및 텍스트 제거
    REMOVE_PATTERNS.forEach(pattern => {
        cleaned = cleaned.replace(pattern, ' ');
    });

    // 2. HTML Entity 및 특수문자 정규화
    cleaned = cleaned.replace(/&nbsp;|&#160;/gi, ' ')
                     .replace(/&lt;/gi, '<')
                     .replace(/&gt;/gi, '>')
                     .replace(/&amp;/gi, '&')
                     .replace(/&quot;/gi, '"')
                     .replace(/&ldquo;|&#8220;/g, '"')
                     .replace(/&rdquo;|&#8221;/g, '"')
                     .replace(/&lsquo;|&#8216;/g, "'")
                     .replace(/&rsquo;|&#8217;/g, "'")
                     .replace(/&#39;/g, "'")
                     .replace(/&middot;/g, "·");

    // 3. 공백 및 문단 구조 최적화
    cleaned = cleaned
        .replace(/\r/g, '')
        .replace(/\t/g, ' ')
        .replace(/[ ]{2,}/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n') 
        .trim();

    // 4. 메타데이터 산출
    const cleanLength = cleaned.length;
    
    // 5. 유효성 검증 (정규식 .test() 활용)
    let isValid = true;
    let invalidReason = null;

    const matchedPattern = INVALID_PATTERNS.find(pattern => pattern.test(cleaned));

    if (matchedPattern) {
        isValid = false;
        invalidReason = "PAYWALL";
    } else if (cleanLength < MIN_BODY_LENGTH) {
        isValid = false;
        invalidReason = "BODY_TOO_SHORT";
    }

    // 6. 경고 로그 출력 (정규식을 문자열로 변환하여 출력)
    if (!isValid) {
        console.warn(`
[Filter Warning]
URL     : ${url || "Unknown URL"}
Reason  : ${invalidReason}
Raw     : ${rawLength}
Clean   : ${cleanLength}
Pattern : ${matchedPattern ? matchedPattern.toString() : "None"}
`);
    }

    return {
        cleanBody: cleaned,
        rawLength,
        cleanLength,
        isValid,
        invalidReason
    };
}

module.exports = {
    cleanBody
};