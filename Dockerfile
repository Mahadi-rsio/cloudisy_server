FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Build TypeScript
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/src/index.js"]
