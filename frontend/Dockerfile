FROM nginx:1.27-alpine
ENV GATEWAY_UPSTREAM=gateway:3000
COPY nginx/templates/default.conf.template /etc/nginx/templates/default.conf.template
COPY . /usr/share/nginx/html
