# ExpressJS Boilerplate
This repository includes a template for configuring CI/CD via GitHub Actions for projects based on the ExpressJS framework with NGINX and Certbot support (for obtaining Let's Encrypt certificates) via Docker.

**Let's break down who is responsible for what:**
- **GitHub Actions** - Application Deploy;
- **Docker (Docker Compose)** - Server Setup;
- **ExpressJS** - Backend Application Framework;
- **NGINX** - Manage application and Server Connection;
- **Certbot** - SSL Certificates (Let's Encrypt);

So, let's take a look at the step-by-step configuration for automating server operations.

---

## Prepare Server
The process of preparing the server (Ubuntu) is described below. To do this, we just need to install Docker on the server via SSH.

**Let's Look at Clean Docker Install Process:**
1. Remove All Old Packages;
2. Setup Docker Repository;
3. Install Docker;
4. Check Docker Status;

**Remove Old Packages:**
```bash
sudo apt remove $(dpkg --get-selections docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc | cut -f1)
```

**Setup Docker Repository:**
```bash
# Add Docker's official GPG key:
sudo apt update
sudo apt install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

**Install Docker:**
```bash
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

**Check Docker Status:**
```bash
sudo systemctl status docker
```

---

## Project Structure
We have a special structure in this project from default Express Application, but with some additional setup of NGINX and GitHub Actions.

**Let's look at project structure:**
```
# Basic Structure
/.github/
    /workflows/
        deploy.yml  # GitHub Actions Deploy Workflow
/nginx/
    nginx.conf      # NGINX Config for Basic Setup and Certbot Features Support
    nginx-ssl.conf  # NGINX Configuration for HTTPS Server
deploy.sh           # Bash Commands for Server Launch and Get SSL Certificates from Let's Encrypt
docker-compose.yml  # NGINX + Express + Certbot Initialization in single network
Dockerfile          # Docker for Express Application
package.json        # Application Package File
run.js              # Our Application Bootstrap Script
```

---

## GitHub Actions
Now, let setup **GitHub Actions** for automatic deploy at our servers. We use basic cloud server (Ubuntu) with SSH connection.

**First, setup GitHub Actions Environment Variables:**
- Go to Actions Variables page in your repo (https://github.com/Neurosell/gden_boilerplate/settings/secrets/actions);
- Add **Repository secrets**;

**We need setup secrets:**
- **SERVER_HOST** - Our Server host for deploy via SSH;
- **SERVER_USER** - Our User for SSH connection;
- **SERVER_SSH_KEY** - Our SSH Private key for connection;
- **SERVER_SSH_PASSPHRASE** - Our SSH Passphrase for connection;

**And setup our deploy.yml**
```yml
name: Deploy to Production Server
on:
  push:
    branches:
      - main
jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Configure Git to trust all directories
        run: |
          git config --global --add safe.directory '*'
          git config --global user.name "Neurosell"
          git config --global user.email "start@ncommx.com"

      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Verify Git status
        run: git status

      - name: Setup SSH key with passphrase
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          echo "${{ secrets.SERVER_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          eval "$(ssh-agent -s)"
          echo "echo '${{ secrets.SERVER_SSH_PASSPHRASE }}'" > ~/.ssh/askpass.sh
          chmod +x ~/.ssh/askpass.sh
          DISPLAY=:0 SSH_ASKPASS=~/.ssh/askpass.sh setsid ssh-add ~/.ssh/id_ed25519 </dev/null
      - name: Fix permission before upload
        run: chmod -R a+rX .
      - name: Prepare deploy directory on server
        uses: appleboy/ssh-action@v0.1.10
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          passphrase: ${{ secrets.SERVER_SSH_PASSPHRASE }}
          script: |
            sudo mkdir -p /app/
            sudo chown -R $USER:$USER /app/
            sudo chmod -R 755 /app/
            sudo mkdir -p /var/www/certbot
            sudo chown -R $USER:$USER /var/www/certbot
            sudo chmod -R 755 /var/www/certbot
      - name: Copy project files to server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          passphrase: ${{ secrets.SERVER_SSH_PASSPHRASE }}
          source: "."
          target: "/app/"
      - name: Clean possible conflicting containers
        run: |
          sudo docker rm -f nginx || true
          sudo docker rm -f certbot || true
          sudo docker rm -f app || true
          sudo docker rm -f certbot_renew || true
      - name: Wait for Next Step
        run: sleep 5
      - name: Clean Docker Network
        run: |
          sudo docker network prune -f
      - name: Wait for Next Step
        run: sleep 5
      - name: Run deployment script
        uses: appleboy/ssh-action@v0.1.10
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          passphrase: ${{ secrets.SERVER_SSH_PASSPHRASE }}
          script: |
            sudo chmod +x /app/deploy.sh
            sudo /app/deploy.sh
```

**Where steps:**
1. Configure Git Account;
2. Checkout Repository;
3. Verify Git Status;
4. Setup SSH Key and Passphrase for Connection;
5. Fix Server Permissions for Deploy;
6. Prepare directories before Deploy on the server;
7. Copy Project files at server;
8. Clean Possible Conflicts for Containers;
9. Clean Docker Network (avoid conflicts);
10. Run our Deploy Script at Server (deploy.sh);

**Now Our GitHub Actions are Configured. The next step is configure our Docker Containers**

---

## Docker
So, let's get started with Docker and Docker Compose. This system can help us to automatically setup Express Application, NGINX and Certbot (for Let's Encrypt Certificates) at Single Cloud Server.

**We use two files to configure our repository:**
- **Dockerfile** - for setup and run Express Application;
- **docker-compose** - NGINX + Express + Certbot Chain in the single network bridge;

**Our Dockerfile:**
```dockerfile
# Enironment Installation and Install Depedencies
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install -g nodemon && npm install
COPY . .
EXPOSE 80 443 8080 4443

# Start Application
CMD ["nodemon", "run"]
```

**Our Docker Compose:**
```yml
version: "3.8"
services:
  # Express App
  app:
    build: .
    container_name: app
    ports:
      - "8080:8080"
      - "4443:4443"
    restart: always
    working_dir: /app
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
      - .:/app
      - /app/node_modules
    environment:
      - ENV=development
    networks:
      - app-network

  # NGINX Proxy
  nginx:
    image: nginx:alpine
    container_name: nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - nginx-config:/etc/nginx
      - ./data/certbot/conf:/etc/letsencrypt
      - ./data/certbot/www:/var/www/certbot
    depends_on:
      - app
    networks:
      - app-network

  # Certbot
  certbot:
    image: certbot/certbot
    container_name: certbot
    volumes:
      - ./data/certbot/conf:/etc/letsencrypt
      - ./data/certbot/www:/var/www/certbot
      - nginx-config:/etc/nginx
    networks:
      - app-network
    profiles: ["certbot"]

# Volumes
volumes:
  nginx-config:
    driver: local
    driver_opts:
      type: none
      device: ./nginx
      o: bind

# Network Bridge
networks:
  app-network:
    driver: bridge
```

**Great! Our Docker is configured. Now, we need to setup NGINX**

---

## NGINX
Our NGINX configuration contains two files. Why not a single configurations? Because Express Application can conflict with NGINX proxy (when express works with static or 404 routing). And this behaviour can be broken certbot logic with domain verification.

**Basic Config: (REPLACE YOUR_DOMAIN.COM)**
```nginx configuration
events {
    worker_connections 1024;
}

http {
    upstream express_app {
        server app:8080;
    }

    # HTTP only server - for initial setup and ACME challenges
    server {
        listen 80;
        server_name YOUR_DOMAIN.COM;

        # CRITICAL: Let's Encrypt challenge - must be at server root level
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
            try_files $uri =404;
        }

        # Health check
        location /health {
            access_log off;
            return 200 "nginx-http-only\n";
            add_header Content-Type text/plain;
        }

        # Proxy to app - but ONLY AFTER ACME challenges
        location / {
            proxy_pass http://express_app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;

            add_header Access-Control-Allow-Origin "*";
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS";
            add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization";
        }
    }

    # Block all other HTTP traffic during setup
    server {
        listen 80 default_server;
        server_name _;
        return 444;
    }
}
```

**SSL-Ready Config: (REPLACE YOUR_DOMAIN.COM)**
```nginx configuration
events {
    worker_connections 1024;
}

http {
    upstream express_app {
        server app:8080;
    }

    # HTTP redirect to HTTPS
    server {
        listen 80;
        server_name YOUR_DOMAIN.COM;

        # ACME challenges still work over HTTP
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
            try_files $uri =404;
        }

        # Redirect everything else to HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name YOUR_DOMAIN.COM;

        ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN.COM/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN.COM/privkey.pem;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
        ssl_prefer_server_ciphers off;

        add_header Strict-Transport-Security "max-age=63072000" always;
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;

        location / {
            proxy_pass http://express_app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;

            add_header Access-Control-Allow-Origin "*";
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS";
            add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization";
        }
    }
}
```

**Great. Now we need to set up our automation script for bash.**

---

## Deploy Script
Now we need to write our automation script. This script need to run our containers, manage SSL certificate and NGINX Configurations at the Cloud Server.

**Inside deploy.sh: (REPLACE YOUR_DOMAIN.COM)**
```bash
#!/bin/bash
set -e
cd /app/

echo "Pulling Repository for Production..."
sudo git config --global --add safe.directory '*'
sudo git config --global user.name "Neurosell"
sudo git config --global user.email "start@ncommx.com"
sudo git pull origin main

echo "Stopping to use app ports"
docker compose -f docker-compose.yml down
sudo systemctl stop nginx || true
sudo systemctl stop apache2 || true
sudo pkill -f "nginx" || true
sudo pkill -f "apache" || true
sudo fuser -k 80/tcp || true
sudo fuser -k 443/tcp || true

sleep 5

echo "📊 Checking port availability:"
sudo netstat -tulpn | grep -E ":80|:443" || echo "Ports 80 and 443 are free"

echo "Restart Containers"
docker compose -f docker-compose.yml build --no-cache
docker compose -f docker-compose.yml up -d app nginx

echo "Waiting for services to be ready..."
sleep 5

echo "Requesting SSL certificates..."
docker compose -f docker-compose.yml run --rm certbot certonly --webroot --webroot-path=/var/www/certbot -d YOUR_DOMAIN.COM --email ilya@neurosell.top --agree-tos --no-eff-email --preferred-challenges http --non-interactive --keep-until-expiring

echo "Switching to SSL configuration..."
cp nginx/nginx-ssl.conf nginx/nginx.conf
docker compose -f docker-compose.yml restart nginx

echo "All Right! Server is Started!"
```

**Okay, and the final step - is our Express Application.**

---

## Application Example
We need to start our Express Application at 8080 port. And our Package need contains **nodemon** library.

**And of course, our example application:**
```javascript
const express = require("express");
const app = express();
const port = process.env.PORT || 8080;

app.use("/", function(req, res) {
    return res.status(200).json({
        success: true,
        message: "Neurosell Health Server is Running",
        data: {}
    })
});
app.listen(port, function() {
    console.log("Server running on port " + port);
});
```

Now, your application is ready with CI / CD (NGINX + Actions + Docker + Express).

---

## Deploy Process
If you have configured everything correctly, now when you PUSH to the main branch, your application will be deployed and launched according to the workflow in GitHub Actions.

**Example:**
https://health.nsell.tech/