# ReturnDesk — Return Request Management System

ReturnDesk is a full-stack web application for managing product return requests. It allows users to create and track return requests while providing functionality for searching, filtering, sorting, editing, reviewing, and managing request statuses.

The application uses a Next.js frontend, an Express.js REST API, and a PostgreSQL database.

## Features

### Return Request Management
- Create return requests with customer, order, item, quantity, and reason details.
- Automatically generate a unique reference number for every request.
- View return request details and associated notes.
- Edit request details while the request is Open or In Review.
- Soft-delete eligible requests without permanently removing database records.

### Search and Listing
- Search by customer name, email, order number, item name, or reference number.
- Filter requests by status and reason.
- Sort requests by supported fields and sort direction.
- Use server-side pagination to retrieve results efficiently.

### Status Workflow

The application supports the following status transitions:

- Open → In Review
- In Review → Approved or Rejected
- Approved → Completed

Rejected and Completed are final statuses.

### Business Rules
- Prevent duplicate live return requests for the same order and item.
- Require a resolution when approving a request: Refund, Replacement, or Store Credit.
- Require a refund amount greater than zero for Refund resolutions.
- Do not allow refund amounts for Replacement or Store Credit resolutions.
- Lock customer and item details after a decision.
- Allow removal only for Open or Rejected requests.
- Preserve request records through soft deletion.
- Allow notes to be added to existing, non-deleted requests and display them chronologically.

## Technology Stack

**Frontend**
- Next.js
- React
- JavaScript
- CSS

**Backend**
- Node.js
- Express.js
- REST API

**Database**
- PostgreSQL
- Neon PostgreSQL

**Development Tools**
- Git and GitHub
- npm
- Visual Studio Code

## Project Structure

```text
ReturnDesk/
├── client/
│   ├── src/
│   │   └── app/
│   │       └── page.js
│   ├── public/
│   ├── package.json
│   └── .env.example
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js
│   │   ├── routes/
│   │   │   └── returnRoutes.js
│   │   └── app.js
│   ├── schema.sql
│   ├── seed.js
│   ├── package.json
│   └── .env.example
├── .gitignore
└── README.md
```

*Note: The structure above describes the expected key files. Adjust it if your actual project has a different structure.*

## Prerequisites

Install the following before running the project:

- Node.js and npm
- A PostgreSQL database, such as Neon
- Git

## Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/PayalA25/ReturnDesk.git
cd ReturnDesk
```

### 2. Set up the database

Create a PostgreSQL database using Neon or another PostgreSQL provider.

Run the SQL statements in `server/schema.sql` against your database to create the required tables and indexes.

Ensure the database schema is compatible with the application before running the seed script.

### 3. Configure the backend

Navigate to the server directory:

```bash
cd server
npm install
```

Create a `.env` file in the `server/` directory using `.env.example` as a reference.

Example:

```env
PORT=5000
CLIENT_URL=http://localhost:3000
DATABASE_URL=your_postgresql_connection_string
```

Replace the database connection placeholder with your own PostgreSQL connection string. Do not commit your actual `.env` file or credentials to GitHub.

### 4. Start the backend

From the `server/` directory, run:

```bash
npm run dev
```

If the project does not define a `dev` script, run:

```bash
node src/app.js
```

The backend should start at:

`http://localhost:5000`

Check the following endpoints:

- `GET /` — API welcome message
- `GET /api/health` — Database connectivity
- `GET /api/returns` — List return requests

### 5. Configure the frontend

Open a second terminal and navigate to the client directory from the project root:

```bash
cd client
npm install
```

Configure any required frontend environment variables using `client/.env.example`, if applicable.

If the frontend uses the local API URL directly, ensure it points to:

`http://localhost:5000/api/returns`

### 6. Start the frontend

From the `client/` directory, run:

```bash
npm run dev
```

Open the application at:

`http://localhost:3000`

## API Endpoints

Base URL: `http://localhost:5000/api/returns`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List requests with search, filters, sorting, and pagination |
| POST | `/` | Create a return request |
| GET | `/:id` | Retrieve a request and its notes |
| POST | `/:id/notes` | Add a note |
| PATCH | `/:id/status` | Change request status and set approval resolution |
| PATCH | `/:id` | Edit eligible request details |
| DELETE | `/:id` | Soft-delete an eligible request |

### Query Parameters

The listing endpoint supports:

- `search` — Search customer, email, order, item, or reference.
- `status` — Filter by request status.
- `reason` — Filter by return reason.
- `sortBy` — Sort by a supported field.
- `sortOrder` — `asc` or `desc`.
- `page` — Page number.
- `limit` — Number of results per page.

Example:

```text
GET /api/returns?search=ORD-1001&status=Open&page=1&limit=10&sortBy=created_at&sortOrder=desc
```

### Error Handling

The API returns appropriate HTTP status codes and structured error responses for validation failures, duplicate requests, missing records, invalid status transitions, and other expected business-rule violations.

Example:

```json
{
  "error": {
    "code": "DUPLICATE_LIVE_REQUEST",
    "message": "An active return request already exists for this item and order."
  }
}
```

## Database Seeding

The backend includes a seed script for inserting sample return requests across different statuses and reasons, along with sample notes.

From the `server/` directory, run:

```bash
node seed.js
```

**Important:** The seed script inserts new records and is not idempotent. Run it against a clean test database or ensure existing data will not conflict with its sample records.

## Security and Configuration

- Keep database credentials in environment variables.
- Never commit `.env` files or secrets.
- Use parameterized SQL queries for database operations.
- Validate incoming request data on the server.
- Restrict sorting to supported fields.
- Apply database constraints to protect data integrity.

## Future Improvements

- Authentication and role-based authorization.
- Automated unit and integration tests.
- Improved API documentation with Swagger/OpenAPI.
- Deployment with production environment configuration.
- Enhanced monitoring and error logging.

## Author

**Payal Abhale**

GitHub: [PayalA25](https://github.com/PayalA25)

---

Developed as a full-stack return request management application.
