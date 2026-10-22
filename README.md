# ReturnDesk — Return Request Management System

ReturnDesk is a full-stack web application for managing product return requests. Customers can submit return requests, while support agents can review requests, update statuses, choose resolutions, add internal notes, and manage the return workflow.

The application uses Next.js for the frontend, Node.js and Express.js for the REST API, and PostgreSQL for data storage.

## Live Demo

- **Frontend:** https://returndesk-frontend-7f5f.onrender.com
- **Backend API:** https://returndesk-55oa.onrender.com

## Features

### Return Request Management
- Create return requests with customer, order, item, quantity, and reason details.
- Generate a unique reference number for each request.
- View request details and associated internal notes.
- Edit request details while the request is Open or In Review.
- Soft-delete eligible requests without permanently removing database records.

### Search and Listing
- Search by customer name, email, order number, item name, or reference number.
- Filter requests by status and reason.
- Sort requests by supported fields and sort direction.
- Retrieve results using server-side pagination.

### Status Workflow
- Open → In Review
- In Review → Approved or Rejected
- Approved → Completed

Rejected and Completed are final statuses.

### Business Rules
- Prevent duplicate active return requests for the same order and item.
- Require a resolution when approving a request: Refund, Replacement, or Store Credit.
- Require a refund amount greater than zero for Refund resolutions.
- Disallow refund amounts for Replacement and Store Credit resolutions.
- Lock customer and item details after a decision.
- Allow removal only for Open or Rejected requests.
- Preserve records through soft deletion.
- Allow notes on existing, non-deleted requests and display them chronologically.

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
- Render PostgreSQL

**Tools**
- Git and GitHub
- npm
- Visual Studio Code
- Render

## Project Structure

```text
ReturnDesk/
├── client/
│   ├── public/
│   ├── src/
│   │   └── app/
│   │       └── page.js
│   ├── package.json
│   ├── .env.example
│   └── .gitignore
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   ├── schema.sql
│   │   │   └── seed.js
│   │   ├── routes/
│   │   │   └── returnRoutes.js
│   │   └── app.js
│   ├── package.json
│   └── .env.example
├── .gitignore
└── README.md
```

The structure above lists the main application files. Other configuration and supporting files may also exist.

## Prerequisites

Install the following before running the application locally:

- Node.js and npm
- A PostgreSQL database
- Git

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/PayalA25/ReturnDesk.git
cd ReturnDesk
```

### 2. Configure the Database

Create a PostgreSQL database using Render PostgreSQL, Neon, or another PostgreSQL provider.

Configure the database connection string in the backend environment file.

The database schema is located at:

```text
server/src/config/schema.sql
```

Initialize the database by executing the SQL statements in this file against your PostgreSQL database. The schema creates the required tables and indexes.

### 3. Configure the Backend

Open a terminal and run:

```bash
cd server
npm install
```

Create a `.env` file in the `server/` directory using `.env.example` as a reference.

Example configuration:

```env
PORT=5000
CLIENT_URL=http://localhost:3000
DATABASE_URL=your_postgresql_connection_string
```

Replace the placeholder with your own PostgreSQL connection string. Add any other variables required by your implementation.

**Never commit actual database credentials or secret environment files to GitHub.**

### 4. Start the Backend

From the `server/` directory, run:

```bash
npm run dev
```

If a development script is not configured in `package.json`, use:

```bash
node src/app.js
```

The backend should be available at:

```text
http://localhost:5000
```

Useful endpoints:

- `GET /` — API welcome message
- `GET /api/health` — Health and database connectivity check
- `GET /api/returns` — List return requests

### 5. Configure the Frontend

Open a second terminal from the project root:

```bash
cd client
npm install
```

Create a `client/.env.local` file if required by your setup.

Example:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

The frontend should use this environment variable when constructing API requests. If your implementation expects a different URL format, follow the configuration used in `client/src/app/page.js`.

### 6. Start the Frontend

From the `client/` directory, run:

```bash
npm run dev
```

Open the application at:

http://localhost:3000

## API Endpoints

Base URL:

```text
http://localhost:5000/api/returns
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List requests with search, filters, sorting, and pagination |
| POST | `/` | Create a return request |
| GET | `/:id` | Retrieve a request and its notes |
| POST | `/:id/notes` | Add an internal note |
| PATCH | `/:id/status` | Change status and set approval resolution |
| PATCH | `/:id` | Edit eligible request details |
| DELETE | `/:id` | Soft-delete an eligible request |

### Query Parameters

The listing endpoint supports:

- `search` — Search by customer, email, order, item, or reference.
- `status` — Filter by request status.
- `reason` — Filter by return reason.
- `sortBy` — Sort by a supported field.
- `sortOrder` — Sort direction: `asc` or `desc`.
- `page` — Page number.
- `limit` — Number of results per page.

Example:

```text
GET /api/returns?search=ORD-1001&status=Open&page=1&limit=10&sortBy=created_at&sortOrder=desc
```

### Error Handling

The API returns appropriate HTTP status codes and structured error responses for validation failures, duplicate requests, missing records, invalid status transitions, and other business-rule violations.

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

A seed script is provided to populate the database with sample return requests and internal notes.

The script is located at:

```text
server/src/config/seed.js
```

From the `server/` directory, run:

```bash
node src/config/seed.js
```

Ensure your environment variables point to the intended database before running the script.

**Important:** The seed script inserts new records each time it runs. It is not idempotent, so avoid running it repeatedly against the same database unless you intentionally want additional sample records.

## Deployment

The application is deployed using Render.

- **Frontend:** https://returndesk-frontend-7f5f.onrender.com
- **Backend:** https://returndesk-55oa.onrender.com
- **Database:** Render PostgreSQL

Configure the production environment variables in the appropriate Render services:

- Backend: `DATABASE_URL` and `CLIENT_URL`
- Frontend: `NEXT_PUBLIC_API_URL`

The backend's `CLIENT_URL` should match the deployed frontend origin. The frontend's `NEXT_PUBLIC_API_URL` should point to the deployed backend base URL.

Never store credentials directly in source code or commit them to the repository.

## Security

- Keep database credentials in environment variables.
- Never commit `.env` files or secrets.
- Use parameterized SQL queries for database operations.
- Validate incoming request data on the server.
- Restrict sorting to supported fields.
- Apply database constraints to protect data integrity.
- Configure production CORS to allow only the intended frontend origin.

## Future Improvements

- Authentication and role-based authorization.
- Automated unit and integration tests.
- API documentation using Swagger/OpenAPI.
- Enhanced monitoring and error logging.
- Improved accessibility and responsive design.

## Author

**Payal Abhale**

GitHub: https://github.com/PayalA25

---

Developed as a full-stack return request management application.
