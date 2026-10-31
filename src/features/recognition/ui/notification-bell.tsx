"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { NotificationView } from "../model";
import { recognitionApi, RecognitionApiError } from "./api";
import { RecognitionToast } from "./recognition-toast";
import styles from "./recognition.module.css";

export interface NotificationBellProps {
  /** Polling interval while the tab is visible. 0 disables polling. */
  pollMs?: number;
  /** Shows a toast when a new unread notification arrives after the first load. */
  toast?: boolean;
}

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

export function NotificationBell({ pollMs = 60_000, toast = true }: NotificationBellProps) {
  const panelId = useId();
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<NotificationView | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await recognitionApi.notifications();
      setItems(data.notifications);
      setUnread(data.unreadCount);
      setError(null);
      if (seen.current) {
        const arrived = data.notifications.find((item) => !item.read && !seen.current!.has(item.id));
        if (arrived && toast) setFresh(arrived);
      }
      seen.current = new Set(data.notifications.map((item) => item.id));
    } catch (failure) {
      setError(failure instanceof RecognitionApiError ? failure.message : "Não foi possível carregar os avisos.");
    }
  }, [toast]);

  useEffect(() => {
    void load();
    if (!pollMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [load, pollMs]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(item: NotificationView) {
    if (item.read) return;
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
    setUnread((count) => Math.max(0, count - 1));
    try {
      await recognitionApi.markRead(item.id);
    } catch {
      void load();
    }
  }

  const closeToast = useCallback(() => setFresh(null), []);
  const label = unread === 0 ? "Avisos, nenhum novo" : unread === 1 ? "Avisos, 1 novo" : `Avisos, ${unread} novos`;

  return <div className={styles.bellWrap} ref={wrapper}>
    <button
      ref={button} type="button" className={styles.bellButton} aria-label={label}
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}
    >
      <Bell size={20} aria-hidden="true" />
      {unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className={styles.panel} id={panelId}>
      <h2 className={styles.panelTitle}>Avisos</h2>
      {error && <p className={styles.notificationBody} role="alert" style={{ padding: 8 }}>{error}</p>}
      {!error && items.length === 0 && <p className={styles.notificationBody} style={{ padding: 8 }}>Nada por aqui ainda.</p>}
      {items.length > 0 && <ul className={styles.notificationList}>
        {items.map((item) => <li key={item.id}>
          <button type="button" className={styles.notificationItem} data-unread={!item.read} onClick={() => void markRead(item)}>
            <span className={styles.notificationTitle}>{item.title}{item.read ? "" : <span className={styles.srOnly}> (novo)</span>}</span>
            <span className={styles.notificationBody}>{item.body}</span>
            <span className={styles.notificationTime}>{timeFormatter.format(new Date(item.createdAt))}</span>
          </button>
        </li>)}
      </ul>}
    </div>}
    {fresh && <RecognitionToast title={fresh.title} body={fresh.body} onClose={closeToast} />}
  </div>;
}
