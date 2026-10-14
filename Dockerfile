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
# The CSP's connect-src: exactly the API origins the bundle was built for.
COPY nginx.conf /tmp/nginx.conf
RUN node -e '\
  const defaults = { AUTH: 4001, PRODUCT: 4002, INVENTORY: 4003, ORDER: 4004, PAYMENT: 4005, NOTIFICATION: 4006, SAGA: 4007 }; \
  const origins = [...new Set(Object.entries(defaults).map(([name, port]) => new URL(process.env[`VITE_${name}_API_URL`] || `http://localhost:${port}`).origin))]; \
  const fs = require("fs"); \
  fs.writeFileSync("/tmp/nginx.conf", fs.readFileSync("/tmp/nginx.conf", "utf8").replaceAll("__CONNECT_SRC__", origins.join(" ")));'

# ---- runtime: static files on unprivileged nginx (port 8080, non-root) ----
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY --from=build /tmp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
