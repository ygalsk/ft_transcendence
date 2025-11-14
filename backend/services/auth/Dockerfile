FROM node:24-alpine

RUN apk add --no-cache python3 make g++
WORKDIR /usr/src/app

COPY services/auth/package*.json ./
RUN npm install

COPY shared ./shared
COPY services/auth/tsconfig.json ./
COPY services/auth/src ./src
COPY services/auth/db ./db

RUN npm run build

EXPOSE 4000
CMD ["npm", "start"]
