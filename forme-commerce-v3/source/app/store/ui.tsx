"use client";
import React, { useEffect, useRef } from "react";
import { X, ImageIcon } from "lucide-react";

export function Dialog({ title, children, onClose, className = "", description }: { title: string; children: React.ReactNode; onClose: () => void; className?: string; description?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current; dialog?.showModal();
    const onNativeClose = () => close.current();
    dialog?.addEventListener("close", onNativeClose);
    return () => { dialog?.removeEventListener("close", onNativeClose); dialog?.close(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dialog-inner">
      <div className="dialog-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-btn" type="button" aria-label="Close dialog" onClick={onClose}><X size={21}/></button></div>
      {children}
    </div>
  </dialog>;
}
export function Photo({ src, alt, className = "", eager = false }: { src: string; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = React.useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className={`photo-placeholder ${className}`} role="img" aria-label={alt}><ImageIcon size={32}/><span>Image unavailable</span></div>;
  return <img className={className} src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)}/>;
}
export function ErrorMessage({ message }: { message: string }) { return message ? <p className="error-message" role="alert">{message}</p> : null; }
export function errorText(error: unknown) {
  if (error && typeof error === "object" && "issues" in error) return (error as { issues: { message: string }[] }).issues[0]?.message ?? "Check the form fields.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
