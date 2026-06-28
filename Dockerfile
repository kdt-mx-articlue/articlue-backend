# node:20-slim (Debian 기반 — Oracle Instant Client는 glibc 필요, Alpine 불가)
FROM node:20-slim

WORKDIR /usr/src/app

# Oracle Instant Client 의존성
RUN apt-get update && apt-get install -y --no-install-recommends \
    libaio1 \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Oracle Instant Client 21.12 Basic Lite (amd64)
# Oracle 11g 서버에 thick mode로 연결
RUN wget -q https://download.oracle.com/otn_software/linux/instantclient/2112000/instantclient-basiclite-linux.x64-21.12.0.0.0dbru.zip \
      -O /tmp/ic.zip \
    && unzip -q /tmp/ic.zip -d /opt/oracle \
    && rm /tmp/ic.zip \
    && echo /opt/oracle/instantclient_21_12 > /etc/ld.so.conf.d/oracle-instantclient.conf \
    && ldconfig

ENV ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_21_12

# 의존성 먼저 복사 (레이어 캐시 활용)
COPY package*.json ./
RUN npm ci

# 소스 복사
COPY . .

EXPOSE 3000

# 배포 환경 — npm start = node ./src/app.js
CMD ["npm", "start"]
