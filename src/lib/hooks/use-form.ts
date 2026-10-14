"use client";

import { useCallback, useState } from "react";
import type { ZodType } from "zod";

/**
 * Minimal form state + Zod validation. Values are kept as strings/booleans
 * as the inputs produce them; the schema parses them into domain values.
 */
export function useForm<V extends Record<string, unknown>, Out>(schema: ZodType<Out>, initial: V) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof V | "form", string>>>({});
  const [submitted, setSubmitted] = useState(false);

  const set = useCallback(<K extends keyof V>(key: K, value: V[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const validate = useCallback(
    (vals: V = values): { ok: true; data: Out } | { ok: false } => {
      const res = schema.safeParse(vals);
      if (res.success) {
        setErrors({});
        return { ok: true, data: res.data };
      }
      const next: Partial<Record<keyof V | "form", string>> = {};
      for (const issue of res.error.issues) {
        const k = (issue.path[0] as keyof V) ?? "form";
        if (!next[k]) next[k] = issue.message;
      }
      setErrors(next);
      return { ok: false };
    },
    [schema, values],
  );

  const handleSubmit = useCallback(
    (onValid: (data: Out) => void) => (e?: React.FormEvent) => {
      e?.preventDefault();
      setSubmitted(true);
      const r = validate();
      if (r.ok) onValid(r.data);
    },
    [validate],
  );

  return { values, set, setValues, errors, setErrors, handleSubmit, submitted, reset: () => setValues(initial) };
}
