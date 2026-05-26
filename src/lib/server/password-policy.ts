export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
};

export type PasswordChangeValidation =
  | { ok: true; input: PasswordChangeInput }
  | { ok: false; error: string };

export function parsePasswordChangeInput(body: unknown): PasswordChangeValidation {
  const source = body && typeof body === "object"
    ? body as { currentPassword?: unknown; newPassword?: unknown }
    : {};
  const currentPassword = typeof source.currentPassword === "string" ? source.currentPassword : "";
  const newPassword = typeof source.newPassword === "string" ? source.newPassword : "";

  if (!currentPassword || newPassword.length < 8) {
    return {
      ok: false,
      error: "Current password and a new password of at least 8 characters are required."
    };
  }

  return {
    ok: true,
    input: {
      currentPassword,
      newPassword
    }
  };
}

