const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller.js');

/**
 * @swagger
 * /api/member/profile:
 *   get:
 *     summary: 이력서 DB 15개 조회
 *     description: 구글 시트의 [resume] 테이블 명세서와 100% 호환되는 스네이크 케이스 컬럼 데이터를 조회합니다.
 *     tags:
 *       - Resume DB CRUD
 *     responses:
 *       200:
 *         description: 조회 성공
 *
 *   post:
 *     summary: 이력서 DB 15개 생성
 *     description: NOT NULL 속성을 검증하고 시스템 생성일자(create_date)를 자동 매핑하여 레코드를 생성합니다.
 *     tags:
 *       - Resume DB CRUD
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               resume_id: 1
 *               member_id: 1
 *               resume_title: 주니어 백엔드 개발자 채용
 *               name: 홍길동
 *               phone: "01012345678"
 *               email: admin@naver.com
 *               birth_date: 1999-12-31
 *               address: 전라남도 광주광역시
 *               gender: male
 *               military_status: Y
 *               desired_location: 서울
 *               resume_status: Y
 *               representative_yn: Y
 *     responses:
 *       201:
 *         description: 최초 생성 완료
 *
 *   put:
 *     summary: 이력서 DB 수정
 *     description: 수정된 속성들을 덮어쓰고 최종 수정일자(update_date)를 시스템 타임으로 강제 갱신합니다.
 *     tags:
 *       - Resume DB CRUD
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               resume_title: 수정 완료된 최종 이력서 명칭
 *               address: 서울특별시 강남구
 *               resume_status: 완료
 *     responses:
 *       200:
 *         description: 수정 완료
 *
 *   delete:
 *     summary: 이력서 DB 삭제
 *     description: 메모리 적재 본을 초기화합니다.
 *     tags:
 *       - Resume DB CRUD
 *     responses:
 *       200:
 *         description: 삭제 완료
 */

router.get('/profile', userController.getProfile);
router.post('/profile', userController.createProfile);
router.put('/profile', userController.updateProfile);
router.delete('/profile', userController.deleteProfile);

/**
 * @swagger
 * /api/member/education:
 *   get:
 *     summary: 학력사항 DB 리스트 조회
 *     description: 구글 시트 [학력] 테이블 규격의 모든 학력 데이터 배열을 조회합니다.
 *     tags:
 *       - Education DB CRUD
 *     responses:
 *       200:
 *         description: 조회 성공
 *
 *   post:
 *     summary: 학력사항 DB 생성
 *     description: 학교구분, 전공, 학점 등을 입력받아 학력 리스트에 새 카드를 등록합니다.
 *     tags:
 *       - Education DB CRUD
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               resume_id: 1
 *               school_type: 고등학교
 *               school_name: 동아고등학교
 *               major: 인문계
 *               gpa: 0
 *               start_ym: 2012.03
 *               end_ym: 2015.02
 *     responses:
 *       201:
 *         description: 생성 성공
 */

/**
 * @swagger
 * /api/member/education/{educationId}:
 *   put:
 *     summary: 학력사항 DB 수정
 *     description: education_id를 기준으로 전공이나 학교명 등 변경된 데이터를 수정합니다.
 *     tags:
 *       - Education DB CRUD
 *     parameters:
 *       - in: path
 *         name: educationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 수정할 학력사항 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               school_name: 코딩대학교로 개명
 *               gpa: 4.3
 *     responses:
 *       200:
 *         description: 수정 성공
 *
 *   delete:
 *     summary: 학력사항 DB 삭제
 *     description: education_id를 기준으로 특정 학력 데이터를 삭제합니다.
 *     tags:
 *       - Education DB CRUD
 *     parameters:
 *       - in: path
 *         name: educationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 삭제할 학력사항 ID
 *     responses:
 *       200:
 *         description: 삭제 성공
 */

// 학력사항 CRUD 라우팅
router.get('/education', userController.getEducation);
router.post('/education', userController.createEducation);
router.put('/education/:educationId', userController.updateEducation);
router.delete('/education/:educationId', userController.deleteEducation);

