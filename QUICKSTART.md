# Quick Start Guide

## Initial Setup (One-time)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Cloudflare KV namespace** (required for storing research results):
   ```bash
   wrangler kv:namespace create RESEARCH_CACHE
   wrangler kv:namespace create RESEARCH_CACHE --preview
   ```
   
   Copy the `id` and `preview_id` from the output and update them in `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "RESEARCH_CACHE"
   id = "YOUR_PRODUCTION_ID_HERE"
   preview_id = "YOUR_PREVIEW_ID_HERE"
   ```

3. **Login to Cloudflare** (if not already logged in):
   ```bash
   wrangler login
   ```

## Running Locally

### Option 1: Frontend Only (Next.js)
For UI development without backend functionality:
```bash
npm run dev
```
Opens at `http://localhost:3000`

**Note:** API calls won't work without the worker running.

### Option 2: Full Stack (Recommended)
You'll need **two terminal windows**:

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - Backend Worker:**
```bash
npm run dev:worker
```

The worker will run on a Cloudflare dev URL (e.g., `http://localhost:8787`).

**Important:** Update the API calls in `app/page.tsx` to use the worker URL during local development, or set up a proxy.

## Building for Production

1. **Build Next.js app:**
   ```bash
   npm run build
   ```

2. **Deploy to Cloudflare:**
   ```bash
   npm run deploy
   ```

This will deploy both the Worker (with API endpoints) and the static Next.js frontend.

## Troubleshooting

- **"Module not found" errors**: Run `npm install` again
- **KV namespace errors**: Make sure you've created the KV namespace and updated `wrangler.toml`
- **API calls failing locally**: Make sure the worker is running with `npm run dev:worker`

