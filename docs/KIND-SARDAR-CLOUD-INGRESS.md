# Kind on EC2 + `sardar.cloud` + Ingress (API gateway / load balancing)

The Helm chart deploys:

- **Ingress** (`chat.sardar.cloud`) — HTTP entry; **ingress-nginx** routes traffic to the `chat-app` Service (L7 load balancing across pods).
- **HorizontalPodAutoscaler** — scales `chat-app` replicas between **min** and **max** based on CPU/memory (needs **metrics-server**).

## 1. DNS (Route 53 or your registrar)

Create a record pointing to your **EC2 public IP**:

| Type | Name            | Value        |
|------|-----------------|-------------|
| A    | `chat`          | `<EC2 IPv4>` |

So **`http://chat.sardar.cloud`** resolves to the instance.

## 2. EC2 security group

Allow inbound:

- **TCP 80** — HTTP (ingress-nginx on host port 80)
- **TCP 443** — optional, if you add TLS later

## 3. Install metrics-server (required for HPA)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

On Kind, patch the deployment to trust the kubelet (example):

```bash
kubectl patch deployment metrics-server -n kube-system --type='json' \
  -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'
```

Wait until `kubectl top nodes` works.

## 4. Install ingress-nginx (API gateway / ingress controller)

Use **NodePort** values that match the Kind port mapping (**30080** for HTTP):

```bash
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080 \
  --set controller.service.nodePorts.https=30443 \
  --set controller.ingressClassResource.name=nginx \
  --set controller.ingressClassResource.controllerValue="k8s.io/ingress-nginx"
```

## 5. Create the Kind cluster with host port 80

Use the repo config so **EC2:80** forwards to the node’s **30080** (where ingress-nginx listens):

```bash
kind create cluster --name chat-app --config kind/kind-config-sardar-cloud-ingress.yaml
```

If a cluster already exists **without** this mapping, recreate the cluster or add equivalent port publishing.

## 6. Deploy the app (Argo CD or Helm)

Sync **`argocd/application-kind.yaml`** — it enables **Ingress** for `chat.sardar.cloud`, **ClusterIP** Service, and **HPA** (see inline `helm.values`).

## 7. Verify

```bash
kubectl get ingress -n chat-app
kubectl get hpa -n chat-app
curl -sI -H "Host: chat.sardar.cloud" http://127.0.0.1/
```

From your laptop: open **`http://chat.sardar.cloud`**.

### Socket.io and multiple replicas

With **HPA** > 1 pod, this chart sets **nginx cookie affinity** on the Ingress so WebSocket sessions stay on one pod. If you still see sticky issues, keep `maxReplicas` at 1 until you add Redis adapter for Socket.io.

## Optional: TLS (HTTPS)

Use **cert-manager** + Let’s Encrypt, or terminate TLS on an **AWS ALB** in front of EC2. The chart sets `ingress.tls: false` by default; enable TLS in Helm values when you have a `Secret` or cert-manager `Certificate`.
