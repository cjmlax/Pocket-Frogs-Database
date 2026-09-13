# ── build stage ──
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build     # produces /app/dist

# ── runtime stage ──
FROM nginx:alpine
# SPA routing config
COPY nginx.conf /etc/nginx/conf.d/default.conf
# the built site
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80