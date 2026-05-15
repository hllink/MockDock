FROM node:22-alpine

ARG MOCKDOCK_VERSION=0.0.1

LABEL org.opencontainers.image.title="MockDock Server"
LABEL org.opencontainers.image.version="${MOCKDOCK_VERSION}"

WORKDIR /app
RUN corepack enable

ENV MOCKDOCK_VERSION=${MOCKDOCK_VERSION}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .nvmrc ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/route-inference/package.json packages/route-inference/package.json

RUN pnpm install --frozen-lockfile=false

COPY apps/server apps/server
COPY packages/shared packages/shared
COPY packages/route-inference packages/route-inference

RUN pnpm --filter @mockdock/shared build \
  && pnpm --filter @mockdock/route-inference build \
  && pnpm --filter @mockdock/server build

ENV MOCKDOCK_DATABASE_PATH=/app/data/mockdock.sqlite

EXPOSE 52052

CMD ["node", "apps/server/dist/src/index.js"]
