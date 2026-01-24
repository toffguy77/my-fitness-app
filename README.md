# BURCEV - Development Environment

Clean development environment with full CI/CD infrastructure.

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Deployment

- **dev**: dev.burcev.team (port 3071)
- **staging**: beta.burcev.team (port 3070)
- **production**: burcev.team (port 3069)

## CI/CD

All CI/CD pipelines, quality gates, security scanning, and deployment automation are configured and ready to use.

See `.github/workflows/` for pipeline configurations.

## Docker

```bash
# Build and deploy
make deploy

# View logs
make logs

# Update from git
make update
```

## Environment Variables

Copy `deploy/env/.env.dev.example` to your deployment server as `.env.dev` and configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Other optional variables as needed
