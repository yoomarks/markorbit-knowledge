FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY=1 \
    MARKORBIT_CRAWL4AI_SCRIPT=/app/workers/crawl4ai/acquire.py

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      dumb-init \
      python3 \
      python3-pip \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN corepack enable \
    && corepack prepare pnpm@11.13.0 --activate \
    && pnpm install --frozen-lockfile

RUN python3 -m venv /opt/markorbit-venv \
    && /opt/markorbit-venv/bin/pip install --no-cache-dir -r workers/crawl4ai/requirements.txt \
    && PATH="/opt/markorbit-venv/bin:${PATH}" crawl4ai-setup \
    && chmod -R a+rX /ms-playwright /opt/markorbit-venv

ENV PATH="/opt/markorbit-venv/bin:${PATH}" \
    NODE_ENV=production

USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["pnpm", "--filter", "@markorbit/worker", "start"]
