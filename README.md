# Arkad API Documentation

Welcome to the Arkad API documentation. Here you'll find information about how to setup the development environment and the set of endpoints that the API provides.

## Table of Contents

- [`Setup`](#setup)
  - [`Prerequisites`](#prerequisites)
  - [`Development Setup`](#development-setup)
  - [`Production Setup`](#production-setup)
- [`Testing`](#testing)
- [`Modules`](#modules)
- [`Contributing`](#contributing)

## Setup
<a name="setup"></a>

### Prerequisites
<a name="prerequisites"></a>

You can run this project in two ways:

**Option 1: Docker (Recommended)**
- Docker
- Git

**Option 2: Local Development**
- Node.js (v18+ recommended)
- PostgreSQL
- Git

### Development Setup
<a name="development-setup"></a>

#### Using Docker (Recommended)

1. **Clone the repository**
   
    When cloning the repository, you must do it via `SSH` in order to be able to push changes to the repository. If you don't know how to create a `SSH` key follow this [guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent).
    
    ```bash
    git clone git@github.com:djromerom/gamerlab_back_2295_2.git
    cd gamerlab_back_2295_2
    ```

2. **Create environment file**
   
    Create a `.env` file at the root of the project:
    ```
    gamerlab_back_2295_2/
    ├── .env
    ├── package.json
    ├── docker-compose.yml
    ├── docker-compose.dev.yml
    └── ...
    ```
    Then copy the `.env.example` file template, and update the variables. You can find the environment variable explanation in [Environment Variables](#environment-variables).
    
 
3. **Start development environment**
    Make sure the Docker service is running before running these commands.
    ```bash
    # Start everything (database + migrations + seeding + app with hot reload)
    docker compose -f docker-compose.dev.yml up

    # Or start in detached mode
    docker compose -f docker-compose.dev.yml up -d

    # View logs
    docker compose -f docker-compose.dev.yml logs -f app-dev
    ```

4. **Development workflow**-
    The development setup includes hot reload. Code changes restart the server automatically.

    **Useful commands:**
    ```bash
    # Stop everything
    docker compose -f docker-compose.dev.yml down

    # Reset database (warning: deletes all data)
    docker compose -f docker-compose.dev.yml down -v
    docker compose -f docker-compose.dev.yml up

    # Start only database (if you want to run the app locally)
    docker compose -f docker-compose.dev.yml up db
    ```

#### Local Development (Alternative)

If you prefer to run without Docker:

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Setup PostgreSQL database locally**
    Update your `.env` with your local database:
    ```env
    DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<database>"
    ```

3. **Generate Prisma client and run migrations**
    ```bash
    npx prisma generate
    npx prisma migrate dev
    npm run db:seed
    ```

4. **Start development server**
    ```bash
    npm run start:dev
    ```

### Production Setup
<a name="production-setup"></a>

For production deployment:

1. **Clone and setup environment**
    ```bash
    git clone git@github.com:djromerom/gamerlab_back_2295_2.git
    cd gamerlab_back_2295_2
    # Create .env with production values
    ```

2. **Deploy with Docker**
    ```bash
    # Build and start production environment
    docker compose up --build -d

    # View logs
    docker compose logs -f app

    # Stop
    docker compose down
    ```

### Environment Variables

Let's break down the environment variables:

- **`FRONTEND_URL`**: Base URL of your frontend for CORS configuration
- **`NODE_ENV`**: Environment (`development` or `production`)
- **`PORT`**: Port for the API server (default: 3000)
- **`DATABASE_URL`**: PostgreSQL connection string
- **`JWT_SECRET`**: Secret key for JWT token signing
- **`ACCESS_TOKEN_EXPIRATION_MINUTES`**: Expiration time in minutes for access tokens (default: 15)
- **`REFRESH_TOKEN_EXPIRATION_DAYS`**: Expiration time in days for refresh tokens (default: 7)
- **`REGISTRATION_TOKEN_EXPIRATION`**: Token expiration time in hours for email verification (default: 24)
- **`USER_PROFILE_CACHE_TTL`**: Cache time-to-live for user profiles in minutes (default: 15)
- **`RECAPTCHA_*`** Google ReCAPTCHA configuration for signup form
- **`ACS_CONNECTION_STRING`** / **`ACS_SENDER_ADDRESS`**: Azure Communication Services credentials and verified sender address for confirmation, password reset, team and certificate emails. If missing, emails are only simulated when `NODE_ENV=development`; in any other environment sending fails with 503
- **`AZURE_*`**: Azure Blob Storage configuration (`AZURE_BLOB_SAS_URL`, `AZURE_ACCOUNT_NAME`, `AZURE_ACCOUNT_KEY`, `AZURE_CONTAINER`) for file uploads
- **`TRUST_PROXY`**: Set it when the API runs behind a reverse proxy or load balancer (for example `1` for one proxy hop). Without it every request looks like it comes from the proxy's IP, and all users share one rate limit (see [Rate limiting](#rate-limiting)).

**Note:** If you're part of the development team, you can ask for these keys from the team lead.

### Rate limiting
<a name="rate-limiting"></a>

Some public routes have a per-IP request limit (`@nestjs/throttler`): `POST /upload`, `POST /upload/zip` and `POST /teams/validate-emails`. The limits are defined in `src/common/throttle/public-throttle.ts`; a client that exceeds one gets `429 Too Many Requests`.

> **Warning: the counters are kept in memory, per process.**
> - Restarting or redeploying the container resets them.
> - They are **not shared between replicas**. With more than one instance of the API, each one counts separately, so the effective limit is multiplied by the number of replicas.
>
> This is fine for the current deployment (a single container). Before scaling the API horizontally, move the counters to a shared store such as Redis.

Behind a proxy, also set `TRUST_PROXY` so the limit applies to each user's IP and not to the proxy.

## Testing
<a name="testing"></a>

Tests use **Jest** with `ts-jest`. Unit tests (`*.spec.ts`) live next to the code they test; integration tests live in `test/`.

### Unit tests

They mock `PrismaService`, so they need no database or `.env`.

```bash
# All unit tests
npm test

# One file or folder
npx jest src/evaluation/evaluation.service.spec.ts
npx jest src/juror

# Same command as CI (sequential, with coverage report in coverage/)
npm run test:ci
```

### Integration tests

They run against a real PostgreSQL and **skip themselves** when no database is configured, so `npm test` stays green without one:

| Tests | Run when |
|---|---|
| `test/*.e2e-spec.ts` (`npm run test:e2e`) | `INTEGRATION_DATABASE_URL` is set |
| `src/**/*.db.spec.ts` | `RUN_DB_TESTS=1` (uses `DATABASE_URL`) |

> **Warning:** point them only to a **disposable** database. They create and delete their own rows, but never use your development or a shared database.

The database needs the migrations and the seed applied. Example with a throwaway container (bash):

```bash
docker run -d --rm --name arkad_test_db -e POSTGRES_USER=arkad -e POSTGRES_PASSWORD=arkad -e POSTGRES_DB=arkad_test -p 5440:5432 postgres:15-alpine

export DATABASE_URL=postgresql://arkad:arkad@localhost:5440/arkad_test
export INTEGRATION_DATABASE_URL=$DATABASE_URL
export NODE_ENV=test
npx prisma migrate deploy
npm run db:seed

npm run test:e2e -- --runInBand
RUN_DB_TESTS=1 npx jest --testPathPattern "\.db\.spec\.ts$"

docker stop arkad_test_db
```

### Continuous integration

The `Test-back` workflow (`.github/workflows/test-back.yml`) runs on every pull request to `dev` and `main`, and the pull request fails if any test fails:

- **`test-build`**: `npm run build`, lint (not blocking yet) and `npm run test:ci`.
- **`integration`**: starts a disposable PostgreSQL 15, applies the migrations and the seed, and runs the integration tests.

## Modules
<a name="modules"></a>

This API uses **Swagger/OpenAPI** for comprehensive endpoint documentation. 

### API Documentation

**Access the complete API documentation at:** `http://localhost:3000/api`

### Available Modules

- **Auth** - User authentication, login, logout, token refresh
- **Upload** - File upload to Azure Blob Storage with metadata management
- **Users** - User profile management and administration
- **Teams** - Team creation and member management
- **Videogames** - Game submission and evaluation system
- **Evaluations** - Jury evaluation and scoring system

Among others. Feel free to checkout Swagger for detailed information on each one.

### Quick Start with Swagger

1. **Start the development server:**
   ```bash
   docker compose -f docker-compose.dev.yml up
   ```

2. **Open Swagger documentation:**
   ```
   http://localhost:3000/api
   ```

3. **Authenticate (for protected endpoints):**
   - Use the `/auth/login` endpoint to get your session tokens
   - Save these tokens on the Authorize menu on the top right to use them as cookies

4. **Test endpoints:**
   - Click "Try it out" on any endpoint
   - Fill in the required parameters
   - Click "Execute" to see the response

## Contributing
<a name="contributing"></a>
To contribute code to the project, please follow the [CONTRIBUTING.md](CONTRIBUTING.md) guidelines

### Development Workflow

1. Create a branch from `dev` (see `BRANCHING.md` for naming)
2. Make your changes
3. Test with the development Docker setup
4. Submit a pull request

### Database Changes

When making database schema changes:

1. Update `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name your-migration-name`
3. Update `prisma/seed-data.json` if needed
4. Test the migration with `docker-compose -f docker-compose.dev.yml up --build`