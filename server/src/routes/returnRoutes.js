
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

router.post("/", async (req, res) => {
  const {
    order_number,
    customer_name,
    customer_email,
    customer_phone,
    item_name,
    quantity,
    reason,
  } = req.body || {};

  const order = typeof order_number === "string" ? order_number.trim() : "";
  const name = typeof customer_name === "string" ? customer_name.trim() : "";
  const email = typeof customer_email === "string" ? customer_email.trim() : "";
  const phone = typeof customer_phone === "string" ? customer_phone.trim() : "";
  const item = typeof item_name === "string" ? item_name.trim() : "";

  if (
    !order ||
    !name ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !item ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    !allowedReasons.includes(reason)
  ) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Provide valid order, customer, email, item, quantity, and reason details.",
      },
    });
  }

  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize creation attempts for the same order and item.
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtext(LOWER($1)),
         hashtext(LOWER($2))
       )`,
      [order, item]
    );

    const duplicate = await client.query(
      `SELECT id
       FROM return_requests
       WHERE LOWER(TRIM(order_number)) = LOWER($1)
         AND LOWER(TRIM(item_name)) = LOWER($2)
         AND status NOT IN ('Rejected', 'Completed')
         AND is_deleted = FALSE
       LIMIT 1`,
      [order, item]
    );

    if (duplicate.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        error: {
          code: "DUPLICATE_LIVE_REQUEST",
          message: "An active return request already exists for this item and order.",
        },
      });
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
        order,
        name,
        email,
        phone || null,
        item,
        quantity,
        reason,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      message: "Return request created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    console.error("Create return request failed:", error.message);

    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to create the return request.",
      },
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

const allowedStatuses = [
  "Open",
  "In Review",
  "Approved",
  "Rejected",
  "Completed",
];

const allowedSortFields = {
  created_at: "created_at",
  updated_at: "updated_at",
  reference: "reference",
  status: "status",
  order_number: "order_number",
  customer_name: "customer_name",
};

router.get("/", async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const { status, reason, sortBy = "created_at", sortOrder = "desc" } =
      req.query;

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        error: {
          code: "INVALID_PAGINATION",
          message: "Page must be positive and limit must be between 1 and 100.",
        },
      });
    }

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: {
          code: "INVALID_STATUS",
          message: "Invalid status filter.",
        },
      });
    }

    if (reason && !allowedReasons.includes(reason)) {
      return res.status(400).json({
        error: {
          code: "INVALID_REASON",
          message: "Invalid reason filter.",
        },
      });
    }

    const sortColumn = allowedSortFields[sortBy];
    const direction = String(sortOrder).toLowerCase();

    if (!sortColumn || !["asc", "desc"].includes(direction)) {
      return res.status(400).json({
        error: {
          code: "INVALID_SORT",
          message: "Invalid sort field or sort order.",
        },
      });
    }

    const conditions = ["is_deleted = FALSE"];
    const values = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(
        `(customer_name ILIKE $${values.length}
          OR customer_email ILIKE $${values.length}
          OR order_number ILIKE $${values.length}
          OR reference ILIKE $${values.length}
          OR item_name ILIKE $${values.length})`
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
       ORDER BY ${sortColumn} ${direction.toUpperCase()}, id DESC
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
    console.error("List return requests failed:", error.message);

    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to retrieve return requests.",
      },
    });
  }
});

/* Get one return request with its notes */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id) || Number(id) < 1) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Request ID must be a positive integer.",
      },
    });
  }

  try {
    const requestResult = await pool.query(
      `SELECT *
       FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "REQUEST_NOT_FOUND",
          message: "Return request not found.",
        },
      });
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
    console.error("Get return request failed:", error.message);

    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to retrieve the return request.",
      },
    });
  }
});

