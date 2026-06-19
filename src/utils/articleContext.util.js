const fs = require('fs').promises;
const path = require('path');

// 파일 경로 설정
const CONTEXT_DIR = path.join(__dirname, '../../storage');
const FILE_PATH = path.join(CONTEXT_DIR, 'today_articles.json');
const TMP_FILE_PATH = path.join(CONTEXT_DIR, 'today_articles.tmp');

/**
 * 디렉토리가 없으면 생성 (초기 구동 시 안전성 확보)
 */
async function ensureDirectory() {
    try {
        await fs.access(CONTEXT_DIR);
    } catch {
        await fs.mkdir(CONTEXT_DIR, { recursive: true });
    }
}

/**
 * today_articles.json 파일 존재 여부 확인
 * @returns {Promise<boolean>}
 */
async function existsContext() {
    try {
        await fs.access(FILE_PATH);
        return true;
    } catch {
        return false;
    }
}

/**
 * Context 파일 읽기
 * @returns {Promise<Object|null>} 파싱된 JSON 데이터 또는 파일이 없으면 null
 */
async function readContext() {
    try {
        const data = await fs.readFile(FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // 파일이 존재하지 않는 경우 (처음 실행)
        if (error.code === 'ENOENT') {
            return null;
        }
        // 파일은 있는데 JSON 파싱이 깨진 경우
        throw new Error(`Context 파싱 실패: ${error.message}`);
    }
}

/**
 * Context의 crawlDate만 빠르게 확인 (Service에서 활용)
 * @returns {Promise<string|null>} "YYYY-MM-DD" 포맷의 날짜 또는 null
 */
async function getContextDate() {
    const context = await readContext();
    return context ? context.crawlDate : null;
}

/**
 * Context 파일 쓰기 (Atomic Write 적용)
 * @param {Object} data - 저장할 JSON 객체
 */
async function writeContext(data) {
    await ensureDirectory();
    
    try {
        const jsonData = JSON.stringify(data, null, 2);
        
        // 1. 임시(.tmp) 파일에 먼저 안전하게 저장
        await fs.writeFile(TMP_FILE_PATH, jsonData, 'utf-8');
        
        // 2. 저장이 완전히 끝나면 rename으로 바꿔치기
        await fs.rename(TMP_FILE_PATH, FILE_PATH);
        
    } catch (error) {
        // 쓰기 실패 시 찌꺼기 tmp 파일이 있다면 정리
        try {
            await fs.unlink(TMP_FILE_PATH);
        } catch (cleanupError) {
            // 무시
        }
        throw new Error(`Context 쓰기 실패 (기존 파일 유지됨): ${error.message}`);
    }
}

/**
 * Context 관련 파일 모두 삭제 (.json 및 .tmp)
 */
async function clearContext() {
    try {
        // 파일이 없을 때 발생하는 ENOENT 에러는 무시하고, 존재할 경우에만 삭제
        await fs.unlink(FILE_PATH).catch(e => { if (e.code !== 'ENOENT') throw e; });
        await fs.unlink(TMP_FILE_PATH).catch(e => { if (e.code !== 'ENOENT') throw e; });
    } catch (error) {
        throw new Error(`Context 삭제 실패: ${error.message}`);
    }
}

module.exports = {
    existsContext,
    readContext,
    getContextDate,
    writeContext,
    clearContext
};