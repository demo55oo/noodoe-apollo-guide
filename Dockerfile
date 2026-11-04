FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY runner.js /usr/share/nginx/html/runner.js
EXPOSE 80
