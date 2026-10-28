/* ==========================================================
   V001 ARTICLUE 초기 스키마 (테이블 + 시퀀스)
   원본: articlue-frontend/articlue_ddl.sql (DROP 구문 제외)
   ========================================================== */

/* ----------------------------------------------------------
   3. CREATE TABLES  (FK 정순 — 부모 테이블 먼저)
   ---------------------------------------------------------- */

-- 기술스택분류
CREATE TABLE tech_category (
    tech_category_code  VARCHAR2(20)  NOT NULL,
    tech_category_name  VARCHAR2(100) NOT NULL,
    tech_name           VARCHAR2(100) NOT NULL,
    CONSTRAINT pk_tech_category PRIMARY KEY (tech_category_code),
    CONSTRAINT uk_tech_category_name UNIQUE (tech_name)
);

-- 회원
CREATE TABLE member (
    member_id   NUMBER        NOT NULL,
    login_id    VARCHAR2(50),
    password    VARCHAR2(255),
    email       VARCHAR2(100),
    nickname    VARCHAR2(50),
    user_type   VARCHAR2(20)  NOT NULL,
    create_at   DATE          NOT NULL,
    update_at   DATE          NOT NULL,
    CONSTRAINT pk_member PRIMARY KEY (member_id),
    CONSTRAINT uk_member_login_id UNIQUE (login_id),
    CONSTRAINT uk_member_email    UNIQUE (email)
);

-- 회원프로필
CREATE TABLE member_profile (
    profile_id          NUMBER        NOT NULL,
    member_id           NUMBER        NOT NULL,
    name                VARCHAR2(50),
    phone               VARCHAR2(255),
    birth_date          DATE,
    address             VARCHAR2(300),
    gender              VARCHAR2(20),
    military_status     VARCHAR2(50),
    profile_image_url   VARCHAR2(500),
    create_at           DATE          NOT NULL,
    update_at           DATE          NOT NULL,
    CONSTRAINT pk_member_profile PRIMARY KEY (profile_id),
    CONSTRAINT fk_member_profile_member FOREIGN KEY (member_id) REFERENCES member(member_id)
);

-- 소셜계정
CREATE TABLE social_account (
    social_account_id   NUMBER        NOT NULL,
    member_id           NUMBER        NOT NULL,
    provider            VARCHAR2(30)  NOT NULL,
    provider_user_id    VARCHAR2(200) NOT NULL,
    access_token        CLOB,
    refresh_token       CLOB,
    expires_at          DATE,
    last_refresh_at     DATE,
    connected_at        DATE          NOT NULL,
    CONSTRAINT pk_social_account PRIMARY KEY (social_account_id),
    CONSTRAINT fk_social_account_member FOREIGN KEY (member_id) REFERENCES member(member_id)
);

-- GitHub계정
CREATE TABLE github_account (
    github_account_id   NUMBER        NOT NULL,
    member_id           NUMBER        NOT NULL,
    github_user_id      NUMBER        NOT NULL,
    login               VARCHAR2(100) NOT NULL,
    html_url            VARCHAR2(500) NOT NULL,
    access_token        CLOB,
    refresh_token       CLOB,
    expires_at          DATE,
    connected_at        DATE          NOT NULL,
    last_sync_at        DATE,
    CONSTRAINT pk_github_account PRIMARY KEY (github_account_id),
    CONSTRAINT fk_github_account_member FOREIGN KEY (member_id) REFERENCES member(member_id)
);

-- GitHub저장소
CREATE TABLE github_repository (
    github_repository_id        NUMBER        NOT NULL,
    github_account_id           NUMBER        NOT NULL,
    github_repo_external_id     NUMBER        NOT NULL,
    name                        VARCHAR2(200) NOT NULL,
    full_name                   VARCHAR2(300) NOT NULL,
    html_url                    VARCHAR2(500) NOT NULL,
    description                 CLOB,
    fork                        CHAR(1)       NOT NULL,
    archived                    CHAR(1)       NOT NULL,
    default_branch              VARCHAR2(100),
    created_at                  DATE,
    updated_at                  DATE,
    last_sync_at                DATE,
    CONSTRAINT pk_github_repository PRIMARY KEY (github_repository_id),
    CONSTRAINT uk_github_repo_external UNIQUE (github_repo_external_id),
    CONSTRAINT fk_github_repo_account FOREIGN KEY (github_account_id) REFERENCES github_account(github_account_id)
);