/**
 * @swagger
 * /api/member/experience:
 *   get:
 *     summary: 경험사항 DB 리스트 조회
 *     description: 구글 시트 [resume_experience] 테이블 규격의 모든 경험 데이터를 배열 형태로 조회합니다.
 *     tags:
 *       - Experience DB CRUD
 *     responses:
 *       200:
 *         description: 조회 성공
 *
 *   post:
 *     summary: 경험사항 DB 생성
 *     description: 경험구분, 경험명, 기간 데이터를 입력받아 새로운 경험 카드를 생성합니다.
 *     tags:
 *       - Experience DB CRUD
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               resume_id: 1
 *               experience_type: 교육
 *               experience_name: 동아MX School
 *               start_ym: 2025.12
 *               end_ym: 2026.07
 *     responses:
 *       201:
 *         description: 생성 성공
 */

/**
 * @swagger
 * /api/member/experience/{experienceId}:
 *   put:
 *     summary: 경험사항 DB 수정
 *     description: experienceId 기준으로 특정 경험 데이터를 수정합니다.
 *     tags:
 *       - Experience DB CRUD
 *     parameters:
 *       - in: path
 *         name: experienceId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 수정할 경험 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               experience_name: 동아MX School 2기 스태프
 *               end_ym: 2026.08
 *     responses:
 *       200:
 *         description: 수정 성공
 *
 *   delete:
 *     summary: 경험사항 DB 삭제
 *     description: experienceId 기준으로 특정 경험 데이터를 삭제합니다.
 *     tags:
 *       - Experience DB CRUD
 *     parameters:
 *       - in: path
 *         name: experienceId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 삭제할 경험 ID
 *     responses:
 *       200:
 *         description: 삭제 성공
 */

// 경험사항 CRUD 라우팅
router.get('/experience', userController.getExperiences);
router.post('/experience', userController.createExperience);
router.put('/experience/:experienceId', userController.updateExperience);
router.delete('/experience/:experienceId', userController.deleteExperience);

/* ==========================================================
    [ 4. 자기소개서 문항(cover_letter_item) 테이블 CRUD ]
   ========================================================== */

/**
 * @swagger
 * /api/member/resumes/{resumeId}/cover-letters:
 *   get:
 *     summary: 특정 이력서의 자소서 문항 목록 조회
 *     description: 이력서 번호(resumeId)와 연동된 모든 자소서 문항들을 문항 순서(question_order)가 빠른 순대로 정렬하여 리스트로 가져옵니다.
 *     tags:
 *       - Cover Letter DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 조회할 이력서 고유 번호
 *     responses:
 *       200:
 *         description: 조회 성공 및 배열 반환
 */

/**
 * @swagger
 * /api/member/resumes/{resumeId}/cover-letters/items:
 *   post:
 *     summary: 자기소개서 새 문항 추가
 *     description: 특정 이력서 번호(resumeId) 영역 아래에 새로운 자소서 문항을 추가합니다. 고유 번호표 기계로 ID 중복을 원천 차단하며, 해당 이력서 내의 문항 개수를 세어 순서(question_order)를 자동으로 매깁니다.
 *     tags:
 *       - Cover Letter DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 자소서를 추가할 이력서 고유 번호
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               sub_title: Redis 캐싱으로 응답 속도를 개선한 경험
 *               content: 프로젝트 진행 중 대용량 트래픽 처리를 위해 Redis 캐시 메모리를 도입하여 인프라 비용 절감 성과를 냈습니다...
 *     responses:
 *       201:
 *         description: 중복 없는 안전한 새 문항 추가 성공
 */

/**
 * @swagger
 * /api/member/cover-letter-items/{itemId}:
 *   put:
 *     summary: 자기소개서 특정 문항 수정
 *     description: 문항 고유 ID(itemId)를 찾아서 소제목과 본문을 수정합니다. 이력서 방 번호(resume_id)나 문항 ID 자체를 임의로 수정하려는 공격이나 실수는 서버 내부 방어막으로 전면 차단됩니다.
 *     tags:
 *       - Cover Letter DB CRUD
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 수정할 자소서 문항 고유 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               sub_title: (수정) Kafka 도입을 통한 대규모 트래픽 분산 처리 경험
 *               content: 기존 Redis 캐싱에 더해 대용량 로그 수집 병목을 해결하고자 Kafka 메시지 큐를 추가 도입했습니다...
 *     responses:
 *       200:
 *         description: 자소서 데이터 안전 수정 완료
 *       404:
 *         description: 수정할 문항을 찾지 못함
 *
 *   delete:
 *     summary: 자기소개서 특정 문항 삭제 및 순서 재정렬
 *     description: 문항 고유 ID(itemId)를 기준으로 문항을 삭제합니다. 문항이 삭제된 후, 남은 문항들을 모아서 정렬한 뒤 1번부터 이빨이 빠지지 않도록 순서 번호(question_order)를 촘촘하게 재발급합니다.
 *     tags:
 *       - Cover Letter DB CRUD
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 삭제할 자소서 문항 고유 ID
 *     responses:
 *       200:
 *         description: 문항 삭제 및 남은 문항 순서 정렬 자동 재배치 완료
 *       404:
 *         description: 삭제할 문항이 존재하지 않음
 */

