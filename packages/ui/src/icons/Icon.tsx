import {
  FOLDER_ICONS,
  type FolderIconName,
  SPARK_PATH,
  STROKE_ICONS,
  type StrokeIconName,
} from './paths';

export interface IconProps {
  readonly name: StrokeIconName;
  readonly size?: number;
  readonly strokeWidth?: number;
}

export function Icon({ name, size = 15, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: STROKE_ICONS[name] }}
    />
  );
}

export function FolderIcon({ name }: { readonly name: FolderIconName }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: FOLDER_ICONS[name] }}
    />
  );
}

export function Spark() {
  return (
    <svg className="spark" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d={SPARK_PATH} />
    </svg>
  );
}