-- GitHub기술스택
CREATE TABLE github_repo_tech_stack (
    github_repo_tech_id     NUMBER        NOT NULL,
    github_repository_id    NUMBER        NOT NULL,
    tech_category_code      VARCHAR2(20)  NOT NULL,
    language_name           VARCHAR2(100) NOT NULL,
    usage_ratio             NUMBER(5,2),
    collected_at            DATE          NOT NULL,
    CONSTRAINT pk_github_repo_tech PRIMARY KEY (github_repo_tech_id),
    CONSTRAINT fk_github_repo_tech_repo FOREIGN KEY (github_repository_id) REFERENCES github_repository(github_repository_id),
    CONSTRAINT fk_github_repo_tech_cat  FOREIGN KEY (tech_category_code)   REFERENCES tech_category(tech_category_code)
);

-- GitHub커밋일별통계
CREATE TABLE github_repo_commit_daily (
    github_repo_commit_daily_id NUMBER  NOT NULL,
    github_repository_id        NUMBER  NOT NULL,
    commit_date                 DATE    NOT NULL,
    commit_count                NUMBER  NOT NULL,
    collected_at                DATE    NOT NULL,
    CONSTRAINT pk_github_commit_daily PRIMARY KEY (github_repo_commit_daily_id),
    CONSTRAINT fk_github_commit_repo FOREIGN KEY (github_repository_id) REFERENCES github_repository(github_repository_id)
);

-- 기업
CREATE TABLE company (
    company_id          NUMBER        NOT NULL,
    company_name        VARCHAR2(150) NOT NULL,
    industry_category   VARCHAR2(100),
    company_size        VARCHAR2(100),
    company_description CLOB,
    homepage_url        VARCHAR2(500),
    average_salary      NUMBER,
    welfare_info        CLOB,
    work_location       VARCHAR2(200),
    CONSTRAINT pk_company      PRIMARY KEY (company_id),
    CONSTRAINT uk_company_name UNIQUE (company_name)
);

-- 채용공고
CREATE TABLE job_posting (
    job_posting_id          NUMBER        NOT NULL,
    company_id              NUMBER        NOT NULL,
    posting_title           VARCHAR2(300) NOT NULL,
    job_name                VARCHAR2(100) NOT NULL,
    career_condition        VARCHAR2(100),
    employment_type         VARCHAR2(100),
    work_location           VARCHAR2(200),
    main_task               CLOB,
    qualification           CLOB,
    preferred_qualification CLOB,
    talent_profile          CLOB,
    original_url            VARCHAR2(1000),
    deadline_date           DATE,
    posting_status          VARCHAR2(20),
    CONSTRAINT pk_job_posting PRIMARY KEY (job_posting_id),
    CONSTRAINT fk_job_posting_company FOREIGN KEY (company_id) REFERENCES company(company_id)
);

-- 공고기술스택
CREATE TABLE job_posting_tech_stack (
    posting_tech_id     NUMBER        NOT NULL,
    job_posting_id      NUMBER        NOT NULL,
    tech_category_code  VARCHAR2(20)  NOT NULL,
    tech_name           VARCHAR2(100) NOT NULL,
    tech_category       VARCHAR2(100),
    requirement_type    VARCHAR2(20)  NOT NULL,
    importance          NUMBER,
    required_level      VARCHAR2(50),
    CONSTRAINT pk_job_posting_tech PRIMARY KEY (posting_tech_id),
    CONSTRAINT fk_job_tech_posting FOREIGN KEY (job_posting_id)     REFERENCES job_posting(job_posting_id),
    CONSTRAINT fk_job_tech_cat     FOREIGN KEY (tech_category_code) REFERENCES tech_category(tech_category_code)
);

