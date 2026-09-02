# Build the React frontend and serve the static bundle with Nginx.
FROM node:20-alpine AS build

WORKDIR /frontend
COPY package*.json ./
RUN npm ci
RUN npm audit --audit-level=high
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ARG VITE_PUBLIC_WEB_URL=""
ENV VITE_PUBLIC_WEB_URL=$VITE_PUBLIC_WEB_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
