export interface UrlOpener {
  open(url: string): Promise<void>;
}
