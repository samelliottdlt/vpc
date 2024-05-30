FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages ./packages
COPY turbo.json ./
RUN npm ci

EXPOSE 3000
CMD ["npm", "start"]
