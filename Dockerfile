FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/root/.local/bin:/root/.nargo/bin:/root/.noir/bin:/root/.bb:/root/barretenberg:$PATH"

# System dependencies + Python 3.10
RUN apt-get update && apt-get install -y \
    software-properties-common \
    curl \
    git \
    ca-certificates \
    build-essential \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y \
        python3.10 \
        python3.10-venv \
        python3.10-distutils \
    && rm -rf /var/lib/apt/lists/*

# Install pip for Python 3.10
RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python3.10

# Install pipx + garaga
RUN python3.10 -m pip install --no-cache-dir pipx \
 && python3.10 -m pipx install garaga==1.0.1 --python python3.10

ENV PATH="/root/.local/bin:$PATH"

# Node + pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y nodejs \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

# Install Noir
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
RUN noirup --version 1.0.0-beta.16

# Install Barretenberg
RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
RUN bbup --version 3.0.0-nightly.20251104

# Workspace
WORKDIR /satkeyprover

COPY . .

RUN pnpm install --filter @satkey/prover... --frozen-lockfile
RUN pnpm build --filter @satkey/prover

EXPOSE 3001

CMD ["pnpm", "--filter", "@satkey/prover", "start"]