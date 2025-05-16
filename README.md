# Arkad API Documentation

Welcome to the Arkad API documentation. Here you'll find information about how to setup the development environment and the set of Endpoints
that at this moment the API provides

## Table of Contents

- [`Setup`](#setup)
- [`Modules`](#modules)
- [`Contributing`](#contributing)

## Setup
<a name="setup"></a>
In order to run the project, you need to have `NodeJS` and `Git` installed on your machine. Once you have them installed, is as easy as follow these steps

### Clone the repository
When cloning the repository, you must do it via `SSH` in order to be able to push changes to the repository. If you don't know how to
create a `SSH` key follow this [guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent). Once you have your `SSH` key just clone the repo with:

```
git clone git@github.com:djromerom/gamerlab_back_2295_2.git
```

### Install dependencies
Now install dependencies with your preferred package manager. We are using `npm` but if you prefer `yarn` or `pnpm` use them. Anyways, run:
```
cd gamerlab_back_2295_2
npm install
```

This command will install all the required dependencies for the project

### Environment variables
In order to run the application you must create a `.env` file at the root of the project. This means that your project folder should look like this:
```
gamerlab_back_2295_2/
├── .env
├── package.json
├── ...
```

Inside `.env` you must have the following variables:
```
### General ###
FRONTEND_URL="http://localhost:5173" # An example
NODE_ENV="development"
PORT=3000

### SUPABASE KEYS ###
  SUPABASE_URL=
  SUPABASE_KEY=

  ### Database ###
  DATABASE_URL=""
  DIRECT_URL=""

  ### JWT KEYS ###
  SUPABASE_JWT_SECRET=

```
Let's break down the environment variables:
- `FRONTEND_URL`: This is the base `URL` of your frontend. We use this variable to accept `cors` requests from the frontend.
- `NODE_ENV`: The environment in which the application is running. This can be either `development` or `production`.
- `PORT`: The port on which the application will listen for incoming requests.
- `DATABASE_URL`: The URL of the database. This is used by Prisma to connect to the database. You can find this in your supabase dashboard
- `DIRECT_URL`: The direct URL of the database. This is used by Prisma to connect to the database and perform migrations
- `SUPABASE_URL`: The URL of the Supabase instance. You can find it under `Project Settings` in the `Project URL` section
- `SUPABASE_JWT_SECRET`: The JWT secret used by Supabase to sign JWTs. You can find it under `Project Settings` in the `JWT Secret` section
- `SUPABASE_KEY`: The Supabase key used by the Supabase client. You can find it under `Project Settings` in the `Project API Keys` section and then copy `anon public`

If you're part of the development team, you can ask for these keys to the team lead.

### Prisma Generate
Before you can use `Prisma`, you need to generate the `Prisma client` by running the following command:

```
npx prisma generate
```
This will generate the query builder based on the models defined in `prisma/schema.prisma`. Then you can import these models into the codebase to take advantage of completion and type safety as well as the facility to perform database operations.

### Start the server
You can run the server in two ways. Since you're following this guide we assume you'll run the project locally so it would be beneficial to restart the server every time you make changes in the codebase. For this purpose, you can use the following command:

```
npm run start:dev
```

If you just want the regular server, you can use the following command:

```
npm run start
```

For more scripts check `package.json`

## Modules
<a name="modules"></a>

- [`Auth`](#auth)

### Auth

<a name="auth"></a>

This module is responsible for user authentication and handling sessions for the Arkad API. It integrates with an external identity provider (Supabase) for credential verification and utilizes JWTs (JSON Web Tokens) for session management.

To enhance security, this API **does not** rely on storing JWTs in browser `localStorage`. Instead, upon successful authentication or token refresh, it sets the necessary tokens (`access-token`, `refresh-token`) as **secure, `HttpOnly` cookies**. This approach mitigates risks associated with Cross-Site Scripting (XSS) attacks trying to steal tokens. Browsers (and tools like Postman) will automatically handle sending these cookies on subsequent requests to the API.

### Endpoints

This module provides the following endpoints:

-   [`POST /auth/login`](#login)
-   [`POST /auth/refresh`](#refresh)
-   [`POST /auth/logout`](#logout)
-   [`GET /auth/me`](#get-user-profile-authme)

---

### Login

<a name="login"></a>
`POST /auth/login`

**Description:** Authenticates a user using their registered email and password. On successful authentication with the identity provider and validation against the local user database (including activating pending accounts), it establishes a session by setting secure `HttpOnly` cookies containing the access and refresh tokens.

**Request Body:**

Requires `Content-Type: application/json`.

```json
{
  "email": "user@example.com",
  "password": "yourSecurePassword"
}
```

### Refresh

<a name="refresh"></a>
`POST /auth/refresh`

**Description:** Refreshes the user's session by generating a new access token using the refresh token stored in a secure `HttpOnly` cookie. This endpoint is typically called when the access token expires.

**Request Headers:**

Requires `Cookie: refresh-token=<refresh_token>`.

### Logout

<a name="logout"></a>
`POST /auth/logout`

**Description:** Logs out the user by clearing the secure `HttpOnly` cookies containing the access and refresh tokens.

**Request Headers:**

Requires `Cookie: access-token=<access_token>, refresh-token=<refresh_token>`.

### Get User Profile (Auth/me)

<a name="get-user-profile-authme"></a>
`GET /auth/me`

**Description:** Retrieves the user's profile information.

**Request Headers:**

Requires `Cookie: access-token=<access_token>`.

**Response Body:**

Returns a JSON object containing the user's profile information.

```json
{
  "id": "user-uuid-string",
  "name": "User Name",
  "username": "username",
  "email": "user@example.com",
  "isActive": true,
  "createdAt": "2023-10-27T10:00:00.000Z",
  "updatedAt": "2023-10-27T10:00:00.000Z",
  "role": {
    "name": "Student",
    "description": "Student role"
  },
  "confirmationStatus": {
    "status": "CONFIRMADO"
  }
}
```

### Contributing
<a name="contributing"></a>
To contribute code to the project, please follow the [CONTRIBUTING.md](CONTRIBUTING.md) guidelines