-- 이력서
CREATE TABLE resume (
    resume_id       NUMBER        NOT NULL,
    member_id       NUMBER        NOT NULL,
    resume_title    VARCHAR2(200) NOT NULL,
    desired_job     VARCHAR2(100) NOT NULL,
    introduction    VARCHAR2(500) NOT NULL,
    resume_status   VARCHAR2(20)  NOT NULL,
    representative_yn CHAR(1)     NOT NULL,
    create_at       DATE          NOT NULL,
    update_at       DATE          NOT NULL,
    CONSTRAINT pk_resume PRIMARY KEY (resume_id),
    CONSTRAINT fk_resume_member FOREIGN KEY (member_id) REFERENCES member(member_id)
);

-- 이력서희망지역
CREATE TABLE resume_desired_location (
    desired_location_id NUMBER        NOT NULL,
    resume_id           NUMBER        NOT NULL,
    location_name       VARCHAR2(100) NOT NULL,
    CONSTRAINT pk_desired_location PRIMARY KEY (desired_location_id),
    CONSTRAINT fk_desired_location_resume FOREIGN KEY (resume_id) REFERENCES resume(resume_id)
);

-- 학력
CREATE TABLE education (
    education_id        NUMBER        NOT NULL,
    resume_id           NUMBER        NOT NULL,
    school_type         VARCHAR2(30)  NOT NULL,
    school_name         VARCHAR2(100) NOT NULL,
    major               VARCHAR2(100),
    graduation_status   VARCHAR2(30),
    gpa                 NUMBER(3,2),
    start_ym            VARCHAR2(7),
    end_ym              VARCHAR2(7),
    CONSTRAINT pk_education PRIMARY KEY (education_id),
    CONSTRAINT fk_education_resume FOREIGN KEY (resume_id) REFERENCES resume(resume_id)
);

-- 활동경험
CREATE TABLE experience (
    experience_id   NUMBER        NOT NULL,
    resume_id       NUMBER        NOT NULL,
    experience_type VARCHAR2(30)  NOT NULL,
    experience_name VARCHAR2(200) NOT NULL,
    context         CLOB,
    start_ym        VARCHAR2(7),
    end_ym          VARCHAR2(7),
    CONSTRAINT pk_experience PRIMARY KEY (experience_id),
    CONSTRAINT fk_experience_resume FOREIGN KEY (resume_id) REFERENCES resume(resume_id)
);

-- 경력사항
CREATE TABLE career (
    career_id           NUMBER        NOT NULL,
    resume_id           NUMBER        NOT NULL,
    company_name        VARCHAR2(150) NOT NULL,
    department          VARCHAR2(100),
    position            VARCHAR2(100),
    start_ym            VARCHAR2(7),
    end_ym              VARCHAR2(7),
    main_achievement    CLOB,
    CONSTRAINT pk_career PRIMARY KEY (career_id),
    CONSTRAINT fk_career_resume FOREIGN KEY (resume_id) REFERENCES resume(resume_id)
);

-- 자기소개서
CREATE TABLE cover_letter (
    cover_letter_id NUMBER  NOT NULL,
    resume_id       NUMBER  NOT NULL,
    create_at       DATE    NOT NULL,
    update_at       DATE    NOT NULL,
    CONSTRAINT pk_cover_letter PRIMARY KEY (cover_letter_id),
    CONSTRAINT fk_cover_letter_resume FOREIGN KEY (resume_id) REFERENCES resume(resume_id)
);

-- 자기소개서문항
CREATE TABLE cover_letter_item (
    cover_letter_item_id    NUMBER        NOT NULL,
    cover_letter_id         NUMBER        NOT NULL,
    question_order          NUMBER        NOT NULL,
    sub_title               VARCHAR2(200) NOT NULL,
    content                 CLOB          NOT NULL,
    create_at               DATE          NOT NULL,
    update_at               DATE          NOT NULL,
    CONSTRAINT pk_cover_letter_item PRIMARY KEY (cover_letter_item_id),
    CONSTRAINT fk_cover_letter_item_cl FOREIGN KEY (cover_letter_id) REFERENCES cover_letter(cover_letter_id)
);

