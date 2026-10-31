"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { RECOGNITION_POINTS } from "../model";
import styles from "./recognition.module.css";

export interface RecognitionToastProps {
  title: string;
  body: string;
  points?: number;
  durationMs?: number;
  onClose(): void;
}

/** Announces a new award without stealing focus. Pass durationMs={0} to keep it until closed. */
export function RecognitionToast({ title, body, points = RECOGNITION_POINTS, durationMs = 7000, onClose }: RecognitionToastProps) {
  useEffect(() => {
    if (!durationMs) return;
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onClose]);

  return <div className={styles.toast} role="status" aria-live="polite">
    <span className={styles.toastPoints} aria-hidden="true">+{points}</span>
    <span className={styles.toastText}>
      <span className={styles.toastTitle}>{title}</span>
      <span className={styles.toastBody}>{body}</span>
    </span>
    <button type="button" className={styles.toastClose} onClick={onClose} aria-label="Fechar aviso">
      <X size={20} aria-hidden="true" />
    </button>
  </div>;
}
