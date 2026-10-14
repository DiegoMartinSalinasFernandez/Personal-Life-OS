"use client";

import { create } from "zustand";
import { Dialog } from "./dialog";
import { Button } from "./button";

interface ConfirmOpts {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
const useConfirm = create<{ opts: ConfirmOpts | null; resolve: ((v: boolean) => void) | null }>(() => ({ opts: null, resolve: null }));

/** Promise-based confirmation for destructive actions. */
export function confirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => useConfirm.setState({ opts, resolve }));
}

export function ConfirmHost() {
  const { opts, resolve } = useConfirm();
  const close = (v: boolean) => {
    resolve?.(v);
    useConfirm.setState({ opts: null, resolve: null });
  };
  return (
    <Dialog
      open={!!opts}
      onClose={() => close(false)}
      title={opts?.title ?? ""}
      size="sm"
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant={opts?.danger === false ? "primary" : "danger"} onClick={() => close(true)} autoFocus>
            {opts?.confirmLabel ?? "Delete"}
          </Button>
        </>
      }
    >
      {opts?.description ? <div className="text-base text-ink-2">{opts.description}</div> : null}
    </Dialog>
  );
}
