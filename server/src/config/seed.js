
require("dotenv").config();

const { randomUUID } = require("crypto");
const pool = require("./db");

const reasons = [
  "Damaged",
  "Wrong Item",
  "Size Issue",
  "Not As Described",
  "Changed Mind",
];

const statuses = [
  "Open",
  "In Review",
  "Approved",
  "Rejected",
  "Completed",
];

const resolutions = {
  Approved: "Refund",
  Completed: "Replacement",
};

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (let i = 1; i <= 30; i++) {
      const status = statuses[(i - 1) % statuses.length];

      const resolution = resolutions[status] || null;

      const refundAmount =
        resolution === "Refund" ? 250 + i * 10 : null;

      const reference = `RD-${randomUUID()}`;

      const result = await client.query(
        `INSERT INTO return_requests (
          reference,
          order_number,
          customer_name,
          customer_email,
          customer_phone,
          item_name,
          quantity,
          reason,
          status,
          resolution,
          refund_amount
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          reference,
          `ORD-${1000 + i}`,
          `Customer ${i}`,
          `customer${i}@example.com`,
          `90000000${String(i).padStart(2, "0")}`,
          `Product ${i}`,
          (i % 3) + 1,
          reasons[(i - 1) % reasons.length],
          status,
          resolution,
          refundAmount,
        ]
      );

      if (i % 3 === 0) {
        await client.query(
          `INSERT INTO return_notes (request_id, note)
           VALUES ($1, $2)`,
          [
            result.rows[0].id,
            `Sample internal note for request ${i}.`,
          ]
        );
      }
    }

    await client.query("COMMIT");

    console.log("Successfully created 30 sample return requests.");
    console.log("Created 10 sample notes.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
