FROM ghcr.io/solana-foundation/kora:latest

WORKDIR /app

COPY kora.toml .
COPY signers.toml .

EXPOSE 3000

# kora requires absolute path, global options before 'rpc', and the 'start' subcommand
CMD sh -c "/usr/local/bin/kora --rpc-url \"${SOLANA_RPC_URL}\" --config kora.toml rpc start --port \"${PORT:-3000}\" --signers-config signers.toml"
