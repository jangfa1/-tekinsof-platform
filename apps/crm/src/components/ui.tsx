import Link from "next/link";
import {
  type ButtonHTMLAttributes,
  Children,
  cloneElement,
  type InputHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

// Stateless primitives shared by every CRM page. Token classes only (blueprint §7), no hex values.

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const buttonVariants = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  accent: "bg-accent text-accent-fg hover:opacity-90",
  ghost: "border border-border bg-transparent text-fg hover:bg-surface",
  // primary-fg is white in light mode and ink in dark mode, keeping AA contrast on both destructives.
  danger: "bg-destructive text-primary-fg hover:opacity-90",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  type: "button" | "submit" | "reset";
  variant?: keyof typeof buttonVariants;
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-60",
        buttonVariants[variant],
        className,
      )}
    />
  );
}

const controlClass =
  "min-h-9 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm text-fg aria-[invalid=true]:border-destructive";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(controlClass, className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(controlClass, className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(controlClass, "min-h-24", className)} />;
}

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  help?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
};

// Wires label, help text and error to the single control passed as `children`.
export function Field({ id, label, error, help, children }: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const control = Children.only(children);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {isValidElement(control)
        ? cloneElement(control, {
            id,
            "aria-describedby": describedBy,
            "aria-invalid": error ? true : undefined,
          })
        : control}
      {help ? (
        <p id={helpId} className="text-sm text-fg-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-surface text-fg",
  accent: "bg-accent text-accent-fg",
  success: "bg-surface text-success",
  warning: "bg-surface text-warning",
  danger: "bg-surface text-destructive",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[var(--radius-control)] border border-border px-2 py-1 text-xs font-medium",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-[var(--radius-card)] border border-border bg-background p-6",
        className,
      )}
    >
      {title ? <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

export type Column<T> = {
  key: string;
  label: string;
  numeric?: boolean;
  render: (row: T) => ReactNode;
};

export function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  "h-11 px-4 text-left font-medium text-fg-muted",
                  column.numeric && "text-right",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="h-11 border-t border-border">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cx("px-4 py-2", column.numeric && "text-right tabular-nums")}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mt-1 text-sm text-fg-muted">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// Page links keep every other query parameter (filters live in the URL).
export function Pagination({
  page,
  pageCount,
  params = {},
}: {
  page: number;
  pageCount: number;
  params?: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") query.set(key, value);
    }
    query.set("page", String(target));
    return `?${query.toString()}`;
  };
  const linkClass =
    "min-h-9 rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm hover:bg-surface";
  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass}>
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-fg-muted tabular-nums">
        Página {page} de {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={linkClass}>
          Siguiente
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
