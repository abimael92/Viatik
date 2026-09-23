-- Ensure activity personal budget CAS inserts provide required metadata explicitly.
-- jsonb_populate_record materializes omitted timestamp fields as NULL, so the
-- table defaults are not applied when inserting the populated composite row.

CREATE OR REPLACE FUNCTION public.sync_activity_personal_budget_cas_upsert(
  p_payload jsonb,
  p_base_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid := (p_payload ->> 'id')::uuid;
  v_current public.activity_personal_budgets;
  v_row public.activity_personal_budgets;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'p_payload.id is required' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('activity_personal_budgets:' || v_id::text, 0));
  SELECT * INTO v_current FROM public.activity_personal_budgets WHERE id = v_id FOR UPDATE;

  IF NOT FOUND THEN
    IF p_base_updated_at IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'not_found');
    END IF;

    INSERT INTO public.activity_personal_budgets
      SELECT (
        jsonb_populate_record(
          NULL::public.activity_personal_budgets,
          p_payload - 'created_at' - 'updated_at' || jsonb_build_object(
            'id', v_id,
            'created_at', now(),
            'updated_at', now()
          )
        )
      ).*
      RETURNING * INTO v_row;
  ELSIF p_base_updated_at IS NULL OR v_current.updated_at <> p_base_updated_at THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'server_updated_at', v_current.updated_at,
      'current', to_jsonb(v_current)
    );
  ELSE
    UPDATE public.activity_personal_budgets
    SET amount = (p_payload ->> 'amount')::numeric,
        currency = p_payload ->> 'currency'
    WHERE id = v_id
      AND user_id = auth.uid()
      AND updated_at = p_base_updated_at
    RETURNING * INTO v_row;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  RETURN jsonb_build_object(
    'status', 'applied',
    'server_updated_at', v_row.updated_at,
    'current', to_jsonb(v_row)
  );
END;
$$;
