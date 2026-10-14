FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .
RUN mkdir -p private-documents && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["node", "index.js"]
