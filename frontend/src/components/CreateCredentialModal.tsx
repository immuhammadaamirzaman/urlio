import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import { createCredential } from "../api/credentials";
import type { CredentialCreateRequest } from "../api/credentials";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import type {
  CredentialFieldErrors,
  CredentialFieldValues,
} from "../lib/credentialFields";
import { isCredentialField, validateCredentialFields } from "../lib/credentialFields";
import { errorMessage } from "../lib/errors";
import { CredentialFormFields } from "./CredentialFormFields";
import { Modal } from "./Modal";

interface CreateCredentialModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY_VALUES: CredentialFieldValues = {
  masterPassword: "",
  usernameOrEmail: "",
  password: "",
  detail: "",
  url: "",
};

export function CreateCredentialModal({
  open,
  onClose,
  onCreated,
}: CreateCredentialModalProps) {
  const toast = useToast();
  const { isGuest } = useAuth();

  const [values, setValues] = useState<CredentialFieldValues>(EMPTY_VALUES);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CredentialFieldErrors>({});

  // Clear all form state when the modal opens (fresh form each time).
  useEffect(() => {
    if (!open) return;
    setValues(EMPTY_VALUES);
    setFieldErrors({});
    setLoading(false);
  }, [open]);

  function patchValues(patch: Partial<CredentialFieldValues>) {
    setValues((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const errors = validateCredentialFields(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    const payload: CredentialCreateRequest = {
      master_password: values.masterPassword,
      username_or_email: values.usernameOrEmail,
      password: values.password,
      detail: values.detail,
      url: values.url || null,
    };

    try {
      await createCredential(payload);
      toast.success("Credential created successfully.");
      onCreated();
      onClose();
    } catch (err) {
      // A 422 names the offending field, so show it inline; anything else is not
      // attributable to one input and belongs in a toast.
      if (err instanceof ApiError && err.status === 422) {
        setFieldErrors(
          isCredentialField(err.field)
            ? { [err.field]: err.message }
            : { detail: err.message },
        );
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} title="New Credential" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* The one place in the preview where a visitor could lose something real. A
            sandbox credential is held in this browser as typed — there is no server-side
            key to encrypt it under — so this warning belongs next to the inputs. */}
        {isGuest && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <strong>Guest preview:</strong> this is stored unencrypted in your browser and
            erased when you leave the preview. Use made-up values — never a real password.
          </p>
        )}
        <CredentialFormFields
          values={values}
          errors={fieldErrors}
          onChange={patchValues}
        />
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating…" : "Create Credential"}
        </button>
      </form>
    </Modal>
  );
}
