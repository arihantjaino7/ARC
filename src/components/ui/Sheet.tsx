"use client";

// Bottom sheet — spring up, drag handle, velocity-based dismiss, blurred
// backdrop. §3.1 #8. This is the one `glass-3` blur allowed alongside the tab
// bar's own — see docs/PLAN-DESIGN.md §1.2's two-live-blur budget: a screen
// that opens a Sheet should not also have some other blurred surface active.

import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { useEffect } from "react";
import { springs } from "./motion";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 500;

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function handleDragEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) {
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* No blur on the scrim itself (D11 blur-budget fix) — the sheet's
              own glass-3 panel below is the one "sheet" blur layer the §1.2
              budget allows alongside the tab bar's; a blurred scrim on top of
              that would silently add a second. A plain dimming overlay reads
              just as well here. */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-hero border border-b-0 border-glass-3-border bg-glass-3 backdrop-blur-[40px] backdrop-saturate-[1.6] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3"
            style={{ boxShadow: "var(--shadow-glass-hairline)" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={reduceMotion ? { duration: 0.2 } : springs.sheet}
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-glass-2-border" />
            {title && (
              <h2 className="mb-3 text-section text-ink">{title}</h2>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
