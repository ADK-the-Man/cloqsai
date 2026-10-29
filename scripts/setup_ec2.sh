#!/usr/bin/env bash
# ==============================================================================
# CLOQS AI - Automated EC2 Instance Setup Script
# Installs: Docker, Docker Compose, Git, Curl, JQ, and Configures 4GB Swap Space
# Supports: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS (x86_64 and arm64)
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting CLOQS AI EC2 Environment Setup..."
echo "=========================================================="

# 1. Update Package Lists & Install Essential Utilities
echo "[1/5] Updating apt packages and installing core tools..."
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    jq \
    wget \
    htop \
    unzip \
    net-tools

# 2. Configure 4GB Swap File (Protects t3/t4 instances from Next.js build OOM)
echo "[2/5] Configuring 4GB swap space..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    sudo sysctl vm.swappiness=10
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    echo "Swap configured successfully."
else
    echo "Swap file /swapfile already exists. Skipping."
fi

# 3. Install Docker Engine & Docker Compose via Official Docker Script
echo "[3/5] Installing Docker Engine & Docker Compose..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm -f get-docker.sh
else
    echo "Docker is already installed."
fi

# 4. Enable Docker Daemon & Add Current User to Docker Group
echo "[4/5] Enabling Docker daemon and granting user permissions..."
sudo systemctl enable docker
sudo systemctl start docker

# Add current user and ubuntu to docker group
CURRENT_USER="${USER:-ubuntu}"
sudo usermod -aG docker "$CURRENT_USER" || true
if id "ubuntu" &>/dev/null; then
    sudo usermod -aG docker ubuntu || true
fi

# 5. Verification & Final Status Report
echo "[5/5] Verifying tool installations..."
echo "----------------------------------------------------------"
git --version
docker --version
docker compose version
echo "----------------------------------------------------------"

echo ""
echo "=========================================================="
echo " EC2 Setup Complete! All tools are installed and ready."
echo "=========================================================="
echo ""
echo "Next Steps to Run CLOQS AI:"
echo "  1. Apply docker group without logging out:"
echo "     newgrp docker"
echo ""
echo "  2. Clone the repository (if not already done):"
echo "     git clone https://github.com/ADK-the-Man/cloqsai.git"
echo "     cd cloqsai"
echo ""
echo "  3. Configure your .env file:"
echo "     cp .env.example .env"
echo "     nano .env"
echo ""
echo "  4. Start the application:"
echo "     docker compose up -d --build"
echo ""
echo "  5. Access the web app at: http://YOUR_EC2_PUBLIC_IP:3000"
echo "=========================================================="
