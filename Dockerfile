FROM node:20-alpine
WORKDIR /usr/src/app

# 의존성 먼저 복사 (캐싱 효율화로 빌드 속도 향상)
COPY package*.json ./
RUN npm install

# 소스코드 전체 복사
COPY . .

EXPOSE 3000
# package.json에 "dev": "nodemon app.js" 형태의 스크립트가 있어야 합니다.
CMD ["npm", "run", "dev"]