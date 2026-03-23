# LinkedIn post (copy & paste)

---

**Building a real-time chat app wasn’t the hard part — shipping it like a product was.**

I’ve been working on a **Node.js + Socket.io** chat app (Express, MongoDB, Redis, JWT) and took it all the way through a **DevOps pipeline** I’m proud to share:

- **Containerised** builds and **Docker Hub** images  
- **GitHub Actions** for versioning, releases, and automated deploys  
- **Helm** charts for the full stack (app + Mongo + Redis)  
- **Argo CD** for GitOps — sync status, rollouts, and staying true to what’s in Git  
- **Kubernetes on Kind** (and paths for **EKS**) — HPA, Ingress, and thinking about scale before you need it  

The messy middle taught me the most: fixing **sync** issues, **target revisions** vs image tags, **ClusterIP vs NodePort vs Ingress**, and why **metrics-server** matters for autoscaling.

If you’re leveling up from “it works on my machine” to “it runs in the cluster,” start with one thing: **one source of truth in Git** and let your pipeline prove it every time.

What’s your favourite piece of the stack — **Helm**, **Argo CD**, or **GitHub Actions**? Drop it below.

`#DevOps` `#Kubernetes` `#GitOps` `#ArgoCD` `#Helm` `#GitHubActions` `#Docker` `#CloudComputing` `#SoftwareEngineering` `#FullStack`

---

*Tip: Add 1–3 screenshots from this repo’s `docs/screenshots/` (see README) when you post — Argo CD UI and architecture diagrams get strong engagement.*
