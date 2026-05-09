FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci
COPY client/ ./client/
RUN npm -w client run build:prod

FROM nginx:alpine
COPY --from=build /app/client/dist /usr/share/nginx/html/p2p
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
