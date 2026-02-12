# Hostinger VPS Deployment Guide

This guide will walk you through setting up your Ubuntu VPS to host the FilersHub application using Docker.

## Prerequisites
- **VPS IP Address**: `76.13.108.242`
- **SSH Access**: You should be able to SSH into your server (e.g., `ssh root@76.13.108.242`).

---

## Step 1: Install Docker on VPS

Connect to your VPS terminal (via SSH or the Hostinger "Terminal" button) and run the following commands:

```bash
# 1. Update existing list of packages
apt-get update

# 2. Install prerequisite packages
apt-get install -y ca-certificates curl gnupg

# 3. Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# 4. Set up the repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 5. Install Docker Engine
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 6. Verify installation
docker --version
```

---

## Step 2: Setup GitHub Secrets

To allow GitHub to push code to your server, you need to add "Secrets" to your GitHub Repository.

1.  Go to your GitHub Repo -> **Settings** -> **Secrets and variables** -> **Actions**.
2.  Click **New repository secret**.
3.  Add the following secrets:

| Name | Value | Description |
| :--- | :--- | :--- |
| `VPS_HOST` | `76.13.108.242` | Your VPS IP address. |
| `VPS_USERNAME` | `root` | Your VPS SSH username. |
| `VPS_SSH_KEY` | *(Your Private SSH Key)* | The private key content (`-----BEGIN OPENSSH PRIVATE KEY...`) corresponding to the public key needed for SSH access. |
| `VITE_SUPABASE_URL` | *(From local .env)* | The https://...supabase.co URL. |
| `VITE_SUPABASE_ANON_KEY` | *(From local .env)* | The Supabase Anon Key. |
| `VITE_GHL_CLIENT_ID` | `6958786ef44f33b4c310c8ea-mliunz9v` | GHL Client ID. |

**Important Note on SSH Key**:
If you don't have an SSH key pair set up for GitHub Actions to log in to your VPS:
1.  Run `ssh-keygen -t ed25519 -f ~/.ssh/gh_deploy` on your local machine.
    *   Press Enter for no passphrase.
2.  Copy the content of the **public key** (`cat ~/.ssh/gh_deploy.pub`) and add it to your VPS:
    *   On VPS: `nano ~/.ssh/authorized_keys`
    *   Paste the key on a new line. Save and exit (Ctrl+X, Y, Enter).
3.  Copy the content of the **private key** (`cat ~/.ssh/gh_deploy`) and use that for the `VPS_SSH_KEY` secret in GitHub.

---

## Step 3: Trigger the Deploy

1.  Commit and push the new files (`Dockerfile`, `nginx.conf`, `.github/workflows/deploy.yml`) to your GitHub `main` branch.
2.  Go to the **Actions** tab in your GitHub repository.
3.  You should see the "Deploy to Hostinger VPS" workflow running.

## Step 4: Verify

Once the action completes successfully:
1.  Open `http://76.13.108.242` in your browser.
2.  You should see the FilersHub login page!

## Troubleshooting

-   **SSH Connection Failed**: Check that the `VPS_SSH_KEY` in GitHub Secrets matches exactly the private key for the public key in your VPS's `~/.ssh/authorized_keys`.
-   **Docker Permission**: If you use a non-root user, ensure they are added to the docker group: `usermod -aG docker $USER`.
