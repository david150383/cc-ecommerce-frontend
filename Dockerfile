# syntax=docker/dockerfile:1

# ---- build: VITE_* values are inlined into the bundle at build time ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_AUTH_API_URL
ARG VITE_PRODUCT_API_URL
ARG VITE_INVENTORY_API_URL
ARG VITE_ORDER_API_URL
ARG VITE_PAYMENT_API_URL
ARG VITE_NOTIFICATION_API_URL
ARG VITE_SAGA_API_URL
RUN npm run build

# ---- runtime: static files on unprivileged nginx (port 8080, non-root) ----
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
