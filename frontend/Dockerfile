# Build stage: install the locked dependencies and build the app against the real backend (VITE_API=http).
FROM node:22.14-alpine3.21 AS build
WORKDIR /app

# Dependency files first, so this layer is cached until package-lock.json changes.
# --ignore-scripts skips postinstall (the iCloud node_modules link is macOS-only).
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build:app

# Runtime stage: static files behind nginx, running as a non-root user on port 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# The browser calls /api on this origin; nginx passes it to the backend. Set at `docker run` time.
ENV API_UPSTREAM=http://backend:8000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
