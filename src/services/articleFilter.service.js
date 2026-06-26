const { 
    REMOVE_PATTERNS, 
    INVALID_PATTERNS, 
    REFERENCE_PATTERNS,
    MIN_BODY_LENGTH,
    FILTER_VERSION,
    ValidationReason
} = require('../config/articleFilter.config');

/**
 * [Step 1] HTML Entity 및 특수문자 정규화
 */
function normalizeEntities(text, meta) {
    return text
        .replace(/&nbsp;|&#160;/gi, ' ')
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
}

/**
 * [Step 2] 노이즈 제거 (광고, 기자 소개, 저작권 문구 등)
 */
function removeNoise(text, meta) {
    let cleaned = text;
    REMOVE_PATTERNS.forEach(({ name, pattern }) => {
        const matches = cleaned.match(pattern);
        if (matches) {
            meta.removedPatterns.add(name);
            meta.removedCount += matches.length;
            cleaned = cleaned.replace(pattern, ' '); 
        }
    });
    return cleaned;
}

/**
 * [Step 3] 각주 및 참고문헌 제거
 */
function removeReferences(text, meta) {
    let cleaned = text;
    REFERENCE_PATTERNS.forEach(({ name, pattern }) => {
        const matches = cleaned.match(pattern);
        if (matches) {
            meta.removedPatterns.add(name);
            meta.removedCount += matches.length;
            cleaned = cleaned.replace(pattern, ''); 
        }
    });
    return cleaned;
}

/**
 * [Step 4] 공백 및 문단 구조 정규화
 */
function normalizeWhitespace(text, meta) {
    return text
        .replace(/\r/g, '')
        .replace(/\t/g, ' ')
        .replace(/[ ]{2,}/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n') 
        .trim();
}

// 텍스트 정제 파이프라인 배열
const textProcessors = [
    normalizeEntities,
    removeNoise,
    removeReferences,
    normalizeWhitespace
];

/**
 * [Step 5] 유효성 검증 (Terminal Step)
 */
function validate(text) {
    const matchedItem = INVALID_PATTERNS.find(item => item.pattern.test(text));

    if (matchedItem) {
        return { isValid: false, reason: matchedItem.reason };
    } 
    
    if (text.length < MIN_BODY_LENGTH) {
        return { isValid: false, reason: ValidationReason.BODY_TOO_SHORT };
    }

    return { isValid: true, reason: null };
}

/**
 * [Main] Filter Service 진입점
 */
function cleanBody(rawBody, url = "") {
    if (!rawBody) {
        return { 
            isValid: false, 
            invalidReason: ValidationReason.EMPTY_BODY,
            cleanBody: "", 
            rawLength: 0, 
            cleanLength: 0, 
            removedPatterns: [],
            removedCount: 0,
            filterVersion: FILTER_VERSION
        };
    }

    let currentText = rawBody;
    
    const meta = {
        removedPatterns: new Set(),
        removedCount: 0
    };

    // 파이프라인 연쇄 가공
    for (const processor of textProcessors) {
        currentText = processor(currentText, meta);
    }

    // 최종 유효성 검증
    const validation = validate(currentText);

    if (!validation.isValid) {
        console.warn(
            `\n[Filter Warning] 기사 스킵됨\n` +
            ` - URL: ${url || "Unknown"}\n` +
            ` - Reason: ${validation.reason}\n` +
            ` - Raw/Clean Length: ${rawBody.length} / ${currentText.length}`
        );
    }

    return {
        isValid: validation.isValid,
        invalidReason: validation.reason,
        cleanBody: currentText,
        rawLength: rawBody.length,
        cleanLength: currentText.length,
        removedPatterns: Array.from(meta.removedPatterns),
        removedCount: meta.removedCount,
        filterVersion: FILTER_VERSION
    };
}

module.exports = {
    cleanBody
};