FROM node:22-alpine AS base

WORKDIR /usr/src/app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
COPY lib ./lib
RUN npm install

FROM base AS production

ENV NODE_PATH=./build
ENV NODE_ENV=production
RUN npm run build

EXPOSE $PORT

ENTRYPOINT [ "node", "build/main.js" ]
