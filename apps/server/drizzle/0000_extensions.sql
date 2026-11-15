CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.relay_unaccent(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, input) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.relay_search_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT public.relay_unaccent(regexp_replace(input, '[@._/:+-]+', ' ', 'g')) $$;
