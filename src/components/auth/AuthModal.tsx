"use client";

import Modal from "@/components/ui/Modal";
import AccountPanel from "@/components/auth/AccountPanel";

/** sidebar sign-in/account dialog — the same surface as the /account page,
 * rendered in a modal. All state lives in AccountPanel. */
export default function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Account">
      <AccountPanel onClose={onClose} />
    </Modal>
  );
}
