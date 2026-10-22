
const express = require("express");
const { randomUUID } = require("crypto");
const pool = require("../config/db");

const router = express.Router();

const allowedReasons = [
  "Damaged",
  "Wrong Item",
  "Size Issue",
  "Not As Described",
  "Changed Mind",
];

const allowedStatuses = [
  "Open",
  "In Review",
  "Approved",
  "Rejected",
  "Completed",
];

const allowedResolutions = [
  "Refund",
  "Replacement",
  "Store Credit",
];

const allowedSortFields = {
  created_at: "created_at",
  updated_at: "updated_at",
  reference: "reference",
  status: "status",
  order_number: "order_number",
  customer_name: "customer_name",
};

const transitions = {
  Open: ["In Review"],
  "In Review": ["Approved", "Rejected"],
  Approved: ["Completed"],
  Rejected: [],
  Completed: [],
};

function sendError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message },
  });
}

function isValidId(id) {
  return /^\d+$/.test(String(id)) && Number(id) > 0;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRequestDetails(body = {}) {
  const {
    order_number,
    customer_name,
    customer_email,
    customer_phone,
    item_name,
    quantity,
    reason,
  } = body;

  if (
    typeof order_number !== "string" ||
    !order_number.trim() ||
    typeof customer_name !== "string" ||
    !customer_name.trim() ||
    typeof customer_email !== "string" ||
    !isValidEmail(customer_email.trim()) ||
    typeof item_name !== "string" ||
    !item_name.trim() ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    !allowedReasons.includes(reason) ||
    (customer_phone != null && typeof customer_phone !== "string")
  ) {
    return null;
  }

  if (
    order_number.trim().length > 100 ||
    customer_name.trim().length > 150 ||
    customer_email.trim().length > 255 ||
    item_name.trim().length > 200 ||
    (customer_phone && customer_phone.trim().length > 30) ||
    quantity > 10000
  ) {
    return null;
  }

  return {
    // CHANGE: order numbers are always stored in uppercase
    order_number: order_number.trim().toUpperCase(),
    customer_name: customer_name.trim(),
    customer_email: customer_email.trim(),
    customer_phone: customer_phone?.trim() || null,
    item_name: item_name.trim(),
    quantity,
    reason,
  };
}

function handleDatabaseError(res, error, operation) {
  console.error(`${operation} failed:`, error.message);

  if (
    error.code === "23505" &&
    error.constraint === "uq_live_return_order_item"
  ) {
    return sendError(
      res,
      409,
      "DUPLICATE_LIVE_REQUEST",
      "An active return request already exists for this item and order."
    );
  }

  if (error.code === "23514") {
    return sendError(
      res,
      400,
      "CONSTRAINT_VIOLATION",
      "The supplied values violate a database rule."
    );
  }

  if (error.code === "23503") {
    return sendError(
      res,
      400,
      "INVALID_REFERENCE",
      "The related database record does not exist."
    );
  }

  return sendError(
    res,
    500,
    "INTERNAL_SERVER_ERROR",
    `Unable to ${operation.toLowerCase()}.`
  );
}

async function lockOrderAndItem(client, orderNumber, itemName) {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtext(LOWER(TRIM($1))),
       hashtext(LOWER(TRIM($2)))
     )`,
    [orderNumber, itemName]
  );
}
async function findDuplicate(client, orderNumber, itemName, excludeId = null) {
  const values = [orderNumber];

  let exclusion = "";

  if (excludeId !== null) {
    values.push(excludeId);
    exclusion = `AND id <> $2`;
  }

  const result = await client.query(
    `SELECT id
     FROM return_requests
     WHERE regexp_replace(LOWER($1), '[^a-z0-9]', '', 'g')
         = regexp_replace(LOWER(order_number), '[^a-z0-9]', '', 'g')
       AND status NOT IN ('Rejected', 'Completed')
       AND is_deleted = FALSE
       ${exclusion}
     LIMIT 1`,
    values
  );

  return result.rows.length > 0;
}

/* CREATE RETURN REQUEST */
router.post("/", async (req, res) => {
  const details = validateRequestDetails(req.body);

  if (!details) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "Provide valid order, customer, email, item, quantity, and reason details."
    );
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    await lockOrderAndItem(
      client,
      details.order_number,
      details.item_name
    );

    const duplicate = await findDuplicate(
      client,
      details.order_number,
      details.item_name
    );

    if (duplicate) {
      await client.query("ROLLBACK");

      return sendError(
        res,
        409,
        "DUPLICATE_LIVE_REQUEST",
        "An active return request already exists for this item and order."
      );
    }

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
         reason
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        reference,
        details.order_number,
        details.customer_name,
        details.customer_email,
        details.customer_phone,
        details.item_name,
        details.quantity,
        details.reason,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Return request created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    return handleDatabaseError(res, error, "Create return request");
  } finally {
    if (client) client.release();
  }
});

/* LIST, SEARCH, FILTER, SORT, AND PAGINATE */
router.get("/", async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const status =
      typeof req.query.status === "string" ? req.query.status : "";

    const reason =
      typeof req.query.reason === "string" ? req.query.reason : "";

    const sortBy =
      typeof req.query.sortBy === "string"
        ? req.query.sortBy
        : "created_at";

    const sortOrder =
      typeof req.query.sortOrder === "string"
        ? req.query.sortOrder.toLowerCase()
        : "desc";

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return sendError(
        res,
        400,
        "INVALID_PAGINATION",
        "Page must be a positive integer and limit must be between 1 and 100."
      );
    }

    if (status && !allowedStatuses.includes(status)) {
      return sendError(
        res,
        400,
        "INVALID_STATUS",
        "Invalid status filter."
      );
    }

    if (reason && !allowedReasons.includes(reason)) {
      return sendError(
        res,
        400,
        "INVALID_REASON",
        "Invalid reason filter."
      );
    }

    const sortColumn = allowedSortFields[sortBy];

    if (!sortColumn || !["asc", "desc"].includes(sortOrder)) {
      return sendError(
        res,
        400,
        "INVALID_SORT",
        "Invalid sort field or sort order."
      );
    }

    const conditions = ["is_deleted = FALSE"];
    const values = [];

    if (search) {
      values.push(`%${search}%`);
      const index = values.length;

      conditions.push(
        `(customer_name ILIKE $${index}
          OR customer_email ILIKE $${index}
          OR order_number ILIKE $${index}
          OR reference ILIKE $${index}
          OR item_name ILIKE $${index})`
      );
    }

    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    if (reason) {
      values.push(reason);
      conditions.push(`reason = $${values.length}`);
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM return_requests
       WHERE ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT *
       FROM return_requests
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}, id DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    return res.status(200).json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleDatabaseError(res, error, "Retrieve return requests");
  }
});

/* GET ONE REQUEST WITH CHRONOLOGICAL NOTES */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return sendError(
      res,
      400,
      "INVALID_ID",
      "Request ID must be a positive integer."
    );
  }

  try {
    const requestResult = await pool.query(
      `SELECT *
       FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (!requestResult.rows.length) {
      return sendError(
        res,
        404,
        "REQUEST_NOT_FOUND",
        "Return request not found."
      );
    }

    const notesResult = await pool.query(
      `SELECT id, request_id, note, created_at
       FROM return_notes
       WHERE request_id = $1
       ORDER BY created_at ASC, id ASC`,
      [id]
    );

    return res.status(200).json({
      data: {
        ...requestResult.rows[0],
        notes: notesResult.rows,
      },
    });
  } catch (error) {
    return handleDatabaseError(res, error, "Retrieve the return request");
  }
});

