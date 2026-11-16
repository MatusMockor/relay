export interface FileDialog {
  chooseFiles(): Promise<readonly string[]>;
}
