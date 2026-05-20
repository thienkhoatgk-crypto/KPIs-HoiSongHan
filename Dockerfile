# --- LỚP 1: BIÊN DỊCH FRONTEND VÀ XÁO TRỘN CODE ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- LỚP 2: KHỞI CHẠY MÁY CHỦ PRODUCTION EXPRESS ---
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
# Cài đặt công cụ tsx để chạy server backend thô mượt mà
RUN npm install -g tsx

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

EXPOSE 3000
# Lệnh khởi chạy chính thức máy chủ Node Express kiêm phân phối web tĩnh
CMD ["tsx", "server.ts"]