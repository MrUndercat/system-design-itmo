FROM node:20-alpine

WORKDIR /app

RUN npm install -g serve@14.2.4

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["serve", ".", "-l", "8080", "--no-clipboard"]
