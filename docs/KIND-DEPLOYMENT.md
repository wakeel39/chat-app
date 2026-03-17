# Install Chat App on Kind (Kubernetes in Docker)

This guide explains how to run the chat application on a **Kind** (Kubernetes in Docker) cluster—on your **local machine** or on an **AWS EC2 instance**. You can install the app with **Helm** only, or add **Argo CD** on Kind and deploy via GitOps.

- **Local:** Parts 1–3 (install Kind, build image, Helm install).  
- **EC2:** **Part 7** has all steps from launching the instance to accessing the app in a browser.  
- **Auto-deploy on push:** **Part 8** (self-hosted runner or SSH from GitHub Actions).

---

## Prerequisites

- **Docker** – Kind runs Kubernetes inside Docker. [Install Docker](https://docs.docker.com/get-docker/). Your user must be in the `docker` group (see [Troubleshooting](#troubleshooting) if you see a permission denied error).
- **kubectl** – [Install kubectl](https://kubernetes.io/docs/tasks/tools/).
- **Helm 3** – [Install Helm](https://helm.sh/docs/intro/install/).
- **Kind** – Install next, or use the commands below.

---

## Part 1: Install Kind and create a cluster

### 1.1 Install Kind

**Linux / macOS:**

```bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
```

On macOS (Intel): use `kind-darwin-amd64`. For Apple Silicon: `kind-darwin-arm64`.

**Windows (PowerShell):**

```powershell
curl.exe -Lo kind-windows-amd64.exe https://kind.sigs.k8s.io/dl/v0.20.0/kind-windows-amd64
Move-Item .\kind-windows-amd64.exe c:\some-dir-in-path\kind.exe
```

Or use **Chocolatey:** `choco install kind`

Verify:

```bash
kind version
```

### 1.2 Create a Kind cluster

```bash
kind create cluster --name chat-app
```

This creates a cluster named `chat-app` and sets your kubeconfig to use it.

```bash
kubectl cluster-info --context kind-chat-app
kubectl get nodes
```

### 1.3 (Optional) Kind config for port mapping

To access the chat app on `localhost` without port-forward, create a cluster with extra port mappings.

Create `kind-config.yaml`:

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
    extraPortMappings:
      - containerPort: 30080  # NodePort or LoadBalancer on host
        hostPort: 3000
        protocol: TCP
```

Create the cluster:

```bash
kind create cluster --name chat-app --config kind-config.yaml
```

You can use this config when you expose the app via NodePort (see Part 3).

---

## Part 2: Build the app image and load it into Kind

Kind runs on your machine, so use a **local** Docker image. Build the chat-app image and load it into the Kind cluster.

From the **chat-app repo root**:

```bash
docker build -t chat-app:latest .
```

Load the image into the Kind cluster (so Kubernetes can pull it without a registry):

```bash
kind load docker-image chat-app:latest --name chat-app
```

Verify:

```bash
docker exec -it chat-app-control-plane crictl images | grep chat-app
```

**Using Docker Hub – build and push:** This project’s image on Docker Hub is **`sardarabdulwakeel/chat-app:latest`**. From the chat-app repo root:

```bash
# 1. Build the image
docker build -t chat-app:latest .

# 2. Tag for Docker Hub
docker tag chat-app:latest sardarabdulwakeel/chat-app:latest

# 3. Log in to Docker Hub (username + password or access token)
docker login

# 4. Push to Docker Hub
docker push sardarabdulwakeel/chat-app:latest
```

To use a different Docker Hub username, replace `sardarabdulwakeel` with `YOUR_DOCKERHUB_USERNAME` in the tag and push commands.

To use this image from another machine (e.g. EC2) or the same Kind cluster:

On the machine where Kind runs (local or EC2), pull and load into Kind:

```bash
docker pull sardarabdulwakeel/chat-app:latest
kind load docker-image sardarabdulwakeel/chat-app:latest --name chat-app
```

Then install with Helm using `--set image.repository=sardarabdulwakeel/chat-app` (see Part 3 and Part 7.9).

---

## Part 3: Install the app with Helm

### Deploy using only the image (no Git clone)

If you **don’t want to clone the repo**, you can deploy using only the Docker image **`sardarabdulwakeel/chat-app:latest`** from Docker Hub. Apply the manifest from the repo (no clone on your machine):

```bash
kubectl apply -f https://raw.githubusercontent.com/wakeel39/chat-app/main/manifests/chat-app-from-image.yaml
```

If your repo uses **`master`** as the default branch, replace `main` with `master` in the URL. This creates the `chat-app` namespace, the app (image `sardarabdulwakeel/chat-app:latest`), MongoDB, Redis, and their services. Then wait for pods and access the app:

```bash
kubectl get pods -n chat-app -w
# Ctrl+C when all Running

# Access the app (port-forward)
kubectl port-forward -n chat-app svc/chat-app 3000:80
# Open http://localhost:3000
```

To change the JWT secret or image, download the file, edit it, and apply:

```bash
curl -sLO https://raw.githubusercontent.com/wakeel39/chat-app/main/manifests/chat-app-from-image.yaml
# Edit chat-app-from-image.yaml (e.g. secret.jwtSecret or image tag), then:
kubectl apply -f chat-app-from-image.yaml
```

---

### 3.1 Create namespace and install the chart (with Helm, from repo)

**Run these commands from the chat-app repo root** (the directory that contains the `helm` folder). If you see `path "./helm/chat-app" not found`, run `cd` into the repo root first (e.g. `cd /path/to/chat-app`).

Use the **local** image name and tag so the cluster uses the image you loaded.

```bash
# From the repo root (directory that contains helm/)
kubectl create namespace chat-app
helm install chat-app ./helm/chat-app -n chat-app \
  --set image.repository=chat-app \
  --set image.tag=latest \
  --set image.pullPolicy=IfNotPresent \
  --set secret.jwtSecret=dev-secret-change-me
```

- `image.repository=chat-app` and `image.tag=latest` match the image you built and loaded.
- `image.pullPolicy=IfNotPresent` uses the local image and avoids pull errors.
- **Docker Hub:** If you use the image on Docker Hub, use `--set image.repository=sardarabdulwakeel/chat-app` (or your own `YOUR_DOCKERHUB_USERNAME/chat-app`). The cluster will pull from Docker Hub when the image is not already loaded.

### 3.2 Wait for pods

```bash
kubectl get pods -n chat-app -w
```

Wait until `chat-app`, `mongo`, and `redis` pods are `Running`.

### 3.3 Access the app

**Option A – Port-forward (works with default Kind cluster):**

```bash
kubectl port-forward -n chat-app svc/chat-app 3000:80
```

Open **http://localhost:3000** in your browser.

**Option B – NodePort (if you used the Kind config with hostPort 3000):**

Patch the service to NodePort and use the worker node port:

```bash
kubectl patch svc chat-app -n chat-app -p '{"spec": {"type": "NodePort", "ports": [{"port": 80, "targetPort": 3000, "nodePort": 30080}]}}'
```

If you created the cluster with the optional `kind-config.yaml` above, open **http://localhost:3000**. Otherwise use the port shown by:

```bash
kubectl get svc -n chat-app chat-app
```

---

## Part 4: (Optional) Install Argo CD on Kind and deploy via Argo CD

You can run Argo CD on the same Kind cluster and deploy the chat-app from the Helm chart in Git (or from a local path).

### 4.1 Install Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=Available deployment/argocd-server -n argocd --timeout=300s
```

### 4.2 Expose Argo CD server (port-forward)

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Open **https://localhost:8080** (accept the self-signed certificate).  
Get the admin password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
echo
```

Log in with username `admin` and that password.

### 4.3 Deploy chat-app from Git with Argo CD

Use the **Kind** Application manifest (Docker Hub image `sardarabdulwakeel/chat-app`):

```bash
kubectl apply -f argocd/application-kind.yaml
```

From the repo root. Or apply the manifest from the [argocd/application-kind.yaml](argocd/application-kind.yaml) file in this repo.

**Using a local Helm chart (no Git):** Argo CD normally pulls from Git. To use the chart from your machine without pushing to Git, install with Helm as in Part 3; Argo CD is optional for local Kind.

### 4.4 Sync and access

In the Argo CD UI, open the `chat-app` application and click **Sync**, or from the CLI:

```bash
argocd app sync chat-app --insecure
```

Then use port-forward as in 3.3:

```bash
kubectl port-forward -n chat-app svc/chat-app 3000:80
```

Open **http://localhost:3000**.

---

## Part 5: Useful commands on Kind

| Task | Command |
|------|--------|
| List nodes | `kubectl get nodes` |
| List pods (chat-app) | `kubectl get pods -n chat-app` |
| Logs (chat-app) | `kubectl logs -n chat-app -l app=chat-app -f` |
| Logs (MongoDB) | `kubectl logs -n chat-app -l app=mongo -f` |
| Restart app | `kubectl rollout restart deployment/chat-app -n chat-app` |
| Upgrade Helm release | `helm upgrade chat-app ./helm/chat-app -n chat-app --set image.tag=latest` |
| Delete release | `helm uninstall chat-app -n chat-app` |
| Delete cluster | `kind delete cluster --name chat-app` |

---

## Part 6: Rebuild and redeploy after code changes

After you change code, rebuild the image, reload it into Kind, and restart the app:

```bash
# From repo root
docker build -t chat-app:latest .
kind load docker-image chat-app:latest --name chat-app
kubectl rollout restart deployment/chat-app -n chat-app
kubectl rollout status deployment/chat-app -n chat-app
```

Then use port-forward again if needed: `kubectl port-forward -n chat-app svc/chat-app 3000:80`.

---

## Part 7: Run Kind on an EC2 instance (all steps)

This section walks through running Kind and the chat app entirely on an **AWS EC2** instance, from launching the instance to accessing the app in a browser.

### 7.1 Launch an EC2 instance

1. In **AWS Console** go to **EC2** → **Launch instance**.
2. **Name:** e.g. `kind-chat-app`.
3. **AMI:** **Amazon Linux 2023** or **Ubuntu 22.04 LTS** (recommended).
4. **Instance type:** **t3.medium** or larger (Kind needs memory; t3.micro/t3.small may be tight).
5. **Key pair:** Create or select a key pair and **download the `.pem` file**. You need it to SSH.
6. **Network settings:**
   - Create or use a VPC and a **public subnet** so the instance gets a public IP.
   - **Auto-assign public IP:** Enable.
   - **Security group:** Create or edit to allow:
     - **SSH (22)** from your IP (or `0.0.0.0/0` only for testing).
     - **Custom TCP 3000** from your IP (or `0.0.0.0/0` for testing) so you can open the chat app in the browser.
7. **Storage:** 20 GiB or more.
8. Launch the instance. Note the **Public IPv4 address** (e.g. `3.xx.xx.xx`) or **Public IPv4 DNS** (e.g. `ec2-3-xx-xx-xx.compute-1.amazonaws.com`).

### 7.2 Connect to the EC2 instance (SSH)

From your **local machine** (where the `.pem` file is):

**Linux / macOS:**

```bash
chmod 400 /path/to/your-key.pem
ssh -i /path/to/your-key.pem ec2-user@<EC2_PUBLIC_IP>
```

For **Ubuntu** AMI, use user `ubuntu` instead of `ec2-user`:

```bash
ssh -i /path/to/your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

Replace `<EC2_PUBLIC_IP>` with the instance’s public IP or DNS name.

### 7.3 Install Docker on EC2

**Amazon Linux 2023:**

```bash
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

Log out and log back in (or run `newgrp docker`) so the `docker` group applies.

**Ubuntu 22.04:**

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

Log out and log back in (or `newgrp docker`), then verify:

```bash
docker run hello-world
```

**If you see: `permission denied while trying to connect to the Docker API at unix:///var/run/docker.sock`**

Your user is not in the `docker` group yet, or the group has not been applied to your session. Fix it:

```bash
sudo usermod -aG docker $USER
```

Then either:

- **Log out and log back in** (SSH again), or  
- Run **`newgrp docker`** in the current session (or start a new shell).

Verify:

```bash
groups
# should list "docker"
docker run hello-world
```

If it still fails, ensure the Docker socket has the right group: `ls -la /var/run/docker.sock` (group should be `docker`). Then restart Docker and try again: `sudo systemctl restart docker`.

### 7.4 Install kubectl on EC2

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/
kubectl version --client
```

### 7.5 Install Kind on EC2

```bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/
kind version
```

### 7.6 Install Helm on EC2

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

### 7.7 Create the Kind cluster on EC2

**Option A – Default cluster (use port-forward to access the app):**

```bash
kind create cluster --name chat-app
kubectl cluster-info --context kind-chat-app
kubectl get nodes
```

**Option B – Cluster with host port so the app is on port 3000:**

Create a config file:

```bash
cat << 'EOF' > kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
    extraPortMappings:
      - containerPort: 30080
        hostPort: 3000
        protocol: TCP
EOF
kind create cluster --name chat-app --config kind-config.yaml
```

### 7.8 Build the chat-app image on EC2 (or pull from GHCR / Docker Hub)

**Option A – Build from source on EC2:**

```bash
# Install git if not present
sudo dnf install -y git   # Amazon Linux
# sudo apt-get install -y git   # Ubuntu

git clone https://github.com/YOUR_ORG/chat-app.git
cd chat-app
docker build -t chat-app:latest .
kind load docker-image chat-app:latest --name chat-app
```

Replace `YOUR_ORG/chat-app` with your repo URL.

**Option B – Pull from GitHub Container Registry (after the workflow has pushed an image):**

```bash
# For public image (no login needed for public packages):
docker pull ghcr.io/YOUR_GITHUB_OWNER/chat-app:latest

# For private image, log in first (use a PAT with read:packages):
echo YOUR_GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
docker pull ghcr.io/YOUR_GITHUB_OWNER/chat-app:latest

# Load into Kind (use the same image name for Helm below)
kind load docker-image ghcr.io/YOUR_GITHUB_OWNER/chat-app:latest --name chat-app
```

Replace `YOUR_GITHUB_OWNER` with your GitHub org or username.

**Option C – Pull from Docker Hub:**

```bash
# Log in (use your Docker Hub username and password or access token)
docker login

# Pull and load into Kind (this project’s image: sardarabdulwakeel/chat-app:latest)
docker pull sardarabdulwakeel/chat-app:latest
kind load docker-image sardarabdulwakeel/chat-app:latest --name chat-app
```

Use the same image name in the Helm install below (Option C in 7.9).

### 7.9 Install the chat app with Helm on EC2

If you **built locally** (Option A in 7.8), from the `chat-app` repo directory:

```bash
kubectl create namespace chat-app
helm install chat-app ./helm/chat-app -n chat-app \
  --set image.repository=chat-app \
  --set image.tag=latest \
  --set image.pullPolicy=IfNotPresent \
  --set secret.jwtSecret=dev-secret-change-me
```

If you **pulled from GHCR** (Option B in 7.8), use the GHCR image:

```bash
kubectl create namespace chat-app
helm install chat-app ./helm/chat-app -n chat-app \
  --set image.repository=ghcr.io/YOUR_GITHUB_OWNER/chat-app \
  --set image.tag=latest \
  --set image.pullPolicy=IfNotPresent \
  --set secret.jwtSecret=dev-secret-change-me
```

If you **pulled from Docker Hub** (Option C in 7.8), use the Docker Hub image (this project: `sardarabdulwakeel/chat-app`):

```bash
kubectl create namespace chat-app
helm install chat-app ./helm/chat-app -n chat-app \
  --set image.repository=sardarabdulwakeel/chat-app \
  --set image.tag=latest \
  --set image.pullPolicy=IfNotPresent \
  --set secret.jwtSecret=dev-secret-change-me
```

You can also use `docker.io/sardarabdulwakeel/chat-app` as the repository name.

If you didn’t clone the repo and only have the image, you need the Helm chart. Clone the repo first, then run the same `helm install` from the repo root.

Wait for pods:

```bash
kubectl get pods -n chat-app -w
```

Press Ctrl+C when all pods are `Running`.

### 7.10 Expose the app so you can open it in a browser

**If you used Option A (default cluster) in 7.7 – port-forward:**

On the **EC2 instance** run (or run in background with `nohup` / `tmux`):

```bash
kubectl port-forward -n chat-app svc/chat-app 3000:80
```

Then on your **local machine** create an SSH tunnel and open the app in the browser:

```bash
ssh -i /path/to/your-key.pem -L 3000:localhost:3000 ec2-user@<EC2_PUBLIC_IP>
```

Keep this terminal open. In your browser open: **http://localhost:3000**.

**If you used Option B (Kind config with hostPort 3000) in 7.7 – NodePort:**

On the EC2 instance:

```bash
kubectl patch svc chat-app -n chat-app -p '{"spec": {"type": "NodePort", "ports": [{"port": 80, "targetPort": 3000, "nodePort": 30080}]}}'
```

Ensure the EC2 **security group** allows **inbound TCP 3000** from your IP. Then in your browser open: **http://&lt;EC2_PUBLIC_IP&gt;:3000**.

### 7.11 Summary – EC2 Kind checklist

| Step | What to do |
|------|------------|
| 1 | Launch EC2 (Amazon Linux or Ubuntu, t3.medium+, security group: SSH 22 + TCP 3000). |
| 2 | SSH: `ssh -i key.pem ec2-user@<IP>` (or `ubuntu@<IP>` for Ubuntu). |
| 3 | Install Docker, start and enable it, add user to `docker` group, re-login. |
| 4 | Install kubectl, Kind, and Helm. |
| 5 | Create Kind cluster: `kind create cluster --name chat-app` (or with `kind-config.yaml` for host port 3000). |
| 6 | Build image on EC2 and `kind load`, or pull from GHCR or Docker Hub and `kind load`. |
| 7 | Clone repo, then `helm install chat-app ./helm/chat-app -n chat-app` with correct `image.repository` and `secret.jwtSecret`. |
| 8 | Access: port-forward on EC2 + SSH tunnel to localhost:3000, or NodePort and open http://&lt;EC2_IP&gt;:3000. |

### 7.12 Use this EC2 instance for auto-deploy (optional)

- **Self-hosted runner:** On this EC2 instance, install a GitHub Actions self-hosted runner with label `kind` (see Part 8, Option A). Pushes to `main`/`master` will then deploy to this Kind cluster.
- **SSH deploy:** Use this instance’s public IP/hostname as `KIND_SERVER_HOST`, and the same `.pem` as `SSH_PRIVATE_KEY` in GitHub secrets; set variable `KIND_SSH_DEPLOY` = `true` (see Part 8, Option B).

---

## Part 8: Auto-deploy to Kind on push to main (using Argo CD)

When you push to the **main** (or **master**) branch, the workflow builds the image, pushes it to **Docker Hub** (`sardarabdulwakeel/chat-app:latest`), then deploys to **Kind** using **Argo CD**.

**Workflow file:** `.github/workflows/deploy-kind.yml`

**Flow:** Push to main → build image → push to Docker Hub → Argo CD sync on Kind (sets image and syncs the `chat-app` Application).

### One-time setup on the Kind cluster

1. **Install Argo CD** on your Kind cluster (if not already):
   ```bash
   kubectl create namespace argocd
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   kubectl wait --for=condition=Available deployment/argocd-server -n argocd --timeout=300s
   ```

2. **Create the chat-app Application** (uses Docker Hub image and Helm chart from Git):
   ```bash
   kubectl apply -f argocd/application-kind.yaml
   ```
   Or from the repo root: `kubectl apply -f argocd/application-kind.yaml`. This creates the Argo CD Application that deploys `sardarabdulwakeel/chat-app` from the Helm chart in this repo.

3. **GitHub secrets** (Settings → Secrets and variables → Actions):
   - `DOCKERHUB_USERNAME` – your Docker Hub username (e.g. `sardarabdulwakeel`).
   - `DOCKERHUB_TOKEN` – Docker Hub access token (Account → Security → New Access Token).

### Option A: Deploy from GitHub Actions via Argo CD (Argo CD reachable from the internet)

Use this when your Kind cluster (e.g. on EC2) has **Argo CD exposed** so GitHub Actions can call it.

1. **Expose Argo CD server** on the Kind server (e.g. NodePort or port-forward with a tunnel). Example NodePort:
   ```bash
   kubectl patch svc argocd-server -n argocd -p '{"spec":{"type":"NodePort","ports":[{"port":443,"nodePort":30443}]}}'
   ```
   If Kind is on EC2 with host port mapping, use the EC2 public IP and the NodePort (e.g. `https://<EC2_IP>:30443`). For local Kind, use a tunnel (e.g. ngrok) to expose `https://localhost:8080` and use that URL as `ARGOCD_SERVER`.

2. **GitHub variable and secrets:**
   - **Variable:** `KIND_ARGOCD_DEPLOY` = `true`
   - **Secrets:** `ARGOCD_SERVER` (e.g. `https://<EC2_IP>:30443` or your tunnel URL), `ARGOCD_AUTH_TOKEN` (get it: Argo CD UI → User → Generate new token, or `argocd account generate-token`).

After that, every push to **main** will build → push to Docker Hub → run `argocd app set chat-app --helm-set image.tag=latest` and `argocd app sync` so Kind deploys the new image.

### Option B: Self-hosted runner on the Kind server

Run a **self-hosted runner** (label **`kind`**) on the same machine as Kind. The workflow’s **deploy-kind-self-hosted** job runs there and uses Argo CD (port-forward to argocd-server, then `argocd app set` and `argocd app sync`). No need to expose Argo CD to the internet.

1. On the Kind server: install the self-hosted runner with label `kind` (Settings → Actions → Runners).
2. Ensure Argo CD and the chat-app Application are installed (steps 1–2 above).
3. Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` in GitHub secrets (for the build job).

Push to **main** → build and push to Docker Hub → **deploy-kind-self-hosted** runs on the Kind server and syncs via Argo CD.

### Option C: SSH to Kind server

Use when Kind is on a **remote** host and you don’t use a self-hosted runner.

1. On the Kind server: install Argo CD and apply `argocd/application-kind.yaml` (steps 1–2 above). Install **argocd** CLI (e.g. from Argo CD releases).
2. **GitHub:** Variable `KIND_SSH_DEPLOY` = `true`; secrets `KIND_SERVER_HOST`, `SSH_PRIVATE_KEY`, and optionally `KIND_SERVER_USER`.
3. Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` for the build job.

Push to **main** → build and push to Docker Hub → **deploy-kind-ssh** SSHs to the server and runs `argocd app set` + `argocd app sync` there.

### Summary: auto-deploy to Kind on push to main

| Setup | What happens on push to main |
|-------|------------------------------|
| Only Docker Hub secrets | Image is built and pushed to `sardarabdulwakeel/chat-app:latest`. No deploy. |
| + Variable `KIND_ARGOCD_DEPLOY` = `true` and secrets `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN` | Image pushed to Docker Hub, then Argo CD is told to set image and sync (deploy to Kind). |
| Self-hosted runner with label `kind` on Kind server | Image pushed to Docker Hub; deploy job runs on the server and syncs via Argo CD. |
| Variable `KIND_SSH_DEPLOY` = `true` and SSH secrets | Image pushed to Docker Hub; job SSHs to Kind server and syncs via Argo CD. |

---

## Troubleshooting

### path "./helm/chat-app" not found (Helm INSTALLATION FAILED)

**Error:** `Error: INSTALLATION FAILED: path "./helm/chat-app" not found`

**Cause:** You ran `helm install` from a directory that does not contain the `helm/chat-app` folder. The path `./helm/chat-app` is relative to your current working directory.

**Fix:** Change to the **chat-app repo root** (the directory that has the `helm` folder and the `helm/chat-app` subfolder), then run the helm command again:

```bash
cd /path/to/chat-app    # or: cd D:\90daysDevOpsProjects\chat-app  (Windows)
pwd                     # confirm you see the repo root
ls helm/chat-app        # should show Chart.yaml, values.yaml, templates/
helm install chat-app ./helm/chat-app -n chat-app ...
```

If you don’t have the repo locally, clone it first: `git clone https://github.com/wakeel39/chat-app.git && cd chat-app`.

**If the error is from Argo CD** (sync failed with path not found): check that the `helm/chat-app` directory exists in your Git repo on the branch Argo CD uses (`targetRevision: main`). In GitHub, open the repo and confirm there is a folder `helm/chat-app` with `Chart.yaml` and `values.yaml`. If your default branch is `master`, change `targetRevision` in `argocd/application-kind.yaml` to `master`.

### Permission denied while connecting to the Docker API (unix:///var/run/docker.sock)

**Error:** `permission denied while trying to connect to the Docker API at unix:///var/run/docker.sock`

**Cause:** Your user is not in the `docker` group, or you have not started a new session after adding it.

**Fix:**

1. Add your user to the `docker` group:
   ```bash
   sudo usermod -aG docker $USER
   ```
2. Apply the change by either:
   - **Logging out and logging back in** (e.g. disconnect SSH and reconnect), or
   - Running **`newgrp docker`** in the current terminal (or open a new terminal).
3. Check that `docker` appears in your groups:
   ```bash
   groups
   ```
4. Test:
   ```bash
   docker run hello-world
   ```

If it still fails, check the Docker socket and restart Docker:

```bash
ls -la /var/run/docker.sock   # group should be "docker"
sudo systemctl restart docker
```

Then try `docker run hello-world` again (after logging out and back in if you just ran `usermod`).

### Docker connect error on Windows (dockerDesktopLinuxEngine pipe not found)

**Error:** `error during connect: Head "http://...dockerDesktopLinuxEngine/_ping": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`

**Cause:** Docker Desktop is not running, or its Linux engine (WSL2 backend) has not started.

**Fix (Windows):**

1. **Start Docker Desktop** from the Start menu (or from the system tray if it’s installed but stopped).
2. Wait until it’s fully started (whale icon in the tray is steady; “Docker Desktop is running” in the UI).
3. If you use **WSL2**: ensure WSL is running (`wsl --status` in PowerShell). Restart WSL if needed: `wsl --shutdown`, then start Docker Desktop again.
4. In a **new** PowerShell or terminal, run:
   ```powershell
   docker info
   ```
   If that works, run `docker build -t chat-app:latest .` again.

If it still fails, restart Docker Desktop (right‑click tray icon → Quit Docker Desktop, then start it again) and retry.

---

## Summary

- **Kind** gives you a local Kubernetes cluster in Docker (on your machine or on an EC2 instance).
- **Local:** Build the chat-app image and load it into Kind with `kind load docker-image`; install with Helm (Part 1–3).
- **EC2:** Follow **Part 7** for all steps: launch EC2, SSH, install Docker/kubectl/Kind/Helm, create cluster, build or pull image, Helm install, and access via port-forward or NodePort.
- **Access:** `kubectl port-forward -n chat-app svc/chat-app 3000:80` then open http://localhost:3000 (or http://&lt;EC2_IP&gt;:3000 if using NodePort on EC2).
- **Optional:** Install Argo CD on Kind and deploy from the Git repo (Part 4).
- **Auto-deploy:** Part 8 – push to **main** runs `.github/workflows/deploy-kind.yml`: build → push to Docker Hub (`sardarabdulwakeel/chat-app`) → deploy to Kind via **Argo CD**. Set up Argo CD and `argocd/application-kind.yaml` on Kind, then enable with variable `KIND_ARGOCD_DEPLOY` and secrets `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`, or use a self-hosted runner (label `kind`) or SSH (`KIND_SSH_DEPLOY`).

For production-like deployment on AWS (EKS), see [EKS-ARGOCD-DEPLOYMENT.md](EKS-ARGOCD-DEPLOYMENT.md).