// 자소서 CRUD 라우팅 등록
router.get('/resumes/:resumeId/cover-letters', userController.getCoverLetters);
router.post('/resumes/:resumeId/cover-letters/items', userController.createCoverLetterItem);
router.put('/cover-letter-items/:itemId', userController.updateCoverLetterItem);
router.delete('/cover-letter-items/:itemId', userController.deleteCoverLetterItem);

/* ==========================================================
    [ 5. 포트폴리오 문서(portfolio_file) 라우팅 및 Swagger ]
   ========================================================== */

/**
 * @swagger
 * /api/member/resumes/{resumeId}/portfolio:
 *   get:
 *     summary: 특정 이력서의 단일 포트폴리오 문서 조회
 *     description: 이력서 번호(resumeId)에 첨부된 단일 포트폴리오 파일(PDF)의 정보를 조회합니다.
 *     tags:
 *       - Portfolio DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 조회할 이력서 고유 번호
 *     responses:
 *       200:
 *         description: 파일 조회 성공
 *       404:
 *         description: 등록된 포트폴리오가 없음
 *
 *   post:
 *     summary: 포트폴리오 문서 업로드 및 덮어쓰기
 *     description: 이력서에 포트폴리오 파일을 업로드합니다. 이미 업로드된 파일이 존재할 경우 기존 기록을 새 파일 정보 및 경로로 덮어쓰기합니다.
 *     tags:
 *       - Portfolio DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 파일을 첨부할 이력서 고유 번호
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               original_file_name: "내_멋진_포트폴리오_최종.pdf"
 *               file_extension: "pdf"
 *               file_size: 2048
 *     responses:
 *       200:
 *         description: 기존 파일이 존재하여 덮어쓰기 성공
 *       201:
 *         description: 기존 파일이 없어 새로 업로드 기록 생성 성공
 *       400:
 *         description: PDF 파일만 업로드 가능합니다.
 */

// 포트폴리오 파일 CRUD 라우팅
router.get('/resumes/:resumeId/portfolio', userController.getPortfolio);
router.post('/resumes/:resumeId/portfolio', userController.uploadPortfolio);

/* ==========================================================
   [ 6. 자격증(certificate) 라우팅 및 Swagger ]
   ========================================================== */

/**
 * @swagger
 * /api/member/resumes/{resumeId}/certificates/{certificateId}:
 *   get:
 *     summary: 특정 이력서의 자격증 목록 조회
 *     description: 이력서 번호(resumeId)에 등록된 모든 자격증(certificate) 데이터를 배열 형태로 조회합니다.
 *     tags:
 *       - Certificate DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 조회할 이력서 고유 번호
 *     responses:
 *       200:
 *         description: 자격증 목록 조회 성공
 *
 *   post:
 *     summary: 자격증 생성 (추가)
 *     description: 이력서에 새로운 자격증 정보를 추가합니다. 고유 시퀀스(ID)와 생성일자(created_at)가 자동으로 부여됩니다.
 *     tags:
 *       - Certificate DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 자격증을 추가할 이력서 고유 번호
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *           example:
 *             certificate_name: "정보보안기사"
 *             acquired_ym: "2026.04"
 *             issuer: "한국방송통신전파진흥원"
 *     responses:
 *       201:
 *         description: 자격증 추가 성공
 */

