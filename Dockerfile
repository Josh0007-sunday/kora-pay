FROM ghcr.io/solana-foundation/kora:latest

WORKDIR /app

COPY kora.toml .
COPY signers.toml .

# Injected at runtime by pxxl — do NOT hardcode here
ENV PORT=3000
ENV KORA_PRIVATE_KEY=""
ENV SOLANA_RPC_URL=""
EXPOSE 3000

# kora requires absolute path, global options before 'rpc', and the 'start' subcommand
CMD sh -c "/usr/local/bin/kora --rpc-url \"${SOLANA_RPC_URL}\" --config kora.toml rpc start --port \"${PORT}\" --signers-config signers.toml"
