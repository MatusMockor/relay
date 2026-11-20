export const settled = <Result>(work: () => Result): Promise<Result> => {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};
