import { Button } from '@relay/ui';
import { GoogleMark } from './GoogleMark';
import { useGoogleOAuth } from './use-google-oauth';

export interface GoogleSignInButtonProps {
  readonly email: string;
  readonly onDone: () => void;
}

export function GoogleSignInButton({ email, onDone }: GoogleSignInButtonProps) {
  const oauth = useGoogleOAuth(onDone);
  const waiting = oauth.phase === 'waiting';
  return (
    <>
      <Button
        className="oauth-btn"
        onClick={() => {
          oauth.start(email);
        }}
        disabled={waiting}
      >
        <GoogleMark />
        {waiting ? 'Čakám na prihlásenie v prehliadači…' : 'Prihlásiť cez Google'}
      </Button>
      {waiting ? (
        <Button variant="ghost" className="oauth-cancel" onClick={oauth.cancel}>
          Zrušiť prihlásenie cez Google
        </Button>
      ) : null}
      {oauth.error === null ? null : (
        <p className="err oauth-err" role="alert">
          {oauth.error}
        </p>
      )}
    </>
  );
}
