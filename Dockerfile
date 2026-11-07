# syntax=docker/dockerfile:1

# --- Etapa 1: instalar dependencias del monorepo (workspaces) ---
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

# --- Etapa 2: build de packages/shared ---
FROM deps AS build-shared
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
RUN npm run build -w packages/shared

# --- Etapa 3: build de apps/web (Vite) ---
FROM build-shared AS build-web
WORKDIR /repo
COPY apps/web apps/web
RUN npm run build -w apps/web

# --- Etapa 4: build de apps/api ---
FROM build-shared AS build-api
WORKDIR /repo
COPY apps/api apps/api
RUN npm run build -w apps/api

# --- Etapa 5: runtime ---
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm install --omit=dev --workspace=@teampulse/shared --workspace=@teampulse/api

COPY --from=build-shared /repo/packages/shared/dist packages/shared/dist
COPY --from=build-api /repo/apps/api/dist apps/api/dist
COPY --from=build-api /repo/apps/api/src/db/migrations apps/api/dist/db/migrations
COPY --from=build-api /repo/apps/api/package.json apps/api/package.json
COPY --from=build-web /repo/apps/web/dist apps/web/dist

WORKDIR /repo/apps/api
EXPOSE 8092

CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
