const REMOVE_PATTERNS = [
    /※\s*편집자주[\s\S]*?(?=\n|$)/g,
    /사진\s*=\s*DBR/gi,
    /사진설명\s*:.*?(?=\n|$)/gi,
    /Copyright\s*ⓒ.*?(?=\n|$)/gi,
    /ⓒ\s*동아일보.*?(?=\n|$)/gi,
    /무단\s*전재.*?금지/gi,
    /관련기사.*?(?=\n|$)/gi,
    /추천기사.*?(?=\n|$)/gi,
    /\[.*?기자.*?\]/g,
    /[가-힣]{2,5}\s*기자.*?(?=\n|$)/g,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    /DBR\s*기사\s*공유하기.*?(?=\n|$)/gi,
    /입력\s*\d{4}\.\d{2}\.\d{2}.*?(?=\n|$)/g,
    /수정\s*\d{4}\.\d{2}\.\d{2}.*?(?=\n|$)/g,
    /페이스북/gi,
    /카카오톡/gi,
    /네이버\s*공유/gi,
    /URL\s*복사/gi
];

const INVALID_PATTERNS = [
    /로그인이\s*필요/,
    /회원만\s*이용/,
    /권한이\s*없습니다/,
    /404/,
    /Forbidden/i,
    /Access\s*Denied/i
];

const MIN_BODY_LENGTH = 800;

module.exports = {
    REMOVE_PATTERNS,
    INVALID_PATTERNS,
    MIN_BODY_LENGTH
};