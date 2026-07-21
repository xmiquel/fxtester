FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . ./
CMD ["sh", "-c", "test -s /app/index.html && exec npm run dev -- --host 0.0.0.0"]
