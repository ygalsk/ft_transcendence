FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Scaffold base app
RUN npm install -g create-vite && \
    create-vite temp --template react-ts && \
    mv temp/* . && \
    mv temp/.* . 2>/dev/null || true && \
    rm -rf temp && \
    npm install && \
    npm install react-router-dom && \
    npm install socket.io-client    

# Remove default App files
RUN rm -rf src/App.tsx src/App.css src/assets

# Copy OUR source code
COPY src/ ./src/
COPY vite.config.ts ./

# Debug: show what we have
RUN echo "=== Source structure ===" && \
    find src -type f && \
    echo "=== App.tsx ===" && \
    cat src/App.tsx && \
    echo "=== Routes ===" && \
    cat src/routes/index.tsx

# Build
RUN npm run build

# Show what was built
RUN echo "=== Built files ===" && \
    ls -la dist/ && \
    echo "=== index.html ===" && \
    cat dist/index.html


FROM node:24-alpine
WORKDIR /usr/src/app



COPY --from=builder /usr/src/app/dist ./dist
RUN npm install -g vite
EXPOSE 80
CMD ["vite", "preview", "--host", "0.0.0.0", "--port", "80", "--base", "/"]