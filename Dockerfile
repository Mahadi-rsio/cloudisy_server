# ---- deps (install with dev deps for building) ----
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json  ./
RUN npm install

# ---- builder (compile TS) ----
FROM node:20-alpine AS builder
WORKDIR /app

# reuse node_modules with dev deps from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json

COPY . .

RUN npm run build

# ---- runner (prod deps only) ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

# install ONLY production dependencies
RUN npm install --omit=dev

# only bring compiled output
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/src/server.js"]