/**
 * @swagger
 * /api/member/resumes/{resumeId}/certificates/{certificateId}:
 *   put:
 *     summary: 자격증 수정
 *     description: 자격증 고유 번호(certificateId)를 기준으로 정보를 수정합니다. PK/FK는 수정할 수 없으며 updated_at이 자동 갱신됩니다.
 *     tags:
 *       - Certificate DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 이력서 고유 번호
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 수정할 자격증 고유 번호
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *           example:
 *             certificate_name: "정보보안기사 (수정됨)"
 *             acquired_ym: "2026.05"
 *             issuer: "한국방송통신전파진흥원"
 *     responses:
 *       200:
 *         description: 자격증 수정 성공
 *       404:
 *         description: 수정할 자격증을 찾지 못함
 *
 *   delete:
 *     summary: 자격증 삭제
 *     description: 자격증 고유 번호(certificateId)를 기준으로 데이터를 삭제합니다.
 *     tags:
 *       - Certificate DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 이력서 고유 번호
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 삭제할 자격증 고유 번호
 *     responses:
 *       200:
 *         description: 자격증 삭제 성공
 *       404:
 *         description: 삭제할 자격증을 찾지 못함
 */

// 자격증 CRUD 라우팅 등록
router.get('/resumes/:resumeId/certificates', userController.getCertificates);
router.post('/resumes/:resumeId/certificates', userController.createCertificate);
router.put('/resumes/:resumeId/certificates/:certificateId', userController.updateCertificate);
router.delete('/resumes/:resumeId/certificates/:certificateId', userController.deleteCertificate);

/* ==========================================================
    [ 7. 경력사항(career) 라우팅 및 Swagger ]
   ========================================================== */

/**
 * @swagger
 * /api/member/resumes/{resumeId}/careers:
 *   get:
 *     summary: 특정 이력서의 경력 목록 조회
 *     description: 이력서 번호(resumeId)에 등록된 모든 경력(career) 데이터를 배열 형태로 조회합니다.
 *     tags:
 *       - Career DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 조회할 이력서 고유 번호
 *     responses:
 *       200:
 *         description: 경력 목록 조회 성공
 *
 *   post:
 *     summary: 경력 생성 (추가)
 *     description: 이력서에 새로운 경력 정보를 추가합니다. 고유 시퀀스(ID)와 생성일자(created_at)가 자동으로 부여됩니다.
 *     tags:
 *       - Career DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 경력을 추가할 이력서 고유 번호
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *           example:
 *             company_name: "아티클루랩"
 *             department: "개발팀"
 *             position: "백엔드 인턴"
 *             start_ym: "2025-06"
 *             end_ym: "2025-12"
 *             main_achievement: "Redis 캐싱을 도입하여 조회 속도를 개선했습니다."
 *     responses:
 *       201:
 *         description: 경력 추가 성공
 */

/**
 * @swagger
 * /api/member/resumes/{resumeId}/careers/{careerId}:
 *   put:
 *     summary: 경력 수정
 *     description: 경력 고유 번호(careerId)를 기준으로 정보를 수정합니다. 데이터 보호를 위해 PK/FK는 수정 요청에서 제외되며, 수정일자(updated_at)가 갱신됩니다. 이중 검증(resumeId && careerId)을 수행합니다.
 *     tags:
 *       - Career DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 이력서 고유 번호
 *       - in: path
 *         name: careerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 수정할 경력 고유 번호
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *           example:
 *             position: "백엔드 정규직"
 *             end_ym: "2026-05"
 *     responses:
 *       200:
 *         description: 경력 수정 성공
 *       404:
 *         description: 수정할 경력을 찾지 못함
 *
 *   delete:
 *     summary: 경력 삭제
 *     description: 이력서 번호와 경력 고유 번호(careerId)를 이중 검증하여 데이터를 안전하게 삭제합니다.
 *     tags:
 *       - Career DB CRUD
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 이력서 고유 번호
 *       - in: path
 *         name: careerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 삭제할 경력 고유 번호
 *     responses:
 *       200:
 *         description: 경력 삭제 성공
 *       404:
 *         description: 삭제할 경력을 찾지 못함
 */

// 경력사항 CRUD 라우팅 등록
router.get('/resumes/:resumeId/careers', userController.getCareers);
router.post('/resumes/:resumeId/careers', userController.createCareer);
router.put('/resumes/:resumeId/careers/:careerId', userController.updateCareer);
router.delete('/resumes/:resumeId/careers/:careerId', userController.deleteCareer);

module.exports = router;