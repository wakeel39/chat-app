# Chat-app manifests (image: sardarabdulwakeel/chat-app:latest)

Deploy without Git clone or Helm. Apply in order (numeric prefix) or apply the whole directory.

## Apply all (recommended)

From the repo root (or from inside `manifests/`):

```bash
kubectl apply -f manifests/
```

Applying a directory uses alphabetical order; the `00-` to `10-` prefixes ensure the correct order.

## Apply individually

```bash
kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-configmap.yaml
kubectl apply -f 02-secret.yaml
kubectl apply -f 05-pvc-mongo.yaml
kubectl apply -f 08-pvc-redis.yaml
kubectl apply -f 03-deployment-chat-app.yaml
kubectl apply -f 06-deployment-mongo.yaml
kubectl apply -f 09-deployment-redis.yaml
kubectl apply -f 04-service-chat-app.yaml
kubectl apply -f 07-service-mongo.yaml
kubectl apply -f 10-service-redis.yaml
```

## Files

| File | Resource(s) |
|------|-------------|
| 00-namespace.yaml | Namespace `chat-app` |
| 01-configmap.yaml | ConfigMap (PORT, MONGO_URI, REDIS_URL) |
| 02-secret.yaml | Secret (JWT_SECRET) |
| 03-deployment-chat-app.yaml | Chat app Deployment |
| 04-service-chat-app.yaml | Chat app Service (NodePort 30080) |
| 05-pvc-mongo.yaml | MongoDB PVC |
| 06-deployment-mongo.yaml | MongoDB Deployment |
| 07-service-mongo.yaml | MongoDB Service |
| 08-pvc-redis.yaml | Redis PVC |
| 09-deployment-redis.yaml | Redis Deployment |
| 10-service-redis.yaml | Redis Service |

## Single-file option

`chat-app-from-image.yaml` is an all-in-one manifest. Use it for a single URL deploy:

```bash
kubectl apply -f https://raw.githubusercontent.com/wakeel39/chat-app/main/manifests/chat-app-from-image.yaml
```
