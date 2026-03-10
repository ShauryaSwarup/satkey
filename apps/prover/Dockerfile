FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# System dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js + pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

# Install Noir
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
ENV PATH="/root/.nargo/bin:/root/.noir/bin:$PATH"
RUN noirup --version 1.0.0-beta.16

# Install Barretenberg
RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
ENV PATH="/root/.bb:/root/barretenberg:$PATH"
RUN bbup --version 3.0.0-nightly.20251104

# Workspace
WORKDIR /satkeyprover

# Copy entire monorepo
COPY . .

# Install all workspace dependencies
RUN pnpm install

# Build
RUN pnpm build

EXPOSE 3001

CMD ["pnpm", "--filter", "@satkey/prover", "start"]