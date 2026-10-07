# NestJS API — production image.
#
# Debian slim rather than Alpine: sharp, bcrypt and the ffmpeg binary all ship
# prebuilt for glibc, so nothing has to be compiled on musl at deploy time.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM deps AS build
COPY . .
# The plan catalogue seed is compiled too: the runtime image has no ts-node.
RUN npx prisma generate && npm run build \
  && npx tsc prisma/seed-plans.ts --outDir dist/prisma --module commonjs --target es2021 --esModuleInterop --skipLibCheck

# Database migrations. Keeps the dev dependencies, where the Prisma CLI lives;
# run as the "migrate" service of deploy/docker-compose.prod.yml.
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS prod-deps
RUN npm prune --omit=dev --legacy-peer-deps

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# openssl: Prisma's query engine links against it. ca-certificates: outbound HTTPS to the AI providers.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
# Uploaded and generated files. Mounted as a volume in production so they
# survive a redeploy.
RUN mkdir -p storage/uploads && chown -R node:node /app
USER node
EXPOSE 4000
# Migrations run in the "migrate" stage above: this image has only production
# dependencies, and `npx prisma` here would download an arbitrary Prisma
# version at every start.
CMD ["node", "--no-deprecation", "dist/main"]
