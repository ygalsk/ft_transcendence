FROM node:24-alpine

RUN apk add --no-cache python3 make g++
WORKDIR /usr/src/app

COPY services/user/package*.json ./
RUN npm install

COPY shared ./shared
COPY services/user/tsconfig.json ./
COPY services/user/src ./src
COPY services/user/db ./db

RUN npm run build

USER node
EXPOSE 5000
CMD ["npm", "start"]
