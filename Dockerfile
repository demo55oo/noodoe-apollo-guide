FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY index.html ./
COPY runner.js ./
COPY apollo ./apollo
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
