FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Scaffold React app with Vite
RUN npm install -g create-vite && \
    create-vite . --template react-ts && \
    npm install

# Copy custom config files (overwrite defaults if they exist)
COPY --chown=node:node nginx.conf ./nginx.conf
COPY --chown=node:node vite.config.ts ./vite.config.ts

# Build the app
RUN npm run build

FROM nginx:alpine
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
COPY --from=builder /usr/src/app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]