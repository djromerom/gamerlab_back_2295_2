# Contributing to Arkad API

First off, thank you for considering contributing to the Arkad API! We welcome contributions from the community. This document provides guidelines for contributing to the project effectively.

## Table of Contents

-   [`Getting Started`](#getting-started)
-   [`Core Concepts: NestJS Structure`](#core-concepts-nestjs-structure)
    -   [`Modules`](#modules)
    -   [`Controllers`](#controllers)
    -   [`Services`](#services)
-   [`Development Workflow`](#development-workflow)
-   [`Authentication & Authorization`](#authentication--authorization)
    -   [`Default Protection`](#default-protection)
    -   [`Public Endpoints (`@Public`)](#public-endpoints-public)
    -   [`Permission-Based Authorization (@UseGuards, @RequiredService)`](#permission-based-authorization-useguards-requiredservice)
-   [`Database Conventions: Soft Deletes`](#database-conventions-soft-deletes)
-   [`Data Transfer Objects (DTOs) & Validation`](#data-transfer-objects-dtos--validation)
-   [`Common commands`](#commands)
- [`Pushing Changes`](#pushing-changes)

## Getting Started
<a name="getting-started"></a>

Before contributing, please ensure you have reviewed the main `README.md` file for instructions on setting up the project environment, installing dependencies, and running the application locally.

## Core Concepts: NestJS Structure
<a name="core-concepts-nestjs-structure"></a>

This project follows the standard modular architecture promoted by NestJS. Understanding the roles of Modules, Controllers, and Services is crucial:

### Modules
<a name="modules"></a>
-   **Purpose:** Organize the application structure. Each module encapsulates a closely related set of capabilities (e.g., `AuthModule`, `UsersModule`, `TeamsModule`).
-   **File:** Typically `*.module.ts` (e.g., `auth.module.ts`).
-   **Decorated with:** `@Module({...})`.
-   **Responsibilities:**
    -   `imports`: Define other modules required by this module.
    -   `controllers`: List the controllers belonging to this module.
    -   `providers`: List the services (and other providers like Guards, Strategies, Repositories) that should be instantiated by the NestJS injector and made available within this module.
    -   `exports`: Specify providers from this module that should be available to other modules that import this one.
-   The `AppModule` (`app.module.ts`) is the root module of the application.

### Controllers
<a name="controllers"></a>

-   **Purpose:** Handle incoming HTTP requests, delegate business logic to services, and return responses to the client. Controllers should be kept lean.
-   **File:** Typically `*.controller.ts` (e.g., `auth.controller.ts`).
-   **Decorated with:** `@Controller('route-prefix')` (e.g., `@Controller('auth')`). Endpoint methods are decorated with `@Get()`, `@Post()`, `@Patch()`, `@Delete()`, etc.
-   **Responsibilities:**
    -   Define API routes and HTTP methods.
    -   Extract data from requests (path params, query params, body, headers, cookies) using decorators like `@Param()`, `@Query()`, `@Body()`, `@Headers()`, `@Req()`.
    -   Validate incoming data (typically via DTOs and `ValidationPipe`).
    -   Call methods on injected Services to perform actions.
    -   Format and return HTTP responses (often implicitly handled by NestJS).
    -   Apply Guards for authentication and authorization.

### Services
<a name="services"></a>
-   **Purpose:** Encapsulate business logic, interact with databases (via Prisma Client), call external APIs, and perform the core tasks related to a specific domain or feature.
-   **File:** Typically `*.service.ts` (e.g., `auth.service.ts`).
-   **Decorated with:** `@Injectable()`. This allows NestJS's dependency injection system to manage the service instance.
-   **Responsibilities:**
    -   Implement the application's business rules.
    -   Perform CRUD (Create, Read, Update, Delete - respecting soft deletes) operations using the injected `PrismaService`.
    -   Coordinate complex operations, potentially involving multiple database interactions or external calls.
    -   Contain logic that can be reused by different controllers or other services.

## Development Workflow
<a name="development-workflow"></a>
When adding a new feature or fixing a bug:

1.  **Create a Branch:** Branch off the main development branch (`dev` in our case). Use a descriptive name (e.g., `feat/add-game-evaluation`, `fix/login-error`).
2.  **Identify/Create Module:** Determine if the changes belong to an existing module or if a new module is needed (use `npx nest g module <module-name>`).
3.  **Update Prisma Schema (if needed):** Define or modify models in `prisma/schema.prisma`. It's likely that you DO NOT need to make changes here
5.  **Implement Service Logic:** Create or update the relevant service (`*.service.ts`). Inject `PrismaService` and other dependencies as needed. Implement the business logic HERE, there's no reason to have database operations
in controllers.
6.  **Implement Controller Endpoints:** Create or update the controller (`*.controller.ts`). Define routes, inject the service you just created, define DTOs for request bodies/params, and call service methods.
7.  **Add DTOs & Validation:** Create Data Transfer Objects (`*.dto.ts`) using `class-validator` decorators for request data validation
8.  **Apply Authentication/Authorization:** Use the decorators described below (`@Public`, `@UseGuards`, `@RequiredService`) to secure your endpoints appropriately.

## Authentication & Authorization
<a name="authentication-and-authorization"></a>
This API uses a specific pattern for handling authentication and authorization:

### Default Protection
<a name="default-protection"></a>
-   By default, **all API endpoints are protected**.
-   A global authentication guard (`SupabaseAuthGuard` configured to use the `SupabaseStrategy` with `passport-jwt`) runs on every request.
-   This guard expects a valid JWT `access-token` in an `HttpOnly` cookie.
-   The strategy verifies the JWT's signature and expiration.
-   If the token is valid, the strategy's `validate` method runs, which calls `AuthService.syncSupabaseUser` to ensure a corresponding, **active** user exists in our local `usuarios` table.
-   If all checks pass, the Prisma `User` object is attached to `request.user`, and the request proceeds.
-   If any check fails, a `401 Unauthorized` response is sent.

### Public Endpoints (`@Public`)
<a name="public-endpoints-public"></a>
-   Endpoints that **do not require authentication** (e.g., login, refresh, public data retrieval) must be explicitly marked with the `@Public()` decorator.
-   **File:** `src/auth/decorators/public.decorator.ts`
-   **Usage:** Place `@Public()` above the controller method handler.
-   **Effect:** Tells the global `SupabaseAuthGuard` to bypass the authentication checks for this specific route, allowing access to anyone.

Here's an example
```typescript
// src/auth/auth.controller.ts
import { Public } from './decorators/public.decorator';
// ... other imports

@Controller('auth')
export class AuthController {
  // ... constructor ...

  @Public() // This endpoint is accessible without authentication
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    // ... login logic ...
  }

  @Get('status') // This endpoint IS protected by default
  async getStatus() {
    return { status: 'API is running and requires auth for this endpoint' };
  }
}
```

### Permission-Based Authorization (`@UseGuards`, `@RequiredService`)
<a name="permission-based-authorization-useguards-requiredservice"></a>
-   While default protection ensures a user is authenticated and active locally, some endpoints require more granular **permission checks based on user roles**.
-   This is handled by the `RolePermissionGuard`.
-   To use it, you need **two** decorators on the controller method:

    1.  **`@UseGuards(RolePermissionGuard)`**: Applies the guard to the specific endpoint.
    2.  **`@RequiredService('YourServiceName')`**: Specifies the unique name of the logical "service" or action this endpoint represents. This name **must match** the `name` field of an active entry in the `servicio` table in the database. If you have doubts about this, feel free to ask me for clarification

Here's an example of how to use it. As you can see, to use the `RolePermissionGuard` you need to set the `@RequiredService` decorator as well. Otherwise, you'll get an error
```typescript
// src/teams/teams.controller.ts
import { UseGuards } from '@nestjs/common';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
// ... other imports

@Controller('teams')
export class TeamsController {
  // ... constructor ...

  // Example: Only users with appropriate role/permissions can list all teams
  @Get()
  @UseGuards(RolePermissionGuard)      // Apply the permission guard
  @RequiredService('ListAllTeams') // Link to the "ListAllTeams" service defined in DB
  async findAllTeams() {
    // ... logic to find all teams ...
  }

  // Example: Any authenticated user can view their own team (no specific permission needed beyond auth)
  @Get('my-team')
  // No @UseGuards(RolePermissionGuard) or @RequiredService needed here
  async findMyTeam(@GetUser() user: AppUser) {
    // ... logic to find team based on user.id ...
  }
}
```

The required service is linked to a set of permissions. Since roles are also linked to a set of permissions, we check if the user that is trying to access the service has the necessary permissions to perform the action.

## Database Conventions: Soft Deletes
<a name="database-conventions-soft-delete"></a>
To preserve data integrity and history, we employ a **soft delete** strategy for most records.

-   **Rule:** **Do NOT permanently delete records** from the database using `prisma.*.delete()` or `prisma.*.deleteMany()`.
-   **Mechanism:** Most tables have a boolean status field indicating if the record is active (`isActive` if i'm not wrong). Check the specific Prisma model (`schema.prisma`) for the exact field name used.
-   **"Deleting" a Record:** Instead of deleting, you **update** the record's status field to `false`.

    ```typescript
    // Example in a service
    async deactivateUser(userId: string): Promise<User> {
      // Check if user exists first (optional but good practice)
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found.`);
      }

      // Update the isActive flag instead of deleting
      return this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false }, // Set the status field to false
      });
    }
    ```

-   **Retrieving Records:** When querying data, **always include a `where` clause to filter by the active status** (`{ isActive: true }` or equivalent) unless you explicitly intend to retrieve inactive records (e.g., for an admin view).

    ```typescript
    // Example in a service
    async findActiveUsers(): Promise<User[]> {
      return this.prisma.user.findMany({
        where: {
          isActive: true, // Only retrieve active users
        },
      });
    }
    ```

    *Note: We may implement global Prisma middleware in the future to handle active filtering automatically, but for now, apply it explicitly in your service queries.*

## Data Transfer Objects (DTOs) & Validation
<a name="data-transfer-objects-dtos--validation"></a>
-   Use DTO classes (`*.dto.ts`) to define the expected shape of request bodies, query parameters, and path parameters.
-   Use decorators from the `class-validator` library within DTOs (`@IsString()`, `@IsEmail()`, `@IsNotEmpty()`, `@IsOptional()`, etc.) to define validation rules.
-   The global `ValidationPipe` configured in `main.ts` automatically validates incoming requests against these DTOs. If validation fails, it returns a `400 Bad Request` response with details.

You can create these `DTOs` manually, but using `nest g resource` is recommended as it generates boilerplate code for you that includes `DTOs`, `controllers` and `services`.

## Common commands
<a name="commands"></a>
Here's a list of common commands that will help you during the development:

- `nest g module`: Generate a new module.
- `nest g controller`: Generate a new controller.
- `nest g service`: Generate a new service.
- `nest g resource`: Generate a new resource (controller, service, DTOs). It usually asks for the type of API (always check `REST API`) and if you want to create `CRUD endpoints`. It's likely that you are always doing `CRUDs` so mark `y` when prompted

Thank you for contributing! Feel free to ask me any question in the `back` channel on Discord.

## Pushing Changes
<a name="pushing-changes"></a>
To push your changes to the remote repository, follow these steps:

1. Commit your changes locally using `git commit -m "Your commit message"`.
2. Push your changes to the remote repository using `git push origin your-branch-name`.

Please **do not merge** your branch into `dev` or `main`. make sure to create a pull request to `dev` or `main` and wait for the review process to complete before merging.