-- 포트폴리오문서
CREATE TABLE portfolio_file (
    portfolio_id        NUMBER        NOT NULL,
    resume_id           NUMBER        NOT NULL,
    original_file_name  VARCHAR2(255) NOT NULL,
    stored_file_name    VARCHAR2(255) NOT NULL,
    file_extension      VARCHAR2(10)  NOT NULL,
    file_path           VARCHAR2(1000) NOT NULL,
    file_size           NUMBER        NOT NULL,
    upload_at           DATE          NOT NULL,
    file_status         VARCHAR2(20)  NOT NULL,
    CONSTRAINT pk_portfolio_file PRIMARY KEY (portfolio_id),
    CONSTRAINT fk_portfolio_file_resume FOREIGN KEY (resume_id) REFERENCES resume(resume_id)
);

-- 자격증
CREATE TABLE certificate (
    certificate_id      NUMBER        NOT NULL,
    resume_id           NUMBER        NOT NULL,
    certificate_name    VARCHAR2(150) NOT NULL,
    acquired_ym         VARCHAR2(7),
    issuer              VARCHAR2(150),
    CONSTRAINT pk_certificate PRIMARY KEY (certificate_id),
    CONSTRAINT fk_certificate_resume FOREIGN KEY (resume_id) REFERENCES resume(resume_id)
);

-- 이력서기술스택
CREATE TABLE resume_tech_stack (
    resume_tech_id      NUMBER       NOT NULL,
    resume_id           NUMBER       NOT NULL,
    tech_category_code  VARCHAR2(20) NOT NULL,
    create_at           DATE         NOT NULL,
    CONSTRAINT pk_resume_tech PRIMARY KEY (resume_tech_id),
    CONSTRAINT fk_resume_tech_resume FOREIGN KEY (resume_id)          REFERENCES resume(resume_id),
    CONSTRAINT fk_resume_tech_cat    FOREIGN KEY (tech_category_code) REFERENCES tech_category(tech_category_code)
);

-- 이력서GitHub저장소
CREATE TABLE resume_github_repository (
    resume_github_repo_id   NUMBER  NOT NULL,
    resume_id               NUMBER  NOT NULL,
    github_repository_id    NUMBER  NOT NULL,
    display_order           NUMBER,
    project_description     CLOB,
    created_date            DATE    NOT NULL,
    CONSTRAINT pk_resume_github_repo PRIMARY KEY (resume_github_repo_id),
    CONSTRAINT fk_resume_github_resume FOREIGN KEY (resume_id)            REFERENCES resume(resume_id),
    CONSTRAINT fk_resume_github_repo   FOREIGN KEY (github_repository_id) REFERENCES github_repository(github_repository_id)
);

-- 기업추천결과
CREATE TABLE company_recommendation (
    recommendation_id   NUMBER        NOT NULL,
    resume_id           NUMBER        NOT NULL,
    job_posting_id      NUMBER        NOT NULL,
    analysis_stage      VARCHAR2(20)  NOT NULL,
    overall_score       NUMBER(5,2)   NOT NULL,
    latest_interview_id NUMBER,
    recommend_rank      NUMBER,
    recommended_date    DATE          NOT NULL,
    CONSTRAINT pk_company_recommendation PRIMARY KEY (recommendation_id),
    CONSTRAINT fk_rec_resume      FOREIGN KEY (resume_id)      REFERENCES resume(resume_id),
    CONSTRAINT fk_rec_job_posting FOREIGN KEY (job_posting_id) REFERENCES job_posting(job_posting_id)
);

-- 기업추천지표상세
CREATE TABLE recommendation_metric_detail (
    recommendation_metric_id    NUMBER       NOT NULL,
    recommendation_id           NUMBER       NOT NULL,
    metric_type                 VARCHAR2(50) NOT NULL,
    score                       NUMBER(5,2)  NOT NULL,
    reason_text                 CLOB         NOT NULL,
    CONSTRAINT pk_rec_metric PRIMARY KEY (recommendation_metric_id),
    CONSTRAINT fk_rec_metric_rec FOREIGN KEY (recommendation_id) REFERENCES company_recommendation(recommendation_id)
);

