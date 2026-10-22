# Build stage: install everything and bundle the server.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Run stage: production dependencies and the bundle only. Cloud Run sets PORT.
FROM node:22-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production ASSETS_DIR=/app/dist/assets
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/main.js"]
