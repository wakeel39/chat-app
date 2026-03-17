# Deploy Chat App to EKS with Argo CD (using Bastion server)

This guide explains how to run the chat application on **Amazon EKS** with **Argo CD** for GitOps, using a **Bastion server** (jump host) to manage the cluster and Argo CD.

## Architecture overview

```
[Developer] --> [GitHub] --> [GitHub Actions] --> [ECR]
                      |
                      v
[Bastion] --> [EKS Cluster] <-- [Argo CD] (pulls from GitHub, deploys to EKS)
                   |
                   +-- chat-app (Node.js)
                   +-- MongoDB
                   +-- Redis
```

- **GitHub Actions**: Builds the Docker image (with version injected into HTML), pushes to **Amazon ECR**, deploys via **Argo CD CLI** (sets Helm image tag), then **tags the Git repo** with the version (e.g. `v1.0.1`). No manifest or code is committed back to Git.
- **Argo CD**: Uses the **Helm chart** in `helm/chat-app`. The workflow sets `image.tag` and `image.repository` via `argocd app set` and syncs; the chart in Git stays unchanged.
- **Bastion server**: A single EC2 instance (or similar) from which you run `kubectl` and `argocd` to manage the cluster and deployments.

---

## Prerequisites

- AWS CLI v2, `eksctl`, and `kubectl` installed (on your laptop or Bastion).
- An AWS account with permissions to create EKS clusters, ECR repositories, and IAM roles.
- A GitHub repo with this chat-app code (and GitHub Actions enabled).
- (Optional) A Bastion host in the same VPC as the EKS cluster, or use `eksctl`/AWS CLI from your machine with network access to the cluster.

---

## Part 1: Create EKS cluster and Bastion (optional)

### 1.1 Create the EKS cluster with eksctl

Create a file `eks-cluster.yaml`:

```yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: chat-app-cluster
  region: us-east-1
  version: "1.28"
managedNodeGroups:
  - name: ng-default
    instanceTypes: ["t3.small"]
    minSize: 1
    maxSize: 3
    desiredCapacity: 2
```

Then run:

```bash
eksctl create cluster -f eks-cluster.yaml
```

This creates the cluster and node group. Wait until the cluster is ready.

### 1.2 Create a Bastion server (optional)

If you want a dedicated Bastion in the same VPC:

1. In AWS Console: **EC2 → Launch instance**.
2. Choose **Amazon Linux 2** or **Ubuntu**, `t3.micro` is enough.
3. **Network**: Use the same VPC and a **private subnet** (recommended) or public subnet. For private, you need a way to reach it (e.g. SSM Session Manager, or a small VPN).
4. **Security group**: Allow SSH (22) from your IP if you use SSH; or leave it restricted and use **SSM Session Manager** (no SSH needed).
5. **IAM role**: Attach a role that has at least:
   - `AmazonEKSClusterPolicy` (if the Bastion will create clusters) or no cluster policy if cluster already exists.
   - Policy to describe EKS clusters and get `kubeconfig` (e.g. `eks:DescribeCluster`).
6. **User data** (optional) to install tools on first boot:

```bash
#!/bin/bash
curl -o kubectl https://s3.us-west-2.amazonaws.com/amazon-eks/1.28.0/2024-01-04/bin/linux/amd64/kubectl
chmod +x kubectl && sudo mv kubectl /usr/local/bin/
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd && sudo mv argocd /usr/local/bin/
# Install AWS CLI v2 if not present
```

### 1.3 Configure kubectl from Bastion (or your laptop)

From the machine that will run `kubectl` (Bastion or laptop):

```bash
aws eks update-kubeconfig --region us-east-1 --name chat-app-cluster
kubectl get nodes
```

You should see the EKS nodes. If using a Bastion, SSH or use **SSM Session Manager** to connect, then run the same commands there.

---

## Part 2: Create ECR repository and IAM for GitHub Actions

### 2.1 Create ECR repository

```bash
aws ecr create-repository --repository-name chat-app --region us-east-1
```

