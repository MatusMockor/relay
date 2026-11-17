import {
  type UnsubscribeMailto,
  type UnsubscribeOptions,
  type UnsubscribeUrl,
  UnsubscribeUrlSchema,
} from '@relay/shared';

export type UnsubscribePlan =
  | { readonly kind: 'oneClick'; readonly url: UnsubscribeUrl }
  | { readonly kind: 'link'; readonly url: UnsubscribeUrl }
  | { readonly kind: 'mailto'; readonly mailto: UnsubscribeMailto }
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' };

const safeUrl = (url: string | null): UnsubscribeUrl | null =>
  url !== null && UnsubscribeUrlSchema.safeParse(url).success ? url : null;

export const planUnsubscribe = (options: UnsubscribeOptions | undefined): UnsubscribePlan => {
  if (options === undefined) {
    return { kind: 'loading' };
  }
  const url = safeUrl(options.url);
  if (url !== null && options.oneClick) {
    return { kind: 'oneClick', url };
  }
  if (url !== null) {
    return { kind: 'link', url };
  }
  if (options.mailto !== null) {
    return { kind: 'mailto', mailto: options.mailto };
  }
  return { kind: 'none' };
};

export const NO_UNSUBSCRIBE_HINT = 'Odosielateľ neposiela odkaz na odhlásenie';
