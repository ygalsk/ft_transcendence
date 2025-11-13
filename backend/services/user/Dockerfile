FROM node:24-slim

WORKDIR /app

# Copy shared code
COPY shared ./shared

# Copy this service only
COPY services/user ./

# Install and build
RUN npm install
RUN npm rebuild better-sqlite3
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
