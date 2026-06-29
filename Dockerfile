# node:20-slim (Debian 기반 — Oracle Instant Client는 glibc 필요, Alpine 불가)
FROM node:20-slim

WORKDIR /usr/src/app

# Oracle Instant Client 의존성
RUN apt-get update && apt-get install -y --no-install-recommends \
    libaio1 \
    && rm -rf /var/lib/apt/lists/*

# Oracle Instant Client 11.2 Basic Lite (amd64)
# 빌드 전 instantclient_11_2/ 폴더를 articlue-backend/ 에 두어야 합니다.
COPY instantclient_11_2 /opt/oracle/instantclient_11_2
RUN ln -sf libclntsh.so.11.1 /opt/oracle/instantclient_11_2/libclntsh.so \
    && echo /opt/oracle/instantclient_11_2 > /etc/ld.so.conf.d/oracle-instantclient.conf \
    && ldconfig

ENV ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_11_2

# 의존성 먼저 복사 (레이어 캐시 활용)
COPY package*.json ./
RUN npm ci

# 소스 복사
COPY . .

EXPOSE 3000

# 배포 환경 — npm start = node ./src/app.js
CMD ["npm", "start"]
