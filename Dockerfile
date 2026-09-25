FROM ghcr.io/solana-foundation/kora:latest

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