/* ADD NOTE — NOTES ARE APPEND-ONLY THROUGH THIS API */
router.post("/:id/notes", async (req, res) => {
  const { id } = req.params;

  const note =
    typeof req.body?.note === "string" ? req.body.note.trim() : "";

  if (!isValidId(id)) {
    return sendError(
      res,
      400,
      "INVALID_ID",
      "Request ID must be a positive integer."
    );
  }

  if (!note) {
    return sendError(
      res,
      400,
      "INVALID_NOTE",
      "Note cannot be empty."
    );
  }

  try {
    const result = await pool.query(
      `INSERT INTO return_notes (request_id, note)
       SELECT id, $2
       FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING id, request_id, note, created_at`,
      [id, note]
    );

    if (!result.rows.length) {
      return sendError(
        res,
        404,
        "REQUEST_NOT_FOUND",
        "Return request not found."
      );
    }

    return res.status(201).json({
      message: "Note added successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    return handleDatabaseError(res, error, "Add note");
  }
});

/* UPDATE STATUS WITH VALIDATION AND LEGAL TRANSITIONS */
router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status, resolution, refund_amount } = req.body || {};

  if (!isValidId(id)) {
    return sendError(
      res,
      400,
      "INVALID_ID",
      "A valid request ID is required."
    );
  }

  if (
    typeof status !== "string" ||
    !Object.prototype.hasOwnProperty.call(transitions, status)
  ) {
    return sendError(
      res,
      400,
      "INVALID_STATUS",
      "The requested status is invalid."
    );
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const currentResult = await client.query(
      `SELECT *
       FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE
       FOR UPDATE`,
      [id]
    );

    if (!currentResult.rows.length) {
      await client.query("ROLLBACK");

      return sendError(
        res,
        404,
        "REQUEST_NOT_FOUND",
        "Return request not found."
      );
    }

    const current = currentResult.rows[0];

    if (!transitions[current.status].includes(status)) {
      await client.query("ROLLBACK");

      return sendError(
        res,
        409,
        "INVALID_TRANSITION",
        `Cannot change status from ${current.status} to ${status}.`
      );
    }

    let finalResolution = current.resolution;
    let finalRefundAmount = current.refund_amount;

    if (status === "Approved") {
      if (!allowedResolutions.includes(resolution)) {
        await client.query("ROLLBACK");

        return sendError(
          res,
          400,
          "INVALID_RESOLUTION",
          "Choose Refund, Replacement, or Store Credit."
        );
      }

      if (resolution === "Refund") {
        const amount = Number(refund_amount);

        if (
          refund_amount === null ||
          refund_amount === undefined ||
          (typeof refund_amount === "string" &&
            refund_amount.trim() === "") ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          await client.query("ROLLBACK");

          return sendError(
            res,
            400,
            "INVALID_REFUND_AMOUNT",
            "A refund requires an amount greater than zero."
          );
        }

        finalRefundAmount = amount;
      } else {
        if (
          refund_amount !== null &&
          refund_amount !== undefined &&
          refund_amount !== ""
        ) {
          await client.query("ROLLBACK");

          return sendError(
            res,
            400,
            "REFUND_NOT_ALLOWED",
            "Do not provide a refund amount for Replacement or Store Credit."
          );
        }

        finalRefundAmount = null;
      }

      finalResolution = resolution;
    } else if (
      resolution !== undefined ||
      refund_amount !== undefined
    ) {
      await client.query("ROLLBACK");

      return sendError(
        res,
        400,
        "UNEXPECTED_RESOLUTION",
        "Resolution and refund amount can only be supplied when approving a request."
      );
    }

    const result = await client.query(
      `UPDATE return_requests
       SET status = $1,
           resolution = $2,
           refund_amount = $3,
           updated_at = NOW()
       WHERE id = $4 AND is_deleted = FALSE
       RETURNING *`,
      [status, finalResolution, finalRefundAmount, id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Return request status updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    return handleDatabaseError(res, error, "Update return request status");
  } finally {
    if (client) client.release();
  }
});

/* EDIT DETAILS — ONLY WHILE OPEN OR IN REVIEW */
router.patch("/:id", async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return sendError(
      res,
      400,
      "INVALID_ID",
      "A valid request ID is required."
    );
  }

  const details = validateRequestDetails(req.body);

  if (!details) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "Provide valid order, customer, email, item, quantity, and reason details."
    );
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const currentResult = await client.query(
      `SELECT *
       FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE
       FOR UPDATE`,
      [id]
    );

    if (!currentResult.rows.length) {
      await client.query("ROLLBACK");

      return sendError(
        res,
        404,
        "REQUEST_NOT_FOUND",
        "Return request not found."
      );
    }

    const current = currentResult.rows[0];

    if (!["Open", "In Review"].includes(current.status)) {
      await client.query("ROLLBACK");

      return sendError(
        res,
        409,
        "REQUEST_LOCKED",
        "Request details cannot be edited after a decision."
      );
    }

    await lockOrderAndItem(
      client,
      details.order_number,
      details.item_name
    );

    const duplicate = await findDuplicate(
      client,
      details.order_number,
      details.item_name,
      id
    );

    if (duplicate) {
      await client.query("ROLLBACK");

      return sendError(
        res,
        409,
        "DUPLICATE_LIVE_REQUEST",
        "An active return request already exists for this item and order."
      );
    }

    const result = await client.query(
      `UPDATE return_requests
       SET order_number = $1,
           customer_name = $2,
           customer_email = $3,
           customer_phone = $4,
           item_name = $5,
           quantity = $6,
           reason = $7,
           updated_at = NOW()
       WHERE id = $8
         AND status IN ('Open', 'In Review')
         AND is_deleted = FALSE
       RETURNING *`,
      [
        details.order_number,
        details.customer_name,
        details.customer_email,
        details.customer_phone,
        details.item_name,
        details.quantity,
        details.reason,
        id,
      ]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");

      return sendError(
        res,
        409,
        "REQUEST_CHANGED",
        "The request changed. Refresh and try again."
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Return request updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    return handleDatabaseError(res, error, "Edit return request");
  } finally {
    if (client) client.release();
  }
});

/* SOFT DELETE — ONLY OPEN OR REJECTED REQUESTS */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return sendError(
      res,
      400,
      "INVALID_ID",
      "A valid request ID is required."
    );
  }

  try {
    const result = await pool.query(
      `UPDATE return_requests
       SET is_deleted = TRUE,
           updated_at = NOW()
       WHERE id = $1
         AND is_deleted = FALSE
         AND status IN ('Open', 'Rejected')
       RETURNING id, reference, status, is_deleted`,
      [id]
    );

    if (!result.rows.length) {
      const existing = await pool.query(
        `SELECT id, status, is_deleted
         FROM return_requests
         WHERE id = $1`,
        [id]
      );

      if (
        !existing.rows.length ||
        existing.rows[0].is_deleted
      ) {
        return sendError(
          res,
          404,
          "REQUEST_NOT_FOUND",
          "Return request not found."
        );
      }

      return sendError(
        res,
        409,
        "DELETE_NOT_ALLOWED",
        "Only Open or Rejected requests can be removed."
      );
    }

    return res.status(200).json({
      message: "Return request removed successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    return handleDatabaseError(res, error, "Remove return request");
  }
});

module.exports = router;
