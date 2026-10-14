/** Full-page navigation away from the app (e.g. to the payment provider). A seam for tests. */
export const browser = {
  assign(url: string): void {
    window.location.assign(url);
  },
};
