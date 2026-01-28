# QStash Local Development Guide

## Problem

QStash is a cloud-based message queue service that requires publicly accessible webhook URLs to deliver messages. When running the application locally with `APP_URL=http://localhost:3000`, QStash cannot reach your local server, resulting in the error:

```
Failed to enqueue generation job: Error: QStash enqueue failed: 400 - 
{"error":"invalid destination url: endpoint has invalid scheme, add http:// or https://"}
```

## Root Cause

- QStash runs in the cloud and needs to make HTTP callbacks to your application
- `localhost` URLs are not accessible from the internet
- QStash validates that destination URLs are publicly reachable

## Solutions

### Option 1: Local Development Mode (Recommended for Development)

**Status**: ✅ Already implemented

The application now automatically detects when running in local development mode and bypasses QStash entirely, processing jobs immediately instead.

**How it works**:
- When `NODE_ENV=development` and `APP_URL` contains `localhost`
- Jobs are processed synchronously by calling the worker endpoint directly
- No QStash configuration needed for local development

**Configuration**:
```bash
# .env.local
NODE_ENV=development
APP_URL=http://localhost:3000
```

**Advantages**:
- ✅ No additional setup required
- ✅ Faster feedback during development
- ✅ No external dependencies
- ✅ Works offline

**Disadvantages**:
- ❌ Doesn't test actual queue behavior
- ❌ Jobs run synchronously (no background processing)

### Option 2: Use ngrok for Public Tunnel

Create a public tunnel to your localhost for testing with real QStash.

**Setup**:
1. Install ngrok: `brew install ngrok` (macOS) or download from https://ngrok.com
2. Start your dev server: `npm run dev`
3. In another terminal, create tunnel: `ngrok http 3000`
4. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
5. Update `.env.local`:
   ```bash
   APP_URL=https://abc123.ngrok.io
   ```
6. Restart your dev server

**Advantages**:
- ✅ Tests real QStash behavior
- ✅ Tests webhook callbacks
- ✅ Simulates production environment

**Disadvantages**:
- ❌ Requires ngrok installation
- ❌ URL changes on each restart (unless using paid plan)
- ❌ Requires internet connection

### Option 3: Deploy to Vercel/Production

Deploy your application to a public URL for testing.

**Setup**:
1. Push your code to GitHub
2. Deploy to Vercel: `npm run deploy` or use Vercel dashboard
3. Get your deployment URL (e.g., `https://your-app.vercel.app`)
4. Update environment variables in Vercel dashboard:
   ```bash
   APP_URL=https://your-app.vercel.app
   NODE_ENV=production
   ```

**Advantages**:
- ✅ Production-like environment
- ✅ Persistent URL
- ✅ Tests full deployment pipeline

**Disadvantages**:
- ❌ Slower iteration cycle
- ❌ Requires deployment for each test
- ❌ Uses production resources

## Implementation Details

### Local Development Mode

The local development mode is implemented in [`lib/queue/enqueue.ts`](../lib/queue/enqueue.ts):

```typescript
// Detect local development
if (config.NODE_ENV === 'development' && config.APP_URL.includes('localhost')) {
  console.log('[Queue] Local development mode: processing job immediately');
  
  // Call worker endpoint directly
  const workerUrl = `${config.APP_URL}/api/worker/generate`;
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Local-Dev': 'true', // Skip signature verification
    },
    body: JSON.stringify(job),
  });
  
  return `local-${job.jobId}`;
}
```

The worker endpoint ([`app/api/worker/generate/route.ts`](../app/api/worker/generate/route.ts)) skips signature verification in local mode:

```typescript
const isLocalDev = request.headers.get('X-Local-Dev') === 'true';
const skipSignature = config.NODE_ENV === 'development' && isLocalDev;

if (!skipSignature && !verifySignature(request, body)) {
  // Reject invalid signature
}
```

## Recommended Workflow

1. **Local Development**: Use local mode (Option 1) for rapid iteration
2. **Integration Testing**: Use ngrok (Option 2) to test QStash integration
3. **Production**: Deploy to Vercel (Option 3) with proper APP_URL

## Troubleshooting

### Jobs not processing in local mode

Check console output for:
```
[Queue] Local development mode: processing job immediately (bypassing QStash)
```

If you don't see this, verify:
- `NODE_ENV=development` in `.env.local`
- `APP_URL=http://localhost:3000` in `.env.local`

### QStash still being called in local mode

Ensure you've restarted the dev server after updating environment variables:
```bash
# Stop the server (Ctrl+C)
npm run dev
```

### Worker endpoint returns 401 in local mode

The `X-Local-Dev` header should be set automatically. If you're calling the worker endpoint manually, add:
```bash
curl -X POST http://localhost:3000/api/worker/generate \
  -H "Content-Type: application/json" \
  -H "X-Local-Dev: true" \
  -d '{"type":"generation",...}'
```

## Production Checklist

Before deploying to production, ensure:

- [ ] `APP_URL` is set to your public domain (e.g., `https://your-app.vercel.app`)
- [ ] `NODE_ENV=production`
- [ ] QStash credentials are configured (`QSTASH_URL`, `QSTASH_TOKEN`, signing keys)
- [ ] Worker endpoint is publicly accessible
- [ ] Webhook callbacks are working (test with a generation)

## Additional Resources

- [QStash Documentation](https://upstash.com/docs/qstash)
- [ngrok Documentation](https://ngrok.com/docs)
- [Vercel Deployment Guide](https://vercel.com/docs)
