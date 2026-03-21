# EC2: “refused to connect” on port 3000 (Kind + chat-app)

`http://ec2-35-173-185-92.compute-1.amazonaws.com:3000` shows **refused to connect** when **nothing is listening on TCP 3000 on the EC2 host**, or the path from the internet is blocked.

## 1. Security group (most common from outside)

In **EC2 → instance → Security → Security groups**:

- Add **inbound** rule: **TCP**, port **3000**, source **your IP** or `0.0.0.0/0` (testing only).

“Refused” can still happen if the port is closed on the host; if the SG **drops** packets you often see **timeout** instead. Fix SG first anyway.

## 2. Kind cluster must be created **with** port mapping

Port **3000** on the EC2 host only appears if Kind was created using  
[`kind/kind-config-ec2-public-3000.yaml`](../kind/kind-config-ec2-public-3000.yaml).

```bash
# If you already have a cluster WITHOUT this config, delete and recreate:
kind delete cluster --name chat-app
kind create cluster --name chat-app --config kind/kind-config-ec2-public-3000.yaml
```

Then redeploy/sync the app so the Service is **NodePort 30080** (see `argocd/application-kind.yaml`).

## 3. Prove something listens on 3000 **on the EC2 instance**

SSH to the instance:

```bash
# Should show LISTEN on 0.0.0.0:3000 or *:3000 (from Docker publishing the Kind node)
sudo ss -tlnp | grep 3000

# Should return HTTP from the app (or a redirect/HTML)
curl -v --max-time 5 http://127.0.0.1:3000/
```

- If **curl fails** on localhost → Kind mapping or Service is wrong; fix cluster + `kubectl get svc -n chat-app chat-app` (expect `80:30080/TCP` and `NodePort`).
- If **curl works** on EC2 but **browser from laptop fails** → security group or corporate firewall.

## 4. Docker should publish port 3000

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -E 'kind|3000'
```

You should see something like `0.0.0.0:3000->30080/tcp` on the Kind **control-plane** container.

## 5. OS firewall on EC2

If `ss` shows `127.0.0.1:3000` only, check Kind config has `listenAddress: "0.0.0.0"` (already set in this repo’s config).

If you use **firewalld** / **ufw**, allow 3000/tcp.

## 6. Use **http** not **https**

Open:

`http://ec2-35-173-185-92.compute-1.amazonaws.com:3000`

(not `https://` unless you have TLS in front).

## 7. Argo CD: Service type must be NodePort

```bash
kubectl get svc -n chat-app chat-app -o wide
```

Expected: `TYPE` = `NodePort`, `PORT(S)` includes **30080**.

If you still see **`ClusterIP`** (only `80/TCP`), the live app is **out of sync** with `argocd/application-kind.yaml`. Fix it one of these ways:

### A) Argo CD (preferred)

Re-apply the manifest from Git (fix `targetRevision` if needed), then:

```bash
argocd app set chat-app \
  --helm-set service.type=NodePort \
  --helm-set service.nodePort=30080 \
  --insecure
argocd app sync chat-app --insecure
```

The **deploy-new** workflow also sets `service.type` / `service.nodePort` so future runs enforce NodePort.

### B) Immediate patch on the cluster (no Argo)

```bash
kubectl patch svc chat-app -n chat-app --type='merge' -p '{
  "spec": {
    "type": "NodePort",
    "ports": [
      { "port": 80, "targetPort": 3000, "protocol": "TCP", "nodePort": 30080 }
    ]
  }
}'
```

Then confirm: `kubectl get svc -n chat-app chat-app`

## Quick checklist

| Check | OK |
|--------|-----|
| SG inbound TCP 3000 | |
| `kind create cluster ... --config kind/kind-config-ec2-public-3000.yaml` | |
| `curl http://127.0.0.1:3000/` works on EC2 | |
| `kubectl get svc -n chat-app chat-app` → NodePort **30080** | |

After that, the public URL should load the chat UI.
