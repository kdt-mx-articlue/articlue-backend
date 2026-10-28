# DB 마이그레이션

Oracle 스키마/데이터 변경은 이 폴더의 `migrations/` 에 **버전 번호가 붙은 SQL 파일**로 관리합니다.
실행기는 `scripts/migrate.js` 이며, 적용 이력은 DB의 `SCHEMA_MIGRATIONS` 테이블에 남습니다.

| 파일 | 내용 |
|------|------|
| `V001__create_schema.sql` | 초기 테이블 + 시퀀스 |
| `V002__seed_company_job_posting.sql` | 기업 276건 / 채용공고 484건 초기 데이터 |

## 명령어

```bash
npm run migrate                    # 미적용 마이그레이션 실행
npm run migrate:status             # 적용/미적용 목록
npm run migrate:create -- add_member_role   # 다음 번호 빈 파일 생성 (V003__add_member_role.sql)
npm run migrate:baseline -- 2      # 이미 스키마가 있는 DB: V002 까지 "적용됨"으로만 기록
```

필요한 환경변수: `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_HOST`, `ORACLE_PORT`(기본 1521), `ORACLE_SERVICE_NAME`(기본 xe)

Docker Compose 배포 환경에서는 `articlue-migrate` 컨테이너가 백엔드 기동 전에 자동으로 `up` 을 실행합니다.

```bash
docker compose run --rm articlue-migrate node ./scripts/migrate.js status
```

## 작성 규칙

- 파일명: `V<번호>__<설명>.sql` (번호는 정수, 순서대로 실행)
- **이미 적용된 파일은 수정 금지** — checksum 이 달라지면 실행이 중단됩니다. 변경은 새 파일로 추가하세요.
- 일반 구문은 `;` 로 끝냅니다. PL/SQL 블록(`BEGIN`, `DECLARE`, `CREATE OR REPLACE PROCEDURE` 등)은 SQL*Plus 처럼 단독 줄의 `/` 로 끝냅니다.
- `&` 치환 변수 처리는 하지 않으므로 `SET DEFINE OFF` 가 필요 없습니다. (SQL*Plus 전용 `SET ...` 명령은 쓰지 마세요)
- 세션은 `NLS_LENGTH_SEMANTICS = CHAR` 로 실행되어 `VARCHAR2(100)` 은 100 **문자**입니다.
- Oracle DDL 은 자동 커밋되어 롤백되지 않습니다. 실패 시 로그에 나온 구문 번호를 보고 수동 정리 후 다시 실행하세요. 실패한 파일은 이력에 기록되지 않습니다.
