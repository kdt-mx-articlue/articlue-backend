const fs = require('fs').promises;
const path = require('path');

// [최종 폴더 구조 반영] 프로젝트 루트 기준 storage 하위 디렉토리 정의
const STORAGE_ROOT = path.join(__dirname, '../../storage');
const STAGING_DIR = path.join(STORAGE_ROOT, 'staging');
const CURRENT_DIR = path.join(STORAGE_ROOT, 'current');
const ARCHIVE_DIR = path.join(STORAGE_ROOT, 'archive');

/**
 * 디렉토리가 존재하는지 확인하고, 없다면 재귀적으로 생성합니다.
 * @param {string} dirPath - 확인할 디렉토리 절대 경로
 * @returns {Promise<void>}
 */
async function ensureDirectory(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

/**
 * 데이터를 안전하게 JSON 파일로 저장합니다. (Pretty Print 적용)
 * @param {string} dirPath - 저장 대상 디렉토리 경로
 * @param {string} fileName - 확장자를 포함한 파일명
 * @param {object|array} data - 저장할 데이터
 * @returns {Promise<void>}
 */
async function writeJsonFile(dirPath, fileName, data) {
    try {
        await ensureDirectory(dirPath);
        const filePath = path.join(dirPath, fileName);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[Storage Util] 파일 저장 성공: ${fileName}`);
    } catch (error) {
        console.error(`[Storage Util Error] 파일 저장 실패 (${fileName}): ${error.message}`);
        throw error;
    }
}

/**
 * JSON 파일을 읽어서 객체나 배열로 파싱합니다.
 * @param {string} dirPath - 읽을 파일이 있는 디렉토리 경로
 * @param {string} fileName - 확장자를 포함한 파일명
 * @returns {Promise<object|array|null>} 파싱된 데이터, 파일이 없거나 에러 발생 시 null 반환
 */
async function readJsonFile(dirPath, fileName) {
    try {
        const filePath = path.join(dirPath, fileName);
        const rawData = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        // [핵심] 파일이 없는 자연스러운 상황(ENOENT)은 에러 로그 없이 null 반환
        if (error.code === 'ENOENT') {
            return null;
        }

        // 권한 부족, JSON 파싱 실패 등 진짜 문제일 때만 로그 출력
        console.error(`[Storage Util Error] 파일 읽기 실패 (${fileName}): ${error.message}`);
        return null;
    }
}

module.exports = {
    /**
     * Staging 영역에 JSON 파일을 저장합니다. (stage1_raw.json, stage2_body.json, stage3_clean.json)
     * @param {string} fileName 
     * @param {object|array} data 
     */
    saveStaging: async (fileName, data) => writeJsonFile(STAGING_DIR, fileName, data),

    /**
     * Current 영역에 오늘 서비스할 데이터를 저장합니다. (today_articles.json 등)
     * @param {string} fileName 
     * @param {object|array} data 
     */
    saveCurrent: async (fileName, data) => writeJsonFile(CURRENT_DIR, fileName, data),

    /**
     * Archive 영역에 월별 기사를 보관합니다. (article_YYYY_MM.json)
     * @param {string} fileName 
     * @param {object|array} data 
     */
    saveArchive: async (fileName, data) => writeJsonFile(ARCHIVE_DIR, fileName, data),

    /**
     * Staging 영역의 JSON 파일을 로드합니다.
     * @param {string} fileName 
     * @returns {Promise<object|array|null>}
     */
    loadStaging: async (fileName) => readJsonFile(STAGING_DIR, fileName),

    /**
     * Current 영역의 JSON 파일을 로드합니다.
     * @param {string} fileName 
     * @returns {Promise<object|array|null>}
     */
    loadCurrent: async (fileName) => readJsonFile(CURRENT_DIR, fileName),

    /**
     * Archive 영역의 JSON 파일을 로드합니다.
     * @param {string} fileName 
     * @returns {Promise<object|array|null>}
     */
    loadArchive: async (fileName) => readJsonFile(ARCHIVE_DIR, fileName)
};