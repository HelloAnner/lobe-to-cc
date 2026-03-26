# Gateway runtime image
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY data/account-pool.example.toml ./data/account-pool.example.toml
COPY README.md ./README.md
COPY README.zh-CN.md ./README.zh-CN.md
COPY docs ./docs
COPY cc-topology-ascii.md ./cc-topology-ascii.md

EXPOSE 8787

CMD ["node", "src/gateway.mjs"]
