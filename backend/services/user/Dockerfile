FROM node:24-alpine

RUN apk add --no-cache python3 make g++
WORKDIR /usr/src/app

COPY services/user/package*.json ./
RUN npm install

COPY shared ./shared
COPY services/user/tsconfig.json ./
COPY services/user/src ./src
COPY services/user/db ./db
COPY services/user/assets ./assets

RUN npm run build

# Create avatars directory and copy default avatar there
RUN mkdir -p /usr/src/app/data/avatars

# Copy default avatar to both locations
RUN cp -r ./assets/* /usr/src/app/data/avatars/ || true

EXPOSE 5000
CMD ["npm", "start"]
