/**
 * Shared shape for `useActionState` results. Lives outside the server-only
 * modules so Client Components can import the initial state.
 */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set by actions that stay on the page, so the form can clear itself. */
  ok?: boolean;
};

export const EMPTY_FORM_STATE: FormState = {};
