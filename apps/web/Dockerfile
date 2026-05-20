FROM node:22-alpine AS build

ARG MOCKDOCK_VERSION=0.0.1

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .nvmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --filter @mockdock/web... --frozen-lockfile=false

COPY apps/web apps/web
COPY packages/shared packages/shared

RUN printf 'export const MOCKDOCK_VERSION = "%s";\n' "$MOCKDOCK_VERSION" > apps/web/src/app/core/app-version.ts \
  && pnpm --filter @mockdock/shared build \
  && pnpm --dir apps/web build

FROM nginx:1.27-alpine

ARG MOCKDOCK_VERSION=0.0.1

LABEL org.opencontainers.image.title="MockDock Web"
LABEL org.opencontainers.image.version="${MOCKDOCK_VERSION}"

ENV BACKEND_URL=http://server:52052
ENV MOCKDOCK_VERSION=${MOCKDOCK_VERSION}

COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
