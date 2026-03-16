# Install Chat App on Kind (Kubernetes in Docker)

This guide explains how to run the chat application on a **Kind** (Kubernetes in Docker) cluster on your local machine. You can install the app with **Helm** only, or add **Argo CD** on Kind and deploy via GitOps.

---

## Prerequisites

- **Docker** – Kind runs Kubernetes inside Docker. [Install Docker](https://docs.docker.com/get-docker/).
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

---

## Part 3: Install the app with Helm

### 3.1 Create namespace and install the chart

Use the **local** image name and tag so the cluster uses the image you loaded.

```bash
kubectl create namespace chat-app
helm install chat-app ./helm/chat-app -n chat-app \
  --set image.repository=chat-app \
  --set image.tag=latest \
  --set image.pullPolicy=IfNotPresent \
  --set secret.jwtSecret=dev-secret-change-me
```

- `image.repository=chat-app` and `image.tag=latest` match the image you built and loaded.
- `image.pullPolicy=IfNotPresent` uses the local image and avoids pull errors.

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

If your Helm chart is in a Git repo, create an Application that points to it. Replace `YOUR_ORG/chat-app` with your repo:

```bash
kubectl apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: chat-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/YOUR_ORG/chat-app.git
    path: helm/chat-app
    targetRevision: main
    helm:
      parameters:
        - name: image.repository
          value: chat-app
        - name: image.tag
          value: latest
        - name: image.pullPolicy
          value: IfNotPresent
        - name: secret.jwtSecret
          value: dev-secret-change-me
  destination:
    server: https://kubernetes.default.svc
    namespace: chat-app
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
EOF
```

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

## Part 7: Auto-deploy to Kind when you push to GitHub

Pushing code to `main` or `master` does **not** auto-deploy to Kind by default. The repo includes a **separate workflow** that can deploy to a Kind server on every push.

**Workflow file:** `.github/workflows/deploy-kind.yml`

It does two things:

1. **Build and push** the Docker image to **GitHub Container Registry (GHCR)** as `ghcr.io/<owner>/chat-app:latest`.
2. **Deploy to Kind** using one of two options below.

### Option A: Self-hosted runner on the Kind server (recommended)

Run a GitHub Actions **self-hosted runner** on the same machine where Kind is running. The workflow will run the deploy job on that runner and update Kind with no SSH.

1. **On the Kind server:** Install and register a self-hosted runner with the label `kind`:
   - GitHub repo → **Settings** → **Actions** → **Runners** → **New self-hosted runner**
   - Choose Linux (or your OS), then follow the commands. When asked for labels, add **`kind`** (in addition to the default).

2. **One-time on the Kind server:** Install the app with Helm using the **GHCR** image so the deployment name and namespace match what the workflow expects:
   ```bash
   kubectl create namespace chat-app
   helm install chat-app ./helm/chat-app -n chat-app \
     --set image.repository=ghcr.io/YOUR_GITHUB_OWNER/chat-app \
     --set image.tag=latest \
     --set image.pullPolicy=IfNotPresent \
     --set secret.jwtSecret=dev-secret-change-me
   ```
   Replace `YOUR_GITHUB_OWNER` with your GitHub org or username (same as in the repo URL).

3. **Enable package permissions:** Repo **Settings** → **Actions** → **General** → **Workflow permissions** → allow read/write for packages if the runner needs to pull from GHCR. The workflow logs in to GHCR with `GITHUB_TOKEN` on the runner to pull the image.

After that, every push to `main`/`master` will build the image, push to GHCR, and the **deploy-kind-self-hosted** job will run on your Kind server: pull image → load into Kind → restart the `chat-app` deployment.

### Option B: SSH into a remote Kind server

Use this when you don’t run a self-hosted runner and your Kind cluster is on a **remote** machine (e.g. a VM or EC2). The workflow will SSH into that host and run the same deploy steps.

1. **On the Kind server (one-time):**
   - Install Docker, Kind, kubectl, and create the cluster (see Part 1 and Part 2).
   - Install the app with Helm as in Option A (use `ghcr.io/YOUR_GITHUB_OWNER/chat-app`).
   - For **private** repos: log in to GHCR so the server can pull the image:
     ```bash
     echo YOUR_GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
     ```
     Use a PAT with `read:packages`. For **public** repos, pulls from GHCR are often allowed without login.

2. **In GitHub:** Add a **variable** to enable the SSH deploy job (Settings → Secrets and variables → Actions → Variables):
   - `KIND_SSH_DEPLOY` = `true`
   Then add these **secrets**:
   - `KIND_SERVER_HOST` – hostname or IP of the Kind server (e.g. `ec2-xx-xx-xx-xx.compute.amazonaws.com`).
   - `SSH_PRIVATE_KEY` – private key that can SSH into the Kind server (e.g. contents of `key.pem`).
   - (Optional) `KIND_SERVER_USER` – SSH user (default: `ec2-user`; use `ubuntu` for Ubuntu).

3. **Network:** The GitHub Actions runner must be able to reach `KIND_SERVER_HOST` on SSH (port 22). If the server is in a private VPC, use a self-hosted runner (Option A) or a runner that has network access to the server.

When you push to `main`/`master`, the **deploy-kind-ssh** job runs: SSH to the server → `docker pull` from GHCR → `kind load docker-image` → `kubectl set image` and `rollout status` for the chat-app deployment.

### Summary: does push auto-deploy to Kind?

| Setup | Auto-deploy on push? |
|-------|----------------------|
| No runner, no SSH secrets | No – only the image is built and pushed to GHCR. The deploy jobs are skipped or stay queued. |
| Self-hosted runner with label `kind` on the Kind server | Yes – deploy job runs on that runner and updates Kind. |
| Variable `KIND_SSH_DEPLOY` = `true` and secrets `KIND_SERVER_HOST`, `SSH_PRIVATE_KEY` set | Yes – deploy job SSHs to the server and updates Kind. |

If you use neither option, you can ignore the **deploy-kind-self-hosted** job (it will wait for a runner) and the **deploy-kind-ssh** job will be skipped when the variable `KIND_SSH_DEPLOY` is not set to `true`.

---

## Summary

- **Kind** gives you a local Kubernetes cluster in Docker.
- **Build** the chat-app image and **load** it into Kind with `kind load docker-image`.
- **Install** with Helm: `helm install chat-app ./helm/chat-app -n chat-app --set image.repository=chat-app --set image.tag=latest --set image.pullPolicy=IfNotPresent --set secret.jwtSecret=...`
- **Access** via `kubectl port-forward -n chat-app svc/chat-app 3000:80` and open http://localhost:3000.
- **Optional:** Install Argo CD on Kind and deploy the app from the Git repo using the same Helm chart.
- **Auto-deploy:** Use `.github/workflows/deploy-kind.yml` with either a self-hosted runner (label `kind`) on the Kind server or variable `KIND_SSH_DEPLOY` = `true` plus secrets `KIND_SERVER_HOST`, `SSH_PRIVATE_KEY` to deploy on every push to `main`/`master`.

For production-like deployment on AWS, see [EKS-ARGOCD-DEPLOYMENT.md](EKS-ARGOCD-DEPLOYMENT.md).