Note the **repository URI** (e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com/chat-app`).

### 2.2 IAM for GitHub Actions (OIDC recommended)

1. In GitHub: **Settings → Actions → General** → enable **Allow OIDC**.
2. In AWS: create an IAM OIDC identity provider for your GitHub repo (use the official AWS doc or a Terraform/CloudFormation template for “GitHub OIDC with ECR”).
3. Create an IAM role that:
   - Trusts the GitHub OIDC provider (with your repo and branch).
   - Has a policy that allows `ecr:GetAuthorizationToken` and, for the ECR repo, `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`.

4. Copy the role ARN (e.g. `arn:aws:iam::123456789012:role/github-actions-ecr`).

### 2.3 GitHub repository secrets

In **GitHub → Settings → Secrets and variables → Actions**, add:

| Secret            | Description                                      |
|-------------------|--------------------------------------------------|
| `AWS_ROLE_ARN`    | IAM role ARN for OIDC (e.g. `arn:aws:iam::...`)  |

Optional (if not using OIDC): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and set `AWS_REGION` in the workflow or as a variable.

Update the workflow file `.github/workflows/build-and-deploy.yml` if your region or ECR repo name differ (e.g. `ECR_REPOSITORY`, `AWS_REGION`).

### 2.4 Using Docker Hub instead of ECR

If you use **Docker Hub** instead of Amazon ECR for the chat-app image (this project’s image: **`sardarabdulwakeel/chat-app:latest`**):

1. **Build and push locally (or in CI):**
   ```bash
   docker build -t chat-app:latest .
   docker tag chat-app:latest sardarabdulwakeel/chat-app:latest
   docker login
   docker push sardarabdulwakeel/chat-app:latest
   ```
   To use a different Docker Hub username, replace `sardarabdulwakeel` with yours.

2. **In the Argo CD Application** ([argocd/application.yaml](argocd/application.yaml)): set `image.repository` to your Docker Hub image:
   - `sardarabdulwakeel/chat-app` or
   - `docker.io/sardarabdulwakeel/chat-app`

3. **If you want the GitHub Actions workflow to push to Docker Hub** instead of ECR, you would need to change `.github/workflows/build-and-deploy.yml` to:
   - Remove (or skip) the ECR login and push steps.
   - Add Docker Hub login using secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (use a Docker Hub access token, not your password).
   - Push to `YOUR_DOCKERHUB_USERNAME/chat-app:<tag>`.
   - Set `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`, and in the deploy step use `image.repository=sardarabdulwakeel/chat-app` (no `ECR_REGISTRY`).

4. **Image pull on EKS:** For a private Docker Hub repo, create a Kubernetes secret of type `docker-registry` in the `chat-app` namespace and reference it in the Helm chart or Deployment as `imagePullSecrets`. For public Docker Hub images, no secret is needed.

---

## Part 3: Install Argo CD on EKS

Run these from your Bastion (or wherever you have `kubectl` access to the EKS cluster).

### 3.1 Install Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Wait until all pods are ready:

```bash
kubectl get pods -n argocd -w
```

### 3.2 Expose Argo CD server (choose one)

**Option A – Port-forward (good for local/Bastion use):**

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Then open `https://localhost:8080` (accept the self-signed cert). Login user: `admin`. Password (see below).

**Option B – LoadBalancer (for team access):**

```bash
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'
kubectl get svc -n argocd argocd-server  # get EXTERNAL-IP
```

Use `https://<EXTERNAL-IP>` (ignore cert warning or configure TLS).

**Option C – Ingress (ALB/NLB):** Configure an Ingress for `argocd-server` with TLS; see Argo CD docs.

### 3.3 Get Argo CD admin password

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

Use username `admin` and this password to log in. Change it after first login if needed.

### 3.4 (Optional) Argo CD CLI on Bastion

```bash
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd && sudo mv argocd /usr/local/bin/
argocd login localhost:8080 --insecure
```

---

## Part 4: Deploy the Chat App with Argo CD

### 4.1 Replace placeholders in the repo

1. **Argo CD Application**  
   Edit `argocd/application.yaml`:
   - `spec.source.repoURL`: your GitHub repo URL (e.g. `https://github.com/YOUR_ORG/chat-app.git`).
   - `spec.source.path`: `helm/chat-app` (Helm chart).
   - Under `spec.source.helm.parameters`, set `image.repository` to your ECR URI (e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com/chat-app`), or to your **Docker Hub** image (e.g. `sardarabdulwakeel/chat-app`). The workflow overrides `image.tag` on each run.

2. **JWT secret**  
   Create the Kubernetes secret with a real JWT secret (do **not** commit this value):

   ```bash
   kubectl create namespace chat-app --dry-run=client -o yaml | kubectl apply -f -
   kubectl create secret generic chat-app-secret -n chat-app \
     --from-literal=JWT_SECRET=your-strong-random-secret \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

   If you use the chart's built-in secret, override via Argo CD:  
   `argocd app set chat-app --helm-set secret.jwtSecret=your-secret`

3. **GitHub Actions secrets** (for deploy + tag):  
   `AWS_ROLE_ARN`, `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`, `ECR_REGISTRY` (e.g. `123456789.dkr.ecr.us-east-1.amazonaws.com`).

### 4.2 Create the Argo CD Application from Bastion

From the repo root (or where `argocd/application.yaml` is):

```bash
kubectl apply -f argocd/application.yaml
```

Or with Argo CD CLI:

```bash
argocd app create -f argocd/application.yaml
```

### 4.3 Sync and verify

- In the Argo CD UI: open the `chat-app` application and click **Sync** (or enable **Auto-Sync** in the app spec).
- Or from Bastion:

  ```bash
  argocd app sync chat-app
  argocd app wait chat-app --health
  ```

Check that workloads are running:

```bash
kubectl get pods,svc -n chat-app
```

---

## Part 5: Expose the Chat App (optional)

The app runs as a `ClusterIP` service. To expose it:

### 5.1 Option A – AWS Load Balancer Controller (ALB Ingress)

1. Install the [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/) on the cluster (from Bastion or a machine with `kubectl`).
2. In this repo, uncomment the `ingress.yaml` in `k8s/kustomization.yaml` and apply/sync.
3. Argo CD will create the Ingress; the controller will create an ALB and you can use the ALB DNS name (or a CNAME) to reach the chat app.

### 5.2 Option B – Port-forward (quick test)

From Bastion:

```bash
kubectl port-forward -n chat-app svc/chat-app 3000:80
```

Then open `http://localhost:3000` (or the Bastion’s hostname if you’re connecting remotely).

### 5.3 Option C – Change Service to LoadBalancer

Change the chat-app `Service` in `k8s/deployment-app.yaml` from `ClusterIP` to `LoadBalancer`. Sync with Argo CD; Kubernetes will create an NLB/ELB and assign an external address.

---

## Part 6: End-to-end workflow (Helm, no Git commit, version tags)

1. **Code push** to `main` (or `master`) triggers **GitHub Actions**.
2. **Version**: workflow computes the next version from existing Git tags (`1.0.1`, `1.0.2`, …).
3. **HTML change (after checkout)**: workflow injects the version into `client/index.html` (e.g. `data-version` on `<body>`, title). This is only in the build context; **nothing is committed**.
4. **Build and push**: Docker image is built and pushed to **ECR** with tag equal to the version (e.g. `1.0.1`) and `latest`.
5. **Deploy to Argo CD**: workflow runs `argocd app set chat-app --helm-set image.tag=<version> --helm-set image.repository=<ECR_URI>` and `argocd app sync chat-app`. No Git commit.
6. **Tag in GitHub**: workflow creates a Git tag (e.g. `v1.0.1`) on the current commit and pushes it. The repo is tagged with the version number; no code or manifest is committed.

**Required GitHub secrets**: `AWS_ROLE_ARN`, `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`, `ECR_REGISTRY` (e.g. `123456789.dkr.ecr.us-east-1.amazonaws.com`).

---

## Part 7: Login to Bastion server and update using Argo CD CLI

Follow these steps to log into the Bastion and update (sync) the chat-app using the Argo CD CLI.

### 7.1 Log in to the Bastion server

**Option A – SSH (with key):**

```bash
ssh -i /path/to/your-key.pem ec2-user@<BASTION_PUBLIC_IP>
```

For Ubuntu Bastion, use `ubuntu` instead of `ec2-user`:

```bash
ssh -i /path/to/your-key.pem ubuntu@<BASTION_PUBLIC_IP>
```

**Option B – AWS SSM Session Manager (no SSH key):**

```bash
aws ssm start-session --target <BASTION_INSTANCE_ID> --region us-east-1
```

Get the instance ID from the EC2 console or:

```bash
aws ec2 describe-instances --filters "Name=tag:Name,Values=Bastion" --query "Reservations[].Instances[].InstanceId" --output text --region us-east-1
```

### 7.2 Configure kubectl on the Bastion (if not already done)

```bash
aws eks update-kubeconfig --region us-east-1 --name chat-app-cluster
kubectl get nodes
```

### 7.3 Expose Argo CD server and get the admin password

From the Bastion, Argo CD runs inside the cluster. Either use a LoadBalancer URL or port-forward:

**If Argo CD has a LoadBalancer:**

```bash
kubectl get svc -n argocd argocd-server
# Use the EXTERNAL-IP (e.g. https://<EXTERNAL-IP>)
```

**If using port-forward (in a separate terminal or background):**

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Argo CD server: https://localhost:8080
```

Get the admin password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
echo
```

### 7.4 Log in to Argo CD via CLI

Install the CLI on the Bastion if needed:

```bash
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd && sudo mv argocd /usr/local/bin/
```

**Login (interactive – use admin + password from 7.3):**

```bash
argocd login localhost:8080 --insecure
# Or with LoadBalancer:
# argocd login <ARGOCD_SERVER_EXTERNAL_IP> --insecure
```

**Login with token (non-interactive):**

```bash
ARGOCD_SERVER="localhost:8080"
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)
argocd login $ARGOCD_SERVER --insecure --username admin --password $ARGOCD_PASSWORD
```

### 7.5 Update the chat-app using Argo CD CLI

**Sync the app (deploy latest from Git):**

```bash
argocd app sync chat-app --insecure
```

**Set a specific image version and sync (e.g. after a new build):**

```bash
# Replace with your ECR registry and desired tag (e.g. 1.0.2)
ECR_REGISTRY="123456789012.dkr.ecr.us-east-1.amazonaws.com"
VERSION="1.0.2"

argocd app set chat-app \
  --helm-set image.repository="${ECR_REGISTRY}/chat-app" \
  --helm-set image.tag="${VERSION}" \
  --insecure

argocd app sync chat-app --insecure
```

**Wait until the app is healthy:**

```bash
argocd app wait chat-app --health --timeout 300 --insecure
```

**Check status:**

```bash
argocd app list --insecure
argocd app get chat-app --insecure
```

### 7.6 Quick reference – Bastion and Argo CD CLI

| Task                    | Command / step |
|-------------------------|----------------|
| Connect to Bastion      | `ssh -i key.pem ec2-user@<Bastion-IP>` or `aws ssm start-session --target <INSTANCE_ID>` |
| Configure kubectl      | `aws eks update-kubeconfig --region us-east-1 --name chat-app-cluster` |
| Get Argo CD password    | `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" \| base64 -d` |
| Login to Argo CD        | `argocd login localhost:8080 --insecure` (after port-forward) |
| Sync chat-app           | `argocd app sync chat-app --insecure` |
| Set image and sync      | `argocd app set chat-app --helm-set image.tag=1.0.2 --insecure` then `argocd app sync chat-app --insecure` |
| List apps               | `argocd app list --insecure` |
| App status              | `argocd app get chat-app --insecure` |
| Port-forward Argo CD    | `kubectl port-forward svc/argocd-server -n argocd 8080:443` |
| Port-forward chat app   | `kubectl port-forward -n chat-app svc/chat-app 3000:80` |

---

## Summary

- **EKS**: Cluster created with `eksctl`; optional Bastion in the same VPC for `kubectl` and `argocd`.
- **ECR**: Repository for the chat-app image; GitHub Actions pushes after each build.
- **Argo CD**: Installed in the cluster; syncs the `chat-app` application from the Git repo.
- **Bastion**: Single place to run `kubectl`, `argocd`, and (optionally) port-forwards to access Argo CD UI and the chat app.
- **GitOps**: Push code → GitHub Actions builds and pushes image and updates Git → Argo CD syncs to EKS.

For production, add TLS for Argo CD and the chat app, use a proper secrets manager for `JWT_SECRET`, and consider moving MongoDB/Redis to managed services (DocumentDB, ElastiCache) and connecting the app via ConfigMaps/Secrets.
