# Coded Portugol to Python Converter

An educational IDE designed to help students transition from Portugol to Python through real-time code translation and step-by-step visual execution. Built natively with React.

## Run Locally (or in GitHub Codespaces)

**Prerequisites:** Node.js

### 🛠️ Quick Setup (Recommended)

Run the all-in-one setup script:

```bash
chmod +x setup.sh && ./setup.sh
```

### Manual Setup

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Deploy to GitHub Pages

This repository is configured for GitHub Pages at `port-to-py.github.io`.
The build uses relative asset paths so the same deployment also works if GitHub Pages serves it from a repository subpath.

1. Push your changes to `main`.
2. In GitHub, open `Settings` > `Pages`.
3. Set `Build and deployment` to `GitHub Actions`.
4. The workflow in `.github/workflows/deploy.yml` will build and publish the app automatically.
5. The `public/CNAME` file keeps the Pages custom domain aligned with `port-to-py.github.io`.
