import { useState } from "react";

export function Page({ title, description, actions, children, className = "" }) {
  return (
    <main className={`body admin-extra ${className}`.trim()}>
      <div className="admin-row">
        <div>
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
        <div className="admin-actions">{actions}</div>
      </div>
      {children}
    </main>
  );
}

export function Card({ title, children }) {
  return (
    <section className="card admin-card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function Button({ children, primary, ...props }) {
  return (
    <button type="button" className={primary ? "btn pri" : "btn"} {...props}>
      {children}
    </button>
  );
}

export function Chip({ tone, children }) {
  return <span className={tone ? "chip " + tone : "chip"}>{children}</span>;
}

export function Tabs({ values, value, onChange }) {
  return (
    <div className="admin-tabs" aria-label="Views">
      {values.map((tab) => (
        <button
          key={tab}
          type="button"
          aria-pressed={value === tab}
          className={value === tab ? "tab tabon" : "tab"}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Select({ label, options, value, onChange }) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </Field>
  );
}

export function Table({ headers, rows, empty = "No results." }) {
  return (
    <div className="admin-table">
      <table>
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th scope="col" key={header || i}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={row.key ?? i}>
                {(Array.isArray(row) ? row : row.cells).map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function useAction(action) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(name, payload, update) {
    setBusy(true);
    setMessage("");
    try {
      const result = await action(name, payload);
      if (result === false) return false;
      update?.();
      setMessage(result?.message ?? "");
      return true;
    } catch (error) {
      setMessage(error?.message || "The action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    submit,
    busy,
    feedback: message && (
      <p className="muted" role="status">
        {message}
      </p>
    ),
  };
}
