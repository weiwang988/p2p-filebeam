FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci
COPY server/ ./server/
WORKDIR /app/server
EXPOSE 7766
CMD ["npx", "tsx", "src/index.ts"]
