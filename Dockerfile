# Tahap 1: Siapkan Bahan (Base Image Ringan)
FROM node:18-alpine AS base

# Tahap 2: Install Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Install paket (ci lebih cepat & stabil daripada install biasa)
RUN npm ci

# Tahap 3: Memasak (Build)
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Matikan telemetri Next.js (biar privasi terjaga & hemat kuota)
ENV NEXT_TELEMETRY_DISABLED 1

# Mulai Build Next.js
RUN npm run build

# Tahap 4: Menyajikan (Runner - Khusus Production)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy hasil build standalone (Hanya file penting yang diambil)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]