export interface ExistingAccountGuard {
  firstAndLastNames: () => Promise<[string, string?]>;
  onError: (err: Error) => void | Promise<boolean>;
  signUpWasRequired: () => boolean;
}

export function existingAccountGuard(reportRetryableError: (err: Error) => void): ExistingAccountGuard {
  let signUpRequired = false;

  return {
    firstAndLastNames: async () => {
      signUpRequired = true;
      throw new Error("This setup only connects existing Telegram accounts.");
    },
    onError: (err) => {
      if (signUpRequired) return Promise.resolve(true);
      reportRetryableError(err);
    },
    signUpWasRequired: () => signUpRequired,
  };
}
