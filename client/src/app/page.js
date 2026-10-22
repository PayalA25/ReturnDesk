
"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL = `${
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
}/api/returns`;

const statuses = ["Open", "In Review", "Approved", "Rejected", "Completed"];

const reasons = [
  "Damaged",
  "Wrong Item",
  "Size Issue",
  "Not As Described",
  "Changed Mind",
];

const emptyForm = {
  order_number: "",
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  item_name: "",
  quantity: "1",
  reason: "Damaged",
};

function statusStyle(status) {
  const styles = {
    Open: "bg-blue-100 text-blue-700",
    "In Review": "bg-amber-100 text-amber-700",
    Approved: "bg-green-100 text-green-700",
    Rejected: "bg-red-100 text-red-700",
    Completed: "bg-gray-200 text-gray-700",
  };

  return styles[status] || "bg-gray-100 text-gray-700";
}

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default function Home() {
  const [requests, setRequests] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
    limit: 10,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [note, setNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const [message, setMessage] = useState("");

  const [resolution, setResolution] = useState("Refund");
  const [refundAmount, setRefundAmount] = useState("");

  // NEW: Edit request state
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editLoading, setEditLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch requests with server-side search, filtering and pagination
  const loadRequests = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        limit: "10",
        sortBy,
        sortOrder,
      });

      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (reason) params.set("reason", reason);

      try {
        const response = await fetch(`${API_URL}?${params}`, { signal });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error?.message || "Could not load return requests."
          );
        }

        setRequests(result.data || []);
        setPagination(
          result.pagination || {
            total: 0,
            totalPages: 1,
            limit: 10,
          }
        );
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Unable to connect to the server.");
          setRequests([]);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [page, search, status, reason, sortBy, sortOrder]
  );

  useEffect(() => {
    const controller = new AbortController();

    loadRequests(controller.signal);

    return () => controller.abort();
  }, [loadRequests, refreshKey]);

  function changeFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  // Open request details
  async function openDetails(id) {
    setSelectedRequest(null);
    setDetailError("");
    setDetailLoading(true);
    setNote("");
    setEditMode(false);
    setRefundAmount("");

    try {
      const response = await fetch(`${API_URL}/${id}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error?.message || "Could not load request details."
        );
      }

      setSelectedRequest(result.data);

      // Populate the edit form from the selected request
      setEditForm({
        order_number: result.data.order_number || "",
        customer_name: result.data.customer_name || "",
        customer_email: result.data.customer_email || "",
        customer_phone: result.data.customer_phone || "",
        item_name: result.data.item_name || "",
        quantity: String(result.data.quantity ?? 1),
        reason: result.data.reason || "Damaged",
      });

      if (result.data.resolution) {
        setResolution(result.data.resolution);
      } else {
        setResolution("Refund");
      }

      if (result.data.refund_amount != null) {
        setRefundAmount(String(result.data.refund_amount));
      }
    } catch (err) {
      setDetailError(err.message || "Could not load request details.");
    } finally {
      setDetailLoading(false);
    }
  }

  // Create a new return request
  async function createRequest(event) {
    event.preventDefault();
    setCreateLoading(true);
    setCreateError("");
    setMessage("");

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error?.message || "Could not create the request."
        );
      }

      setShowCreate(false);
      setForm(emptyForm);
      setSearchInput("");
      setSearch("");
      setStatus("");
      setReason("");
      setSortBy("created_at");
      setSortOrder("desc");
      setPage(1);

      setMessage(result.message || "Return request created successfully.");
      setRefreshKey((key) => key + 1);

      if (result.data?.id) {
        await openDetails(result.data.id);
      }
    } catch (err) {
      setCreateError(err.message || "Could not create the request.");
    } finally {
      setCreateLoading(false);
    }
  }

  // NEW: Enter edit mode
  function startEditing() {
    if (!selectedRequest) return;

    if (!["Open", "In Review"].includes(selectedRequest.status)) {
      setDetailError("This request can no longer be edited.");
      return;
    }

    setEditForm({
      order_number: selectedRequest.order_number || "",
      customer_name: selectedRequest.customer_name || "",
      customer_email: selectedRequest.customer_email || "",
      customer_phone: selectedRequest.customer_phone || "",
      item_name: selectedRequest.item_name || "",
      quantity: String(selectedRequest.quantity ?? 1),
      reason: selectedRequest.reason || "Damaged",
    });

    setDetailError("");
    setEditMode(true);
  }

  // NEW: Save edited request
  async function saveEdit(event) {
    event.preventDefault();

    if (!selectedRequest || editLoading) return;

    if (!["Open", "In Review"].includes(selectedRequest.status)) {
      setDetailError("This request can no longer be edited.");
      return;
    }

    const quantity = Number(editForm.quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      setDetailError("Quantity must be a positive whole number.");
      return;
    }

    setEditLoading(true);
    setDetailError("");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/${selectedRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_number: editForm.order_number.trim(),
          customer_name: editForm.customer_name.trim(),
          customer_email: editForm.customer_email.trim(),
          customer_phone: editForm.customer_phone.trim(),
          item_name: editForm.item_name.trim(),
          quantity,
          reason: editForm.reason,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error?.message || "Could not update the request."
        );
      }

      setEditMode(false);
      setMessage(result.message || "Request updated successfully.");
      setRefreshKey((key) => key + 1);

      // Reload details so the screen shows the saved database values
      await openDetails(selectedRequest.id);
    } catch (err) {
      setDetailError(err.message || "Could not update the request.");
    } finally {
      setEditLoading(false);
    }
  }

  // NEW: Soft-delete request
  async function removeRequest() {
    if (!selectedRequest || removeLoading) return;

    if (!["Open", "Rejected"].includes(selectedRequest.status)) {
      setDetailError("Only Open or Rejected requests can be removed.");
      return;
    }

    const confirmed = window.confirm(
      `Remove return request ${selectedRequest.reference}?\n\n` +
        "This will hide it from the dashboard. The record will remain in the database."
    );

    if (!confirmed) return;

    setRemoveLoading(true);
    setDetailError("");
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/${selectedRequest.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error?.message || "Could not remove the request."
        );
      }

      setSelectedRequest(null);
      setEditMode(false);
      setMessage(result.message || "Request removed successfully.");

      // Refresh list and counts
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setDetailError(err.message || "Could not remove the request.");
    } finally {
      setRemoveLoading(false);
    }
  }

  // Add an append-only internal note
  async function addNote(event) {
    event.preventDefault();

    if (!selectedRequest || !note.trim()) return;

    setNoteLoading(true);
    setDetailError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/${selectedRequest.id}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error?.message || "Could not add the note."
        );
      }

      setNote("");
      setMessage("Note added successfully.");

      await openDetails(selectedRequest.id);
    } catch (err) {
      setDetailError(err.message || "Could not add the note.");
    } finally {
      setNoteLoading(false);
    }
  }

  // Change request status
  async function changeStatus(nextStatus) {
    if (!selectedRequest) return;

    const body = { status: nextStatus };

    if (nextStatus === "Approved") {
      body.resolution = resolution;

      if (resolution === "Refund") {
        body.refund_amount = Number(refundAmount);
      }
    }

    setDetailError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/${selectedRequest.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error?.message || "Could not update request status."
        );
      }

      setMessage(result.message || "Status updated successfully.");
      setRefreshKey((key) => key + 1);

      await openDetails(selectedRequest.id);
    } catch (err) {
      setDetailError(err.message || "Could not update status.");
    }
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setReason("");
    setSortBy("created_at");
    setSortOrder("desc");
    setPage(1);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ReturnDesk</h1>
            <p className="mt-1 text-sm text-slate-500">
              Returns management dashboard
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 sm:inline-block">
              Support Agent
            </span>

            <button
              onClick={() => {
                setCreateError("");
                setShowCreate(true);
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              + New return
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {message && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          >
            <span>{message}</span>
            <button
              onClick={() => setMessage("")}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        {/* Dashboard statistics */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total matching requests</p>
            <p className="mt-2 text-3xl font-bold">{pagination.total}</p>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Requests on this page</p>
            <p className="mt-2 text-3xl font-bold">{requests.length}</p>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Current page</p>
            <p className="mt-2 text-3xl font-bold">
              {page}
              <span className="text-lg text-slate-400">
                {" "}/ {pagination.totalPages || 1}
              </span>
            </p>
          </div>
        </div>

        {/* Requests table */}
        <div className="rounded-xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Return requests</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search, filter, and manage customer returns.
            </p>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search customer, order, reference..."
              aria-label="Search return requests"
              className={`${inputClass} sm:col-span-2`}
            />

            <select
              value={status}
              onChange={(e) => changeFilter(setStatus, e.target.value)}
              className={inputClass}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={reason}
              onChange={(e) => changeFilter(setReason, e.target.value)}
              className={inputClass}
              aria-label="Filter by reason"
            >
              <option value="">All reasons</option>
              {reasons.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => changeFilter(setSortBy, e.target.value)}
              className={inputClass}
              aria-label="Sort field"
            >
              <option value="created_at">Sort by created date</option>
              <option value="updated_at">Sort by updated date</option>
              <option value="reference">Sort by reference</option>
              <option value="status">Sort by status</option>
              <option value="order_number">Sort by order</option>
              <option value="customer_name">Sort by customer</option>
            </select>

            <select
              value={sortOrder}
              onChange={(e) => changeFilter(setSortOrder, e.target.value)}
              className={inputClass}
              aria-label="Sort order"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>

            <button
              onClick={clearFilters}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Clear filters
            </button>
          </div>

          {loading && (
            <div className="py-12 text-center text-slate-500">
              Loading return requests...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Unable to load requests</p>
              <p className="mt-1">{error}</p>
              <button
                onClick={() => setRefreshKey((key) => key + 1)}
                className="mt-3 rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && requests.length === 0 && (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <p className="font-medium">No return requests found</p>
              <p className="mt-1 text-sm text-slate-500">
                Try a different search or create a new request.
              </p>
              <button
                onClick={() => {
                  setCreateError("");
                  setShowCreate(true);
                }}
                className="mt-4 font-semibold text-indigo-600 hover:underline"
              >
                Create a return request
              </button>
            </div>
          )}

          {!loading && !error && requests.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Reference / Order</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {requests.map((request) => (
                      <tr
                        key={request.id}
                        tabIndex={0}
                        onClick={() => openDetails(request.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            openDetails(request.id);
                          }
                        }}
                        className="cursor-pointer hover:bg-indigo-50/50 focus:bg-indigo-50"
                      >
                        <td className="px-4 py-4">
                          <p className="font-semibold text-indigo-700">
                            {request.reference}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {request.order_number}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-medium">
                            {request.customer_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {request.customer_email}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <p>{request.item_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Qty: {request.quantity}
                          </p>
                        </td>

                        <td className="px-4 py-4">{request.reason}</td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(
                              request.status
                            )}`}
                          >
                            {request.status}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                          {new Date(request.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Showing {requests.length} of {pagination.total} matching
                  requests
                </p>

                <div className="flex items-center gap-3">
                  <button
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((current) => current - 1)}
                    className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    Previous
                  </button>

                  <span className="text-sm text-slate-600">
                    Page {page} of {pagination.totalPages || 1}
                  </span>

                  <button
                    disabled={page >= pagination.totalPages || loading}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Request details */}
        {(detailLoading || selectedRequest || detailError) && (
          <section className="mt-6 rounded-xl border bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Request details</h2>
                {selectedRequest && (
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedRequest.reference}
                  </p>
                )}
              </div>

              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setDetailError("");
                  setEditMode(false);
                }}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {detailLoading && (
              <p className="py-6 text-sm text-slate-500">
                Loading request details...
              </p>
            )}

            {detailError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {detailError}
              </div>
            )}

            {selectedRequest && !detailLoading && (
              <>
                {/* NEW: Edit form */}
                {editMode ? (
                  <form
                    onSubmit={saveEdit}
                    className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:p-5"
                  >
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">
                        Edit return request
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Update the customer and item details. The server
                        validates whether this request can be edited.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Order number">
                        <input
                          required
                          maxLength={100}
                          value={editForm.order_number}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              order_number: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </Field>

                      <Field label="Customer name">
                        <input
                          required
                          maxLength={150}
                          value={editForm.customer_name}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              customer_name: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </Field>

                      <Field label="Customer email">
                        <input
                          required
                          type="email"
                          maxLength={255}
                          value={editForm.customer_email}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              customer_email: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </Field>

                      <Field label="Customer phone">
                        <input
                          maxLength={30}
                          value={editForm.customer_phone}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              customer_phone: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </Field>

                      <Field label="Item name">
                        <input
                          required
                          maxLength={200}
                          value={editForm.item_name}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              item_name: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </Field>

                      <Field label="Quantity">
                        <input
                          required
                          type="number"
                          min="1"
                          step="1"
                          value={editForm.quantity}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              quantity: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </Field>

                      <Field label="Return reason">
                        <select
                          value={editForm.reason}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              reason: e.target.value,
                            })
                          }
                          className={inputClass}
                        >
                          {reasons.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        disabled={editLoading}
                        onClick={() => {
                          setEditMode(false);
                          setDetailError("");
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        disabled={editLoading}
                        className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {editLoading ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ["Customer", selectedRequest.customer_name],
                        ["Email", selectedRequest.customer_email],
                        [
                          "Phone",
                          selectedRequest.customer_phone || "Not provided",
                        ],
                        ["Order", selectedRequest.order_number],
                        ["Item", selectedRequest.item_name],
                        ["Quantity", selectedRequest.quantity],
                        ["Reason", selectedRequest.reason],
                        [
                          "Resolution",
                          selectedRequest.resolution || "Not decided",
                        ],
                        [
                          "Refund amount",
                          selectedRequest.refund_amount == null
                            ? "—"
                            : `₹${selectedRequest.refund_amount}`,
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-lg bg-slate-50 p-3"
                        >
                          <p className="text-xs font-medium text-slate-500">
                            {label}
                          </p>
                          <p className="mt-1 break-words text-sm font-semibold">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* NEW: Edit and Remove actions */}
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold ${statusStyle(
                          selectedRequest.status
                        )}`}
                      >
                        {selectedRequest.status}
                      </span>

                      {["Open", "In Review"].includes(
                        selectedRequest.status
                      ) && (
                        <button
                          onClick={startEditing}
                          className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                          Edit request
                        </button>
                      )}

                      {["Open", "Rejected"].includes(
                        selectedRequest.status
                      ) && (
                        <button
                          onClick={removeRequest}
                          disabled={removeLoading}
                          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {removeLoading ? "Removing..." : "Remove request"}
                        </button>
                      )}

                      {selectedRequest.status === "Open" && (
                        <button
                          onClick={() => changeStatus("In Review")}
                          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                        >
                          Start review
                        </button>
                      )}

                      {selectedRequest.status === "In Review" && (
                        <>
                          <button
                            onClick={() => changeStatus("Rejected")}
                            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                          >
                            Reject request
                          </button>

                          <div className="flex w-full flex-col gap-3 rounded-lg border p-4 sm:max-w-xl">
                            <h3 className="font-semibold">Approve request</h3>

                            <Field label="Resolution">
                              <select
                                value={resolution}
                                onChange={(e) => {
                                  setResolution(e.target.value);

                                  if (e.target.value !== "Refund") {
                                    setRefundAmount("");
                                  }
                                }}
                                className={inputClass}
                              >
                                <option value="Refund">Refund</option>
                                <option value="Replacement">Replacement</option>
                                <option value="Store Credit">Store Credit</option>
                              </select>
                            </Field>

                            {resolution === "Refund" && (
                              <Field label="Refund amount (₹)">
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  required
                                  value={refundAmount}
                                  onChange={(e) =>
                                    setRefundAmount(e.target.value)
                                  }
                                  placeholder="Enter refund amount"
                                  className={inputClass}
                                />
                              </Field>
                            )}

                            <button
                              disabled={
                                resolution === "Refund" &&
                                (!refundAmount ||
                                  !Number.isFinite(Number(refundAmount)) ||
                                  Number(refundAmount) <= 0)
                              }
                              onClick={() => changeStatus("Approved")}
                              className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Approve request
                            </button>
                          </div>
                        </>
                      )}

                      {selectedRequest.status === "Approved" && (
                        <button
                          onClick={() => changeStatus("Completed")}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                        >
                          Mark completed
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Internal notes remain available in edit mode too */}
                <div className="mt-7 border-t pt-6">
                  <h3 className="text-lg font-semibold">Internal notes</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Notes are added to the history and cannot be edited here.
                  </p>

                  <form
                    onSubmit={addNote}
                    className="mt-4 flex flex-col gap-3 sm:flex-row"
                  >
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      required
                      maxLength={2000}
                      placeholder="Write a note about this return..."
                      className={`${inputClass} flex-1`}
                    />

                    <button
                      disabled={noteLoading || !note.trim()}
                      className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {noteLoading ? "Adding..." : "Add note"}
                    </button>
                  </form>

                  <div className="mt-5 space-y-3">
                    {selectedRequest.notes?.length ? (
                      selectedRequest.notes.map((item) => (
                        <article
                          key={item.id}
                          className="rounded-lg border border-slate-200 p-4"
                        >
                          <p className="whitespace-pre-wrap text-sm">
                            {item.note}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {new Date(item.created_at).toLocaleString()}
                          </p>
                        </article>
                      ))
                    ) : (
                      <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                        No notes have been added yet.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </section>

      {/* Create request modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
            className="my-4 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="create-title" className="text-xl font-bold">
                  Create return request
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the customer and item details.
                </p>
              </div>

              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Close
              </button>
            </div>

            {createError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {createError}
              </div>
            )}

            <form
              onSubmit={createRequest}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <Field label="Order number">
                <input
                  required
                  maxLength={100}
                  value={form.order_number}
                  onChange={(e) =>
                    setForm({ ...form, order_number: e.target.value })
                  }
                  className={inputClass}
                  placeholder="ORD-1002"
                />
              </Field>

              <Field label="Customer name">
                <input
                  required
                  maxLength={150}
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm({ ...form, customer_name: e.target.value })
                  }
                  className={inputClass}
                  placeholder="Customer name"
                />
              </Field>

              <Field label="Customer email">
                <input
                  required
                  type="email"
                  maxLength={255}
                  value={form.customer_email}
                  onChange={(e) =>
                    setForm({ ...form, customer_email: e.target.value })
                  }
                  className={inputClass}
                  placeholder="customer@example.com"
                />
              </Field>

              <Field label="Customer phone (optional)">
                <input
                  maxLength={30}
                  value={form.customer_phone}
                  onChange={(e) =>
                    setForm({ ...form, customer_phone: e.target.value })
                  }
                  className={inputClass}
                  placeholder="Phone number"
                />
              </Field>

              <Field label="Item name">
                <input
                  required
                  maxLength={200}
                  value={form.item_name}
                  onChange={(e) =>
                    setForm({ ...form, item_name: e.target.value })
                  }
                  className={inputClass}
                  placeholder="Product name"
                />
              </Field>

              <Field label="Quantity">
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  className={inputClass}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Return reason">
                  <select
                    value={form.reason}
                    onChange={(e) =>
                      setForm({ ...form, reason: e.target.value })
                    }
                    className={inputClass}
                  >
                    {reasons.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="mt-2 flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border px-5 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createLoading ? "Creating..." : "Create request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
