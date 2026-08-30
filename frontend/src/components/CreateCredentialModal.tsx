import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import { createCredential } from "../api/credentials";
import type { CredentialCreateRequest } from "../api/credentials";
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
