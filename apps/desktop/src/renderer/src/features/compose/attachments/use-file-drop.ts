import { type DragEvent, useRef, useState } from 'react';
import { filesOf } from './attachment-inputs';

const carriesFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer.types).includes('Files');

export const useFileDrop = (onFiles: (files: File[]) => void) => {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  return {
    active,
    handlers: {
      onDragEnter: (event: DragEvent) => {
        if (!carriesFiles(event)) {
          return;
        }
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      },
      onDragOver: (event: DragEvent) => {
        if (!carriesFiles(event)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: (event: DragEvent) => {
        if (!carriesFiles(event)) {
          return;
        }
        depth.current = Math.max(0, depth.current - 1);
        setActive(depth.current > 0);
      },
      onDrop: (event: DragEvent) => {
        if (!carriesFiles(event)) {
          return;
        }
        event.preventDefault();
        depth.current = 0;
        setActive(false);
        onFiles(filesOf(event.dataTransfer.files));
      },
    },
  };
};
