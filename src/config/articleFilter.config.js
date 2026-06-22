/**
 * [Filter Config] 기사 본문 정제 및 유효성 검사를 위한 설정값 모음
 */

// 유효성 검사 실패 사유 Enum
const ValidationReason = {
    EMPTY_BODY: "EMPTY_BODY",
    BODY_TOO_SHORT: "BODY_TOO_SHORT",
    PAYWALL: "PAYWALL",
    ERROR_PAGE: "ERROR_PAGE"
};

module.exports = {
    // 필터 버전 (필터 로직이나 패턴 변경 시 버전을 올려 데이터를 재처리할 때 비교 용도)
    FILTER_VERSION: "v1.1",

    // 유효한 기사로 인정하기 위한 최소 본문 길이
    MIN_BODY_LENGTH: 800,
    
    ValidationReason,

    // 본문 전체를 무효 처리(Skip)해야 하는 페이월/에러 패턴
    INVALID_PATTERNS: [
        { reason: ValidationReason.PAYWALL, pattern: /로그인이\s*필요/ },
        { reason: ValidationReason.PAYWALL, pattern: /회원만\s*이용/ },
        { reason: ValidationReason.PAYWALL, pattern: /권한이\s*없습니다/ },
        { reason: ValidationReason.ERROR_PAGE, pattern: /404/ },
        { reason: ValidationReason.ERROR_PAGE, pattern: /Forbidden/i },
        { reason: ValidationReason.ERROR_PAGE, pattern: /Access\s*Denied/i }
    ],

    // 기사는 유효하지만 본문에서 제거해야 하는 노이즈 패턴 (광고, 기자 정보 등)
    REMOVE_PATTERNS: [
        { name: "EDITOR_NOTE", pattern: /※\s*편집자주[\s\S]*?(?=\n|$)/g },
        { name: "PHOTO_SOURCE", pattern: /사진\s*=\s*DBR/gi },
        { name: "PHOTO_DESC", pattern: /사진설명\s*:.*?(?=\n|$)/gi },
        { name: "COPYRIGHT", pattern: /Copyright\s*ⓒ.*?(?=\n|$)/gi },
        { name: "COPYRIGHT", pattern: /ⓒ\s*동아일보.*?(?=\n|$)/gi },
        { name: "COPYRIGHT", pattern: /무단\s*전재.*?금지/gi },
        { name: "RELATED_ARTICLE", pattern: /관련기사.*?(?=\n|$)/gi },
        { name: "RECOMMENDED_ARTICLE", pattern: /추천기사.*?(?=\n|$)/gi },
        { name: "REPORTER", pattern: /\[.*?기자.*?\]/g },
        { name: "REPORTER", pattern: /[가-힣]{2,5}\s*기자.*?(?=\n|$)/g },
        { name: "EMAIL", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
        { name: "SHARE_UI", pattern: /DBR\s*기사\s*공유하기.*?(?=\n|$)/gi },
        { name: "DATE_INFO", pattern: /입력\s*\d{4}\.\d{2}\.\d{2}.*?(?=\n|$)/g },
        { name: "DATE_INFO", pattern: /수정\s*\d{4}\.\d{2}\.\d{2}.*?(?=\n|$)/g },
        { name: "SNS_FACEBOOK", pattern: /페이스북/gi },
        { name: "SNS_KAKAOTALK", pattern: /카카오톡/gi },
        { name: "SNS_NAVER", pattern: /네이버\s*공유/gi },
        { name: "SHARE_URL", pattern: /URL\s*복사/gi },
        
        // 팀장님 추가 패턴 반영
        { name: "ARTICLE_GLANCE", pattern: /Article\s+at\s+a\s+Glance/gi },
        { name: "DBR_MINI_BOX", pattern: /DBR\s*mini\s*box/gi },
        { name: "CLOSE_BTN", pattern: /^\s*닫기\s*$/gm }
    ],

    // 각주 및 레퍼런스 제거를 위한 패턴
    REFERENCE_PATTERNS: [
        // 팀장님 추가 패턴 반영
        { name: "FOOTNOTE_TEXT", pattern: /^[0-9]+\s*[A-Z]\.\s*[A-Za-z].*$/gm },
        { name: "FOOTNOTE_BRACKET", pattern: /^[0-9]+\)/gm },
        { name: "FOOTNOTE_NUMBER", pattern: /^\d+\s*$/gm },
        { name: "CLOSE_BTN", pattern: /^\s*닫기\s*$/gm }
    ]
};