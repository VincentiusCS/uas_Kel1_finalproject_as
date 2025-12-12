FROM node:18-alpine

# Install build & sqlite dependencies (better-sqlite3 needs build tools)
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Install dependencies first (better Docker cache)
COPY package*.json ./
RUN npm install --production

# Copy application source and configuration
COPY src ./src
COPY public ./public
COPY keycloak-config.json ./
COPY README.md ./

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Environment variables (can be overridden by docker-compose)
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/inventory.db

EXPOSE 3000

# Health check uses the /health endpoint we expose in server.js
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["npm", "start"]


