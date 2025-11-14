FROM node:24-alpine

RUN apk add --no-cache python3 make g++
WORKDIR /usr/src/app

COPY services/pong/package*.json ./
RUN npm install

COPY shared ./shared
COPY services/pong/tsconfig.json ./
COPY services/pong/src ./src
COPY services/pong/db ./db

RUN npm run build

EXPOSE 6061
CMD ["npm", "start"]
