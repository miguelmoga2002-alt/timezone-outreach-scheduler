# Runs the demo on fictional data. No dependencies, no credentials.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY demo ./demo
COPY test ./test
CMD ["node", "demo/run.mjs"]
