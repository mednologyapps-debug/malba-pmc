-- MALBA PMC | Source of truth for physical book prices.
-- This is a service-role-only RPC, called after a CMS admin session and CSRF check.
-- Both the CMS and the event are updated in a single PostgreSQL transaction.
CREATE OR REPLACE FUNCTION public.malba_set_book_prices(
 p_launch_price numeric,
 p_regular_price numeric,
 p_cms_revision integer,
 p_event_revision integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
 ev public.book_events%ROWTYPE;
 doc public.cms_documents%ROWTYPE;
 new_event jsonb;
 now_at timestamptz := now();
BEGIN
 IF p_launch_price IS NULL OR p_regular_price IS NULL
 OR p_launch_price <= 0 OR p_regular_price < p_launch_price
 OR p_regular_price >= 100000
 OR p_launch_price <> round(p_launch_price,2)
 OR p_regular_price <> round(p_regular_price,2)
 THEN RAISE EXCEPTION 'Precio inválido. El precio regular debe ser mayor o igual al de lanzamiento, con máximo dos decimales.'; END IF;
 -- Fixed lock order in all calls; stale editor data is rejected.
 SELECT * INTO ev FROM public.book_events WHERE id='presentacion-libro' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evento de libro no encontrado'; END IF;
 SELECT * INTO doc FROM public.cms_documents WHERE id='site' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CMS no encontrado'; END IF;
 IF ev.revision <> p_event_revision OR doc.revision <> p_cms_revision
 THEN RAISE EXCEPTION 'Los datos fueron modificados. Recarga el panel e inténtalo de nuevo.'; END IF;
 IF doc.draft #> '{publications,book}' IS NULL OR doc.published #> '{publications,book}' IS NULL
 THEN RAISE EXCEPTION 'No se encontró el libro en el CMS'; END IF;
 new_event=jsonb_set(jsonb_set(ev.config,'{price}',to_jsonb(p_launch_price),true),'{regularPrice}',to_jsonb(p_regular_price),true);
 UPDATE public.book_events
 SET config=new_event,revision=revision+1,updated_at=now_at
 WHERE id='presentacion-libro';
 INSERT INTO public.cms_history(data,revision,username) VALUES(doc.draft,doc.revision,'admin · precio libro');
 UPDATE public.cms_documents
 SET draft=jsonb_set(draft,'{publications,book,physicalPrice}',to_jsonb(p_launch_price),true),
 published=jsonb_set(published,'{publications,book,physicalPrice}',to_jsonb(p_launch_price),true),
 revision=revision+1,updated_at=now_at,published_at=now_at
 WHERE id='site';
 RETURN jsonb_build_object('launchPrice',p_launch_price,'regularPrice',p_regular_price,
 'cmsRevision',doc.revision+1,'eventRevision',ev.revision+1,'launchUntil',new_event->>'launchUntil');
END $$;
REVOKE ALL ON FUNCTION public.malba_set_book_prices(numeric,numeric,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.malba_set_book_prices(numeric,numeric,integer,integer) TO service_role;
