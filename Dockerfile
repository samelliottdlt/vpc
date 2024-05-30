FROM node:20-alpine

WORKDIR /app

# Copy the workspace root package.json and install dependencies
COPY package.json package-lock.json ./
COPY packages/**/* ./packages/
RUN npm ci

# Copy the service's source code
COPY services/${SERVICE} ./services/${SERVICE}

EXPOSE 3000
CMD ["npm", "start"]