/* Add a note to a return request */
router.post("/:id/notes", async (req, res) => {
  const { id } = req.params;
  const note = typeof req.body?.note === "string"
    ? req.body.note.trim()
    : "";

  if (!/^\d+$/.test(id) || Number(id) < 1) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Request ID must be a positive integer.",
      },
    });
  }

  if (!note) {
    return res.status(400).json({
      error: {
        code: "INVALID_NOTE",
        message: "Note cannot be empty.",
      },
    });
  }

  try {
    const requestResult = await pool.query(
      `SELECT id
       FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "REQUEST_NOT_FOUND",
          message: "Return request not found.",
        },
      });
    }

    const result = await pool.query(
      `INSERT INTO return_notes (request_id, note)
       VALUES ($1, $2)
       RETURNING id, request_id, note, created_at`,
      [id, note]
    );

    return res.status(201).json({
      message: "Note added successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Add note failed:", error.message);

    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to add the note.",
      },
    });
  }
});

router.patch("/:id/status", async (req, res) => {
  const id = req.params.id;
  const { status, resolution, refund_amount } = req.body || {};

  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "A valid request ID is required.",
      },
    });
  }

  const transitions = {
    "Open": ["In Review"],
    "In Review": ["Approved", "Rejected"],
    "Approved": ["Completed"],
    "Rejected": [],
    "Completed": [],
  };

  if (!Object.prototype.hasOwnProperty.call(transitions, status)) {
    return res.status(400).json({
      error: {
        code: "INVALID_STATUS",
        message: "The requested status is invalid.",
      },
    });
  }

  try {
    const currentResult = await pool.query(
      `SELECT * FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "REQUEST_NOT_FOUND",
          message: "Return request not found.",
        },
      });
    }

    const current = currentResult.rows[0];

    if (!transitions[current.status].includes(status)) {
      return res.status(409).json({
        error: {
          code: "INVALID_TRANSITION",
          message: `Cannot change status from ${current.status} to ${status}.`,
        },
      });
    }

    let finalResolution = current.resolution;
    let finalRefundAmount = current.refund_amount;

    if (status === "Approved") {
      const allowedResolutions = [
        "Refund",
        "Replacement",
        "Store Credit",
      ];

      if (!allowedResolutions.includes(resolution)) {
        return res.status(400).json({
          error: {
            code: "INVALID_RESOLUTION",
            message: "Choose Refund, Replacement, or Store Credit.",
          },
        });
      }

      if (resolution === "Refund") {
        const amount = Number(refund_amount);

        if (
          refund_amount === null ||
          refund_amount === undefined ||
          refund_amount === "" ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return res.status(400).json({
            error: {
              code: "INVALID_REFUND_AMOUNT",
              message: "A refund requires an amount greater than zero.",
            },
          });
        }

        finalRefundAmount = amount;
      } else {
        if (
          refund_amount !== null &&
          refund_amount !== undefined &&
          refund_amount !== ""
        ) {
          return res.status(400).json({
            error: {
              code: "REFUND_NOT_ALLOWED",
              message: "Refund amount must be omitted for non-refund resolutions.",
            },
          });
        }

        finalRefundAmount = null;
      }

      finalResolution = resolution;
    }

    const result = await pool.query(
      `UPDATE return_requests
       SET status = $1,
           resolution = $2,
           refund_amount = $3,
           updated_at = NOW()
       WHERE id = $4 AND is_deleted = FALSE
       RETURNING *`,
      [status, finalResolution, finalRefundAmount, id]
    );

    return res.status(200).json({
      message: "Return request status updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Status update failed:", error.message);

    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to update the return request status.",
      },
    });
  }
});

