# Cloudisy Server

A backend server project built with a **stable-first development workflow**.  
This system ensures safe development, controlled feature rollout, and reliable rollback using Git branches and tags.

---

## ⚠️ Core Philosophy

This project follows a strict stable-first workflow:

- `stable_dev_v1` → **Stable production base (DO NOT EDIT DIRECTLY)**
- `feature/*` → All development happens here
- `main` → Optional sync branch (can mirror stable)

👉 All new work must start from `stable_dev_v1`.

---

## 🚀 Quick Setup (Recommended Shortcut)

Clone the repository and immediately switch to the stable base:

```bash
git clone https://github.com/<user>/<repo>.git
cd <repo>
```

```bash
# fetch all branches
git fetch origin
```

```bash
# switch to stable base (safe working version)
git checkout -b stable_dev_v1 origin/stable_dev_v1
```

```bash
git checkout stable_dev_v1
git checkout -b feature/my-feature
```