-- 기업추천기술
CREATE TABLE recommendation_skill (
    recommendation_skill_id NUMBER        NOT NULL,
    recommendation_id       NUMBER        NOT NULL,
    tech_category_code      VARCHAR2(100) NOT NULL,
    skill_match_yn          VARCHAR2(20)  NOT NULL,
    CONSTRAINT pk_rec_skill PRIMARY KEY (recommendation_skill_id),
    CONSTRAINT fk_rec_skill_rec FOREIGN KEY (recommendation_id) REFERENCES company_recommendation(recommendation_id)
);

-- 기업추천결과액션 (1차/2차 구분: type = 'RESUME' | 'FINAL')
CREATE TABLE recommendation_action (
    recommendation_action_id    NUMBER        NOT NULL,
    recommendation_id           NUMBER        NOT NULL,
    category                    VARCHAR2(50)  NOT NULL,
    title                       VARCHAR2(300) NOT NULL,
    description                 CLOB          NOT NULL,
    type                        VARCHAR2(20)  NOT NULL,
    priority                    NUMBER        NOT NULL,
    CONSTRAINT pk_rec_action PRIMARY KEY (recommendation_action_id),
    CONSTRAINT fk_rec_action_rec FOREIGN KEY (recommendation_id) REFERENCES company_recommendation(recommendation_id)
);

-- 맞춤형생성문서
CREATE TABLE generated_document (
    generated_document_id   NUMBER        NOT NULL,
    resume_id               NUMBER        NOT NULL,
    job_posting_id          NUMBER        NOT NULL,
    document_type           VARCHAR2(30)  NOT NULL,
    document_title          VARCHAR2(300) NOT NULL,
    document_content        CLOB          NOT NULL,
    created_date            DATE          NOT NULL,
    save_status             VARCHAR2(20)  NOT NULL,
    CONSTRAINT pk_generated_document PRIMARY KEY (generated_document_id),
    CONSTRAINT fk_gen_doc_resume      FOREIGN KEY (resume_id)      REFERENCES resume(resume_id),
    CONSTRAINT fk_gen_doc_job_posting FOREIGN KEY (job_posting_id) REFERENCES job_posting(job_posting_id)
);

-- 면접세션
CREATE TABLE interview_session (
    interview_session_id    NUMBER        NOT NULL,
    resume_id               NUMBER        NOT NULL,
    job_posting_id          NUMBER        NOT NULL,
    interview_title         VARCHAR2(200),
    interview_type          VARCHAR2(30)  NOT NULL,
    interview_format        VARCHAR2(30)  NOT NULL,
    attempt_no              NUMBER,
    apply_industry          VARCHAR2(100),
    apply_job               VARCHAR2(100),
    interview_level         VARCHAR2(20)  NOT NULL,
    start_time              DATE          NOT NULL,
    end_time                DATE,
    session_status          VARCHAR2(20),
    total_question_count    NUMBER        NOT NULL,
    total_answer_count      NUMBER        NOT NULL,
    CONSTRAINT pk_interview_session PRIMARY KEY (interview_session_id),
    CONSTRAINT fk_interview_session_resume      FOREIGN KEY (resume_id)      REFERENCES resume(resume_id),
    CONSTRAINT fk_interview_session_job_posting FOREIGN KEY (job_posting_id) REFERENCES job_posting(job_posting_id)
);

-- 면접질문답변
CREATE TABLE interview_qa (
    interview_qa_id         NUMBER       NOT NULL,
    interview_session_id    NUMBER       NOT NULL,
    parent_qa_id            NUMBER,
    question_order          NUMBER       NOT NULL,
    question_type           VARCHAR2(30) NOT NULL,
    interviewer_role        VARCHAR2(100),
    question_content        CLOB         NOT NULL,
    answer_content          CLOB,
    follow_up_yn            CHAR(1)      NOT NULL,
    question_created_at     DATE         NOT NULL,
    answered_at             DATE,
    CONSTRAINT pk_interview_qa PRIMARY KEY (interview_qa_id),
    CONSTRAINT fk_interview_qa_session FOREIGN KEY (interview_session_id) REFERENCES interview_session(interview_session_id),
    CONSTRAINT fk_interview_qa_parent  FOREIGN KEY (parent_qa_id)         REFERENCES interview_qa(interview_qa_id)
);

