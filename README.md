# Scripture Journal

A web-based journaling tool that preserves source content (LDS Standard Works and imported articles) and lets users attach block-level annotations tied to specific verses or paragraphs.

## Quick Start

### Prerequisites
- Node.js 22.x
- npm
- AWS CLI configured (for deployment)

### Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your configuration
   ```

3. **Start development servers:**
   ```bash
   npm run dev
   ```
   This runs both the Vite frontend dev server and the Node.js backend API server concurrently.

4. **Open in browser:**
   Navigate to `http://localhost:5173` (or the port shown in the terminal)

## Available Commands

### Development
- `npm run dev` — Start frontend (Vite) and backend (Node.js) dev servers concurrently
- `npm run dev:api` — Start only the backend API server
- `npm run dev:vite` — Start only the frontend dev server

### Building
- `npm run build` — Build frontend for production (Vite)
- `npm run build:lambda` — Build Lambda handler bundle

### Testing
- `npm test` — Run unit tests in watch mode
- `npm run test:run` — Run unit tests once
- `npm run test:coverage` — Run unit tests with coverage report
- `npm run test:e2e` — Run end-to-end tests (headless)
- `npm run test:e2e:headed` — Run E2E tests in headed browser mode
- `npm run test:e2e:ui` — Run E2E tests in Playwright UI mode

### Code Quality
- `npm run typecheck` — Run TypeScript type checking
- `npm run lint` — Run ESLint
- `npm run format` — Format code with Prettier

### Data Management
- `npm run create-user` — Create a new user account (local dev)
- `npm run create-user:deployed` — Create a new user account (deployed environment)
- `npm run ingest-scripture` — Import scripture content (local dev)
- `npm run ingest-scripture:deployed` — Import scripture content (deployed environment)

## Project Structure

```
scripture-journal/
├── src/
│   ├── config/              # Environment configuration
│   ├── handler/             # Lambda function handlers (HTTP endpoints)
│   ├── repository/          # S3 I/O layer (data access)
│   ├── service/             # Business logic
│   ├── types/               # Zod schemas and TypeScript types
│   ├── ui/                  # React frontend
│   │   ├── components/      # Reusable React components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utilities (auth context, API client)
│   │   └── pages/           # Page components
│   └── __tests__/           # Unit tests
├── e2e/                     # End-to-end tests (Playwright)
├── infra/                   # Terraform infrastructure code
├── scripts/                 # Utility scripts (user creation, data import)
├── docs/                    # Documentation and architecture decision records
└── constitution.md          # Project standards and architecture rules
```

## Technology Stack

### Frontend
- **React 18** — UI framework
- **Vite** — Build tool and dev server
- **TanStack Query** — Server state management
- **Tailwind CSS** — Styling
- **React Router** — Client-side routing
- **TypeScript** — Type safety

### Backend
- **Node.js 22.x** — Runtime
- **Hono** — Lightweight HTTP framework for Lambda
- **AWS Lambda** — Serverless compute
- **Zod** — Input validation

### Data Storage
- **AWS S3** — Content storage (immutable, content-addressed)
- **CloudFront** — Edge caching and CDN

### Authentication
- **bcryptjs** — Password hashing
- **jose** — JWT signing and verification

### Testing
- **Vitest** — Unit test framework
- **React Testing Library** — Component testing
- **Playwright** — End-to-end testing
- **aws-sdk-client-mock** — AWS service mocking

### Infrastructure
- **Terraform** — Infrastructure as Code (HCL)
- **AWS** — Cloud provider (us-east-1)

## Architecture

The codebase follows a layered architecture with unidirectional dependencies:

```
Types → Config → Repository → Service → Handler → API → UI
```

- **Types**: Zod schemas and TypeScript interfaces
- **Config**: Environment and application configuration
- **Repository**: S3 data access with optimistic concurrency control
- **Service**: Business logic (auth, entries, content import)
- **Handler**: Lambda function handlers and route definitions
- **API**: Lambda Function URL configuration and middleware
- **UI**: React components and pages

See [constitution.md](./constitution.md) for complete architecture details.

## Storage

All data is stored in S3 using content-addressed JSON files:

```
s3://{bucket}/
├── content/
│   ├── scripture/{work}/{book}/{chapter}.json
│   └── articles/{sha256}.json
├── users/{userId}/
│   ├── profile.json
│   ├── entries/{entryId}.json
│   └── index.json
└── auth/
    └── users-by-name.json
```

Writes use S3 conditional requests (`If-Match`/`If-None-Match`) for optimistic concurrency.

## Testing

### Unit Tests
Run tests for business logic and API handlers:
```bash
npm run test:run
npm run test:coverage  # With coverage report
```

### End-to-End Tests
Full browser-based tests of user workflows:
```bash
npm run test:e2e        # Headless
npm run test:e2e:ui     # Interactive UI
```

## Deployment

### Infrastructure
Infrastructure is managed with Terraform in the `infra/` directory. See [infra/README.md](./infra/README.md) for details.

### CI/CD
GitHub Actions automatically runs `terraform apply` on merges to main.

### Environment Variables
- **Local development**: `.env.local`
- **Deployed**: Environment variables set in AWS Parameter Store and Lambda environment

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run tests: `npm run test:run && npm run test:e2e`
4. Format code: `npm run format && npm run lint`
5. Type check: `npm run typecheck`
6. Submit a pull request

See [constitution.md](./constitution.md) for code standards and [AGENTS.md](./AGENTS.md) for AI agent guidelines.

## License

Private project. See [constitution.md](./constitution.md) for project details.
