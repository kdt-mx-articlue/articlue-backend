# node:20-slim (Debian 기반)
FROM node:20-slim

WORKDIR /usr/src/app

# Oracle 연결은 node-oracledb Thin 모드를 사용합니다 (Oracle 12.1+ / XE 21c 대상).
# Instant Client가 필요 없으므로 ORACLE_CLIENT_LIB_DIR 는 비워 둡니다.
# Oracle 11g 등 Thick 모드가 꼭 필요하면 이미지 실행 시 Instant Client를 마운트하고
# ORACLE_CLIENT_LIB_DIR 를 지정하세요.

# 의존성 먼저 복사 (레이어 캐시 활용)
COPY package*.json ./
RUN npm ci --omit=dev

# 소스 복사
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

# 배포 환경 — npm start = node ./src/app.js
CMD ["npm", "start"]
