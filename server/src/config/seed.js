
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

const resolutions = [
  null,
  null,
  "Refund",
  null,
  "Replacement",
];

async function seed() {
  try {
    for (let i = 1; i <= 30; i++) {
      const statusIndex = (i - 1) % statuses.length;
      const status = statuses[statusIndex];
      const resolution = resolutions[statusIndex];

      const refundAmount =
        status === "Approved" && resolution === "Refund"
          ? 250 + i * 10
          : null;

      const reference = `RD-${randomUUID()}`;

      const result = await pool.query(
        `INSERT INTO return_requests (
          reference, order_number, customer_name,
          customer_email, customer_phone, item_name,
          quantity, reason, status, resolution, refund_amount
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
        await pool.query(
          `INSERT INTO return_notes (request_id, note)
           VALUES ($1, $2)`,
          [
            result.rows[0].id,
            `Sample internal note for request ${i}.`,
          ]
        );
      }
    }

    console.log("Successfully created 30 sample return requests.");
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