-- 면접분석리포트
CREATE TABLE interview_report (
    interview_report_id         NUMBER      NOT NULL,
    interview_session_id        NUMBER      NOT NULL,
    logic_score                 NUMBER(5,2),
    tech_understanding_score    NUMBER(5,2),
    business_link_score         NUMBER(5,2),
    evidence_score              NUMBER(5,2),
    job_fit_score               NUMBER(5,2),
    total_score                 NUMBER(5,2),
    feedback_content            CLOB,
    feedback_type               VARCHAR2(50),
    display_order               NUMBER      NOT NULL,
    created_date                DATE        NOT NULL,
    CONSTRAINT pk_interview_report PRIMARY KEY (interview_report_id),
    CONSTRAINT fk_interview_report_session FOREIGN KEY (interview_session_id) REFERENCES interview_session(interview_session_id)
);

-- 포트폴리오진단결과
CREATE TABLE portfolio_diagnosis (
    diagnosis_id                    NUMBER  NOT NULL,
    resume_id                       NUMBER  NOT NULL,
    job_posting_id                  NUMBER  NOT NULL,
    diagnosis_summary               CLOB,
    tech_stack_weakness             CLOB,
    project_experience_weakness     CLOB,
    business_result_weakness        CLOB,
    domain_understanding_weakness   CLOB,
    improvement_priority            VARCHAR2(100),
    diagnosis_date                  DATE,
    CONSTRAINT pk_portfolio_diagnosis PRIMARY KEY (diagnosis_id),
    CONSTRAINT fk_portfolio_diag_resume      FOREIGN KEY (resume_id)      REFERENCES resume(resume_id),
    CONSTRAINT fk_portfolio_diag_job_posting FOREIGN KEY (job_posting_id) REFERENCES job_posting(job_posting_id)
);

-- 액션플랜 (상세 학습 계획, diagnosis 연결)
CREATE TABLE action_plan (
    action_plan_id          NUMBER        NOT NULL,
    diagnosis_id            NUMBER        NOT NULL,
    action_plan_title       VARCHAR2(300) NOT NULL,
    action_plan_summary     CLOB,
    recommended_learning    CLOB,
    recommended_content_url CLOB,
    priority                NUMBER,
    expected_period         VARCHAR2(100),
    created_date            DATE          NOT NULL,
    CONSTRAINT pk_action_plan PRIMARY KEY (action_plan_id),
    CONSTRAINT fk_action_plan_diagnosis FOREIGN KEY (diagnosis_id) REFERENCES portfolio_diagnosis(diagnosis_id)
);

/* ----------------------------------------------------------
   4. CREATE SEQUENCES
   ---------------------------------------------------------- */
CREATE SEQUENCE SEQ_MEMBER                   START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_MEMBER_PROFILE           START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_SOCIAL_ACCOUNT           START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_GITHUB_ACCOUNT           START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_GITHUB_REPOSITORY        START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_GITHUB_REPO_TECH_STACK   START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_GITHUB_REPO_COMMIT_DAILY START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_RESUME_GITHUB_REPOSITORY START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_RESUME                   START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_RESUME_DESIRED_LOCATION  START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_EDUCATION                START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_EXPERIENCE               START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_CAREER                   START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_CERTIFICATE              START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_COVER_LETTER             START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_COVER_LETTER_ITEM        START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_PORTFOLIO_FILE           START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_RESUME_TECH_STACK        START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_COMPANY_RECOMMENDATION   START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_RECOMMENDATION_METRIC    START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_RECOMMENDATION_SKILL     START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_RECOMMENDATION_ACTION    START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_GENERATED_DOCUMENT       START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_INTERVIEW_SESSION        START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_INTERVIEW_QA             START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_INTERVIEW_REPORT         START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_PORTFOLIO_DIAGNOSIS      START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_ACTION_PLAN              START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

COMMIT;