router.patch("/:id", async (req, res) => {
  const id = req.params.id;

  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "A valid request ID is required.",
      },
    });
  }

  const {
    order_number,
    customer_name,
    customer_email,
    customer_phone,
    item_name,
    quantity,
    reason,
  } = req.body || {};

  const allowedReasons = [
    "Damaged",
    "Wrong Item",
    "Size Issue",
    "Not As Described",
    "Changed Mind",
  ];

  if (
    typeof order_number !== "string" || !order_number.trim() ||
    typeof customer_name !== "string" || !customer_name.trim() ||
    typeof customer_email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email.trim()) ||
    typeof item_name !== "string" || !item_name.trim() ||
    !Number.isInteger(quantity) || quantity <= 0 ||
    !allowedReasons.includes(reason) ||
    (customer_phone != null && typeof customer_phone !== "string")
  ) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Provide valid request details.",
      },
    });
  }

  try {
    const currentResult = await pool.query(
      `SELECT * FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "REQUEST_NOT_FOUND",
          message: "Return request not found.",
        },
      });
    }

    const current = currentResult.rows[0];

    if (!["Open", "In Review"].includes(current.status)) {
      return res.status(409).json({
        error: {
          code: "REQUEST_LOCKED",
          message: "Request details cannot be edited after a decision.",
        },
      });
    }

    const duplicate = await pool.query(
      `SELECT id FROM return_requests
       WHERE id <> $1
         AND LOWER(TRIM(order_number)) = LOWER($2)
         AND LOWER(TRIM(item_name)) = LOWER($3)
         AND status NOT IN ('Rejected', 'Completed')
         AND is_deleted = FALSE
       LIMIT 1`,
      [id, order_number.trim(), item_name.trim()]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        error: {
          code: "DUPLICATE_LIVE_REQUEST",
          message: "An active request already exists for this item and order.",
        },
      });
    }

    const result = await pool.query(
      `UPDATE return_requests
       SET order_number = $1,
           customer_name = $2,
           customer_email = $3,
           customer_phone = $4,
           item_name = $5,
           quantity = $6,
           reason = $7,
           updated_at = NOW()
       WHERE id = $8 AND is_deleted = FALSE
       RETURNING *`,
      [
        order_number.trim(),
        customer_name.trim(),
        customer_email.trim(),
        customer_phone?.trim() || null,
        item_name.trim(),
        quantity,
        reason,
        id,
      ]
    );

    return res.status(200).json({
      message: "Return request updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Edit request failed:", error.message);

    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to update the return request.",
      },
    });
  }
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;

  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "A valid request ID is required.",
      },
    });
  }

  try {
    const result = await pool.query(
      `UPDATE return_requests
       SET is_deleted = TRUE, updated_at = NOW()
       WHERE id = $1
         AND is_deleted = FALSE
         AND status IN ('Open', 'Rejected')
       RETURNING id, reference, status, is_deleted`,
      [id]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query(
        `SELECT id, status, is_deleted
         FROM return_requests WHERE id = $1`,
        [id]
      );

      if (existing.rows.length === 0 || existing.rows[0].is_deleted) {
        return res.status(404).json({
          error: {
            code: "REQUEST_NOT_FOUND",
            message: "Return request not found.",
          },
        });
      }

      return res.status(409).json({
        error: {
          code: "DELETE_NOT_ALLOWED",
          message: "Only Open or Rejected requests can be removed.",
        },
      });
    }

    return res.status(200).json({
      message: "Return request removed successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Delete request failed:", error.message);

    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to remove the return request.",
      },
    });
  }
});
// PATCH /api/returns/:id
// Edit customer and item details before a decision is made.
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    order_number,
    customer_name,
    customer_email,
    customer_phone,
    item_name,
    quantity,
    reason,
  } = req.body || {};

  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: { code: "INVALID_ID", message: "A valid request ID is required." },
    });
  }

  const allowedReasons = [
    "Damaged",
    "Wrong Item",
    "Size Issue",
    "Not As Described",
    "Changed Mind",
  ];

  if (
    typeof order_number !== "string" || !order_number.trim() ||
    typeof customer_name !== "string" || !customer_name.trim() ||
    typeof customer_email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email.trim()) ||
    typeof item_name !== "string" || !item_name.trim() ||
    !Number.isInteger(Number(quantity)) || Number(quantity) <= 0 ||
    !allowedReasons.includes(reason) ||
    (customer_phone != null && typeof customer_phone !== "string")
  ) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST_DETAILS",
        message: "Provide valid order, customer, item, quantity, email, and reason details.",
      },
    });
  }

  try {
    const currentResult = await pool.query(
      `SELECT * FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (!currentResult.rows.length) {
      return res.status(404).json({
        error: { code: "REQUEST_NOT_FOUND", message: "Return request not found." },
      });
    }

    const current = currentResult.rows[0];

    if (!["Open", "In Review"].includes(current.status)) {
      return res.status(409).json({
        error: {
          code: "DETAILS_LOCKED",
          message: "Request details cannot be edited after a decision.",
        },
      });
    }

    // Prevent another active request for the same order and item.
    const duplicate = await pool.query(
      `SELECT id FROM return_requests
       WHERE id <> $1
         AND LOWER(TRIM(order_number)) = LOWER(TRIM($2))
         AND LOWER(TRIM(item_name)) = LOWER(TRIM($3))
         AND status NOT IN ('Rejected', 'Completed')
         AND is_deleted = FALSE
       LIMIT 1`,
      [id, order_number.trim(), item_name.trim()]
    );

    if (duplicate.rows.length) {
      return res.status(409).json({
        error: {
          code: "DUPLICATE_LIVE_REQUEST",
          message: "An active return request already exists for this order and item.",
        },
      });
    }

    const result = await pool.query(
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
        order_number.trim(),
        customer_name.trim(),
        customer_email.trim(),
        customer_phone?.trim() || null,
        item_name.trim(),
        Number(quantity),
        reason,
        id,
      ]
    );

    if (!result.rows.length) {
      return res.status(409).json({
        error: {
          code: "REQUEST_CHANGED",
          message: "The request changed. Refresh and try again.",
        },
      });
    }

    return res.status(200).json({
      message: "Return request updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Edit request failed:", error.message);
    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to update return request.",
      },
    });
  }
});


// DELETE /api/returns/:id
// Soft-delete only: keep the record in PostgreSQL.
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: { code: "INVALID_ID", message: "A valid request ID is required." },
    });
  }

  try {
    const currentResult = await pool.query(
      `SELECT status FROM return_requests
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (!currentResult.rows.length) {
      return res.status(404).json({
        error: { code: "REQUEST_NOT_FOUND", message: "Return request not found." },
      });
    }

    const { status } = currentResult.rows[0];

    if (!["Open", "Rejected"].includes(status)) {
      return res.status(409).json({
        error: {
          code: "DELETE_NOT_ALLOWED",
          message: "Only Open or Rejected requests can be removed.",
        },
      });
    }

    const result = await pool.query(
      `UPDATE return_requests
       SET is_deleted = TRUE, updated_at = NOW()
       WHERE id = $1
         AND status IN ('Open', 'Rejected')
         AND is_deleted = FALSE
       RETURNING id`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(409).json({
        error: {
          code: "REQUEST_CHANGED",
          message: "The request changed. Refresh and try again.",
        },
      });
    }

    return res.status(200).json({
      message: "Return request removed successfully.",
    });
  } catch (error) {
    console.error("Remove request failed:", error.message);
    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to remove return request.",
      },
    });
  }
});

module.exports = router;
