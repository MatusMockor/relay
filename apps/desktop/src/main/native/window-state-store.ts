import { JsonFile } from '../storage/json-file';
import { DEFAULT_WINDOW_STATE, type WindowState, WindowStateSchema } from './window-bounds';

export class WindowStateStore {
  private readonly file: JsonFile<typeof WindowStateSchema>;

  constructor(path: string) {
    this.file = new JsonFile(path, WindowStateSchema);
  }

  async load(): Promise<WindowState> {
    return (await this.file.read()) ?? DEFAULT_WINDOW_STATE;
  }

  save(state: WindowState): Promise<void> {
    return this.file.write(state);
  }
}
