FROM rust:1.80-slim AS builder

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN cargo install kora-cli --locked

# ──────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/cargo/bin/kora /usr/local/bin/kora

WORKDIR /app

COPY kora.toml .
COPY signers.toml .

# Injected at runtime by pxxl — do NOT hardcode here
ENV PORT=3000
ENV KORA_PRIVATE_KEY=""
ENV SOLANA_RPC_URL=""
EXPOSE 3000

# kora rpc reads KORA_PRIVATE_KEY + SOLANA_RPC_URL from env, config from disk
CMD sh -c "kora rpc \
     --port ${PORT} \
     --config kora.toml \
     --signers signers.toml \
     --rpc-url ${SOLANA_RPC_URL}"
