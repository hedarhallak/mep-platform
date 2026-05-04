--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg110+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg110+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: attendance_apply_geo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attendance_apply_geo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_site_location geography;
  v_radius_m int;
  v_dist_m double precision;
BEGIN
  -- Only compute when we have required inputs
  IF NEW.project_id IS NULL OR NEW.check_in_location IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pick the active work site for this project (closest if multiple)
  SELECT ws.site_location, ws.geofence_radius_m
    INTO v_site_location, v_radius_m
  FROM public.work_sites ws
  WHERE ws.project_id = NEW.project_id
    AND ws.is_active = TRUE
  ORDER BY ST_Distance(ws.site_location, NEW.check_in_location)
  LIMIT 1;

  -- If no active site configured, leave geo fields null
  IF v_site_location IS NULL OR v_radius_m IS NULL THEN
    NEW.distance_to_site_m := NULL;
    NEW.inside_geofence := NULL;
    RETURN NEW;
  END IF;

  v_dist_m := ST_Distance(v_site_location, NEW.check_in_location);

  NEW.distance_to_site_m := v_dist_m;
  NEW.inside_geofence := (v_dist_m <= v_radius_m);

  RETURN NEW;
END;
$$;


--
-- Name: attendance_manual_check_in(integer, integer, double precision, double precision, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attendance_manual_check_in(p_employee_id integer, p_project_id integer, p_lat double precision, p_lng double precision, p_check_in_at timestamp with time zone DEFAULT now()) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_site_location     geography;
  v_radius_m          integer;
  v_distance_m        double precision;
  v_inside_geofence   boolean;
  v_status            text;
  v_attendance_id     bigint;
BEGIN
  -- Get active work site for the project
  SELECT ws.site_location::geography, ws.geofence_radius_m
    INTO v_site_location, v_radius_m
  FROM work_sites ws
  WHERE ws.project_id = p_project_id
    AND ws.is_active = true
  ORDER BY ws.created_at DESC
  LIMIT 1;

  IF v_site_location IS NULL OR v_radius_m IS NULL THEN
    RAISE EXCEPTION 'No active work site/geofence found for project_id=%', p_project_id;
  END IF;

  -- Compute distance from submitted GPS point to site location
  v_distance_m :=
    ST_Distance(
      v_site_location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    );

  v_inside_geofence := (v_distance_m <= v_radius_m);

  -- Status rule: outside geofence => manager approval required
  IF v_inside_geofence THEN
    v_status := 'OPEN';
  ELSE
    v_status := 'PENDING_MANAGER_APPROVAL';
  END IF;

  INSERT INTO attendance_logs (
    employee_id,
    project_id,
    check_in_at,
    check_in_location,
    status,
    inside_geofence,
    distance_to_site_m,
    manager_approved,
    created_at
  )
  VALUES (
    p_employee_id,
    p_project_id,
    p_check_in_at,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    v_status,
    v_inside_geofence,
    v_distance_m,
    false,
    now()
  )
  RETURNING attendance_id INTO v_attendance_id;

  RETURN v_attendance_id;
END;
$$;


--
-- Name: attendance_work_date(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attendance_work_date(ts timestamp with time zone) RETURNS date
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT (ts AT TIME ZONE 'UTC')::date
$$;


--
-- Name: audit_attendance_decision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_attendance_decision() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (NEW.status IN ('APPROVED','REJECTED')) AND (OLD.status = 'PENDING') THEN
    INSERT INTO attendance_approvals_audit (attendance_id, manager_id, decision, note, decided_at)
    VALUES (NEW.attendance_id, NEW.approved_by, NEW.status, NEW.approval_note, COALESCE(NEW.approved_at, now()));
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: audit_logs_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_logs_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable ??? updates and deletes are not allowed';
END;
$$;


--
-- Name: block_legacy_assignment_writes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_legacy_assignment_writes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Legacy assignment tables are frozen. Use public.assignments as Source of Truth.';
END;
$$;


--
-- Name: deliver_pending_tasks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deliver_pending_tasks() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- When a new assignment is created, find any pending task_recipients
  -- for this employee on this project and mark them as delivered
  UPDATE public.task_recipients
  SET
    status               = 'SENT',
    expected_project_id  = NULL,
    created_at           = NOW()
  WHERE
    recipient_id        = NEW.employee_id
    AND expected_project_id = NEW.project_id
    AND status          = 'PENDING';

  -- If all recipients of a message are now delivered, update message status
  UPDATE public.task_messages tm
  SET delivery_status = 'SENT'
  WHERE
    tm.delivery_status = 'PENDING_ASSIGNMENT'
    AND NOT EXISTS (
      SELECT 1 FROM public.task_recipients tr
      WHERE tr.message_id = tm.id
        AND tr.status = 'PENDING'
    );

  RETURN NEW;
END;
$$;


--
-- Name: fn_absence_validate_fill(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_absence_validate_fill() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  a_employee INTEGER;
  a_project  INTEGER;
  a_from DATE;
  a_to   DATE;
  v_has_attendance INTEGER;
BEGIN
  SELECT employee_id, project_id, assigned_from::date, COALESCE(assigned_to::date, '9999-12-31'::date)
    INTO a_employee, a_project, a_from, a_to
  FROM public.project_employee_assignments
  WHERE assignment_id = NEW.assignment_id
  LIMIT 1;

  IF a_employee IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';
  END IF;

  -- Must be within assignment range
  IF NEW.work_date < a_from OR NEW.work_date > a_to THEN
    RAISE EXCEPTION 'ABSENCE_DATE_OUTSIDE_ASSIGNMENT_RANGE';
  END IF;

  -- Fill denormalized columns
  NEW.employee_id := a_employee;
  NEW.project_id  := a_project;

  -- Block absence if any check-in already exists that day
  SELECT 1 INTO v_has_attendance
  FROM public.attendance_logs al
  WHERE al.employee_id = NEW.employee_id
    AND al.work_date = NEW.work_date
    AND al.check_in_at IS NOT NULL
  LIMIT 1;

  IF v_has_attendance IS NOT NULL THEN
    RAISE EXCEPTION 'CANNOT_SUBMIT_ABSENCE_AFTER_CHECKIN';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_attendance_apply_geo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_attendance_apply_geo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_site geography;
  v_radius_m integer;
  v_dist_m double precision;
BEGIN
  -- Get active site geofence for the project (latest active)
  SELECT ws.site_location, ws.geofence_radius_m
    INTO v_site, v_radius_m
  FROM public.work_sites ws
  WHERE ws.project_id = NEW.project_id
    AND ws.is_active = true
  ORDER BY ws.created_at DESC
  LIMIT 1;

  -- If no site or no check-in location, keep geo fields null
  IF v_site IS NULL OR NEW.check_in_location IS NULL THEN
    NEW.distance_to_site_m := NULL;
    NEW.inside_geofence := NULL;
    RETURN NEW;
  END IF;

  -- Distance in meters (both are geography)
  v_dist_m := ST_Distance(NEW.check_in_location, v_site);

  NEW.distance_to_site_m := v_dist_m;
  NEW.inside_geofence := (v_radius_m IS NOT NULL AND v_dist_m <= v_radius_m);

  RETURN NEW;
END;
$$;


--
-- Name: fn_attendance_block_if_absent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_attendance_block_if_absent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_has_absence INTEGER;
  v_day DATE;
BEGIN
  v_day := (NEW.check_in_at)::date;

  SELECT 1 INTO v_has_absence
  FROM public.attendance_absences aa
  WHERE aa.employee_id = NEW.employee_id
    AND aa.work_date = v_day
  LIMIT 1;

  IF v_has_absence IS NOT NULL THEN
    RAISE EXCEPTION 'CANNOT_CHECKIN_WHEN_ABSENT';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_attendance_check_in(integer, integer, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_attendance_check_in(p_employee_id integer, p_project_id integer, p_lat double precision, p_lng double precision) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_attendance_id bigint;
    v_site geometry;
    v_radius integer;
    v_distance_m double precision;
BEGIN
    SELECT
        ws.site_location,
        ws.geofence_radius_m
    INTO
        v_site,
        v_radius
    FROM work_sites ws
    WHERE ws.project_id = p_project_id
      AND ws.is_active = true
    LIMIT 1;

    v_distance_m :=
        ST_Distance(
            v_site::geography,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        );

    INSERT INTO attendance_logs (
        employee_id,
        project_id,
        check_in_at,
        check_in_location,
        inside_geofence,
        distance_to_site_m,
        status
    )
    VALUES (
        p_employee_id,
        p_project_id,
        now(),
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
        v_distance_m <= v_radius,
        v_distance_m,
        'OPEN'
    )
    RETURNING attendance_id INTO v_attendance_id;

    RETURN v_attendance_id;
END;
$$;


--
-- Name: get_employee_sensitive(bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_employee_sensitive(p_employee_id bigint, p_field_key text, p_user_id bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_company_id bigint;
  v_role_key text;
  v_allowed boolean := false;
  v_reason text := '';
  v_key text;
  v_value text;
BEGIN
  -- 1) get user role + company
  SELECT u.company_id, r.role_key
    INTO v_company_id, v_role_key
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  WHERE u.user_id = p_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Invalid user_id %', p_user_id;
  END IF;

  -- 2) basic authorization rule (you can expand later)
  IF v_role_key IN ('admin','accountant') THEN
    v_allowed := true;
    v_reason := 'PERMITTED';
  ELSE
    v_allowed := false;
    v_reason := 'DENIED: role=' || COALESCE(v_role_key,'NULL');
  END IF;

  -- 3) always log the attempt
  INSERT INTO sensitive_access_log (
    company_id, user_id, employee_id, field_key, action, allowed, reason
  )
  VALUES (
    v_company_id, p_user_id, p_employee_id, p_field_key, 'VIEW', v_allowed, v_reason
  );

  -- 4) if not allowed -> return null (no data leakage)
  IF NOT v_allowed THEN
    RETURN NULL;
  END IF;

  -- 5) fetch encryption key from session setting
  -- Server must set it per connection:  SET app.enc_key = '...';
  v_key := current_setting('app.enc_key', true);

  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE EXCEPTION 'Encryption key not set. Run: SET app.enc_key = ''...'';';
  END IF;

  -- 6) decrypt & return
  SELECT pgp_sym_decrypt(esv.encrypted_value, v_key)::text
    INTO v_value
  FROM employee_sensitive_values esv
  WHERE esv.employee_id = p_employee_id
    AND esv.field_key = p_field_key;

  RETURN v_value;
END;
$$;


--
-- Name: get_travel_allowance_amount(numeric, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_travel_allowance_amount(p_distance_km numeric, p_on_date date DEFAULT CURRENT_DATE) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  SELECT b.allowance_amount
  FROM travel_allowance_brackets b
  WHERE b.effective_from <= p_on_date
    AND (b.effective_to IS NULL OR b.effective_to >= p_on_date)
    AND p_distance_km >= b.distance_from_km
    AND (b.distance_to_km IS NULL OR p_distance_km < b.distance_to_km)
  ORDER BY b.distance_from_km DESC
  LIMIT 1;
$$;


--
-- Name: FUNCTION get_travel_allowance_amount(p_distance_km numeric, p_on_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_travel_allowance_amount(p_distance_km numeric, p_on_date date) IS 'Returns fixed CCQ travel allowance amount based on distance bands and effective date.';


--
-- Name: haversine_km(double precision, double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.haversine_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) RETURNS double precision
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT 6371.0 * 2.0 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2.0), 2.0)
      + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians(lon2 - lon1) / 2.0), 2.0)
    )
  );
$$;


--
-- Name: manager_decide_attendance(integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manager_decide_attendance(p_attendance_id integer, p_manager_id integer, p_decision text, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_ts timestamptz;
BEGIN
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  -- ensure checkout/approval timestamps are never before check_in_at
  SELECT CASE WHEN now() < check_in_at THEN check_in_at ELSE now() END
  INTO v_ts
  FROM attendance_logs
  WHERE attendance_id = p_attendance_id;

  UPDATE attendance_logs
  SET
    -- auto close if still open
    check_out_at       = COALESCE(check_out_at, v_ts),
    check_out_location = COALESCE(check_out_location, check_in_location),

    -- approval fields
    approved_by   = p_manager_id,
    approved_at   = v_ts,
    approval_note = p_note,

    -- decision
    status = p_decision
  WHERE attendance_id = p_attendance_id
    AND status = 'PENDING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance % not found or not PENDING', p_attendance_id;
  END IF;
END;
$$;


--
-- Name: manual_check_in(integer, integer, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manual_check_in(p_employee_id integer, p_project_id integer, p_lon double precision, p_lat double precision) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_attendance_id integer;
BEGIN
  -- Try to create a new open attendance
  BEGIN
    INSERT INTO attendance_logs (
      employee_id,
      project_id,
      check_in_at,
      check_in_location,
      status
    )
    VALUES (
      p_employee_id,
      p_project_id,
      now(),
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326),
      'PENDING'
    )
    RETURNING attendance_id INTO v_attendance_id;

    RETURN v_attendance_id;

  EXCEPTION
    WHEN unique_violation THEN
      -- If blocked by unique open constraint, return existing open attendance
      SELECT attendance_id
      INTO v_attendance_id
      FROM attendance_logs
      WHERE employee_id = p_employee_id
        AND check_out_at IS NULL
      ORDER BY check_in_at DESC
      LIMIT 1;

      RETURN v_attendance_id;
  END;
END;
$$;


--
-- Name: manual_check_out(integer, double precision, double precision, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manual_check_out(p_attendance_id integer, p_lon double precision, p_lat double precision, p_approved_by integer, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE attendance_logs
  SET
    check_out_at = now(),
    check_out_location = ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326),
    approved_by = p_approved_by,
    approved_at = now(),
    approval_note = p_note,
    status = 'APPROVED'
  WHERE attendance_id = p_attendance_id;
END;
$$;


--
-- Name: set_company_settings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_company_settings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: sync_app_user_role_to_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_app_user_role_to_profile() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    UPDATE public.employee_profiles
       SET role_code = NEW.role,
           updated_at = NOW()
     WHERE employee_id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_employee_contact_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_employee_contact_email() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.employee_profiles
     SET contact_email = NEW.contact_email,
         updated_at = NOW()
   WHERE employee_id = NEW.id;
  RETURN NEW;
END;
$$;


--
-- Name: sync_employee_full_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_employee_full_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.employee_profiles
     SET full_name = TRIM(BOTH ' ' FROM CONCAT_WS(' ', NEW.first_name, NEW.last_name)),
         updated_at = NOW()
   WHERE employee_id = NEW.id;
  RETURN NEW;
END;
$$;


--
-- Name: sync_employee_home_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_employee_home_location() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.home_lat IS NOT NULL AND NEW.home_lng IS NOT NULL
     AND NEW.home_lat <> 0 AND NEW.home_lng <> 0
  THEN
    NEW.home_location := ST_SetSRID(ST_MakePoint(NEW.home_lng, NEW.home_lat), 4326);
  ELSIF NEW.home_lat IS NULL OR NEW.home_lng IS NULL THEN
    NEW.home_location := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_attendance_apply_geo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_attendance_apply_geo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_site_loc geography;
  v_radius_m integer;
  v_dist_m double precision;
BEGIN
  -- Only compute when we have a project and a check-in location
  IF NEW.project_id IS NULL OR NEW.check_in_location IS NULL THEN
    NEW.distance_to_site_m := NULL;
    NEW.inside_geofence := NULL;
    RETURN NEW;
  END IF;

  -- Get active work site settings for this project
  SELECT ws.site_location, ws.geofence_radius_m
    INTO v_site_loc, v_radius_m
  FROM public.work_sites ws
  WHERE ws.project_id = NEW.project_id
    AND ws.is_active = true
  ORDER BY ws.created_at DESC
  LIMIT 1;

  IF v_site_loc IS NULL OR v_radius_m IS NULL THEN
    NEW.distance_to_site_m := NULL;
    NEW.inside_geofence := NULL;
    RETURN NEW;
  END IF;

  v_dist_m := ST_Distance(NEW.check_in_location, v_site_loc);

  NEW.distance_to_site_m := v_dist_m;
  NEW.inside_geofence := (v_dist_m <= v_radius_m);

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id bigint NOT NULL,
    username text NOT NULL,
    pin_hash text NOT NULL,
    employee_id bigint,
    role text DEFAULT 'employee'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id bigint,
    email text,
    activation_sent_at timestamp with time zone,
    activated_at timestamp with time zone,
    last_invite_id bigint,
    password_hash text,
    profile_status text DEFAULT 'COMPLETED'::text,
    must_change_pin boolean DEFAULT false NOT NULL,
    is_temp_pin boolean DEFAULT false NOT NULL,
    CONSTRAINT app_users_role_check CHECK ((role = ANY (ARRAY['SUPER_ADMIN'::text, 'IT_ADMIN'::text, 'COMPANY_ADMIN'::text, 'TRADE_PROJECT_MANAGER'::text, 'TRADE_ADMIN'::text, 'FOREMAN'::text, 'JOURNEYMAN'::text, 'APPRENTICE_1'::text, 'APPRENTICE_2'::text, 'APPRENTICE_3'::text, 'APPRENTICE_4'::text, 'WORKER'::text, 'DRIVER'::text]))),
    CONSTRAINT ck_app_users_profile_status CHECK ((profile_status = ANY (ARRAY['NEW'::text, 'INCOMPLETE'::text, 'COMPLETED'::text])))
);


--
-- Name: app_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_users_id_seq OWNED BY public.app_users.id;


--
-- Name: assignment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_requests (
    id bigint NOT NULL,
    request_type text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    requested_by_user_id bigint NOT NULL,
    requested_for_employee_id bigint NOT NULL,
    project_id bigint NOT NULL,
    start_date date,
    end_date date,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    decision_by_user_id bigint,
    decision_note text,
    decision_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id bigint,
    assignment_role text,
    shift_start time without time zone,
    shift_end time without time zone,
    distance_km numeric,
    CONSTRAINT assignment_requests_request_type_check CHECK ((request_type = ANY (ARRAY['CREATE_ASSIGNMENT'::text, 'UPDATE_ASSIGNMENT'::text, 'CANCEL_ASSIGNMENT'::text]))),
    CONSTRAINT chk_ar_status CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text])))
);


--
-- Name: assignment_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.assignment_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignment_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.assignment_requests_id_seq OWNED BY public.assignment_requests.id;


--
-- Name: attendance_logs_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_logs_attendance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    project_id bigint NOT NULL,
    assignment_request_id bigint,
    employee_id bigint NOT NULL,
    attendance_date date NOT NULL,
    shift_start time without time zone,
    check_in_time time without time zone,
    check_out_time time without time zone,
    raw_minutes integer,
    paid_minutes integer,
    regular_hours numeric(4,2),
    overtime_hours numeric(4,2),
    late_minutes integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    confirmed_by bigint,
    confirmed_at timestamp with time zone,
    confirmed_regular_hours numeric(4,2),
    confirmed_overtime_hours numeric(4,2),
    foreman_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_records_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'CHECKED_IN'::text, 'CHECKED_OUT'::text, 'CONFIRMED'::text, 'ADJUSTED'::text])))
);


--
-- Name: attendance_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_records_id_seq OWNED BY public.attendance_records.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    company_id bigint,
    user_id bigint,
    username text,
    role text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint,
    entity_name text,
    old_values jsonb,
    new_values jsonb,
    details jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_agent text
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: ccq_travel_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ccq_travel_rates (
    id bigint NOT NULL,
    trade_code text NOT NULL,
    sector text DEFAULT 'IC'::text NOT NULL,
    min_km numeric(6,1) NOT NULL,
    rate_cad numeric(8,2) NOT NULL,
    tax_form text,
    effective_from date NOT NULL,
    effective_to date NOT NULL,
    notes text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ccq_travel_rates_dates_check CHECK ((effective_from <= effective_to)),
    CONSTRAINT ccq_travel_rates_sector_check CHECK ((sector = ANY (ARRAY['IC'::text, 'I'::text, 'RESIDENTIAL'::text])))
);


--
-- Name: ccq_travel_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ccq_travel_rates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ccq_travel_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ccq_travel_rates_id_seq OWNED BY public.ccq_travel_rates.id;


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id integer NOT NULL,
    client_code character varying(30) NOT NULL,
    client_name character varying(150) NOT NULL,
    client_type character varying(30) DEFAULT 'OWNER'::character varying,
    phone character varying(30),
    email character varying(150),
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    company_id bigint
);


--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    company_id bigint NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_code text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    plan text DEFAULT 'BASIC'::text NOT NULL,
    admin_email text,
    phone text,
    updated_at timestamp with time zone DEFAULT now(),
    default_shift_start time without time zone DEFAULT '06:00:00'::time without time zone,
    default_shift_end time without time zone DEFAULT '14:30:00'::time without time zone,
    procurement_email text,
    address text,
    logo_url text
);


--
-- Name: companies_company_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.companies_company_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: companies_company_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.companies_company_id_seq OWNED BY public.companies.company_id;


--
-- Name: company_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_statuses (
    code text NOT NULL,
    label text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_dispatch_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_dispatch_runs (
    id bigint NOT NULL,
    company_id bigint,
    dispatch_date date NOT NULL,
    status text DEFAULT 'STARTED'::text NOT NULL,
    triggered_by_user_id bigint,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    summary_json jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: daily_dispatch_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_dispatch_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_dispatch_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_dispatch_runs_id_seq OWNED BY public.daily_dispatch_runs.id;


--
-- Name: employee_daily_dispatch_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_daily_dispatch_state (
    id bigint NOT NULL,
    company_id bigint,
    employee_id bigint NOT NULL,
    work_date date NOT NULL,
    last_sent_version integer DEFAULT 0 NOT NULL,
    last_sent_payload_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_sent_at timestamp with time zone
);


--
-- Name: employee_daily_dispatch_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_daily_dispatch_state_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_daily_dispatch_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_daily_dispatch_state_id_seq OWNED BY public.employee_daily_dispatch_state.id;


--
-- Name: employee_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_profiles (
    employee_id integer NOT NULL,
    full_name text,
    trade_code text,
    home_address text,
    home_lat double precision,
    home_lng double precision,
    contact_email text,
    emergency_contact_name text,
    emergency_contact_phone text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    phone character varying(30),
    role_code character varying(40),
    rank_code character varying(40),
    home_unit character varying(30),
    city character varying(100),
    postal_code character varying(15),
    province character varying(60) DEFAULT 'QC'::character varying,
    country character varying(60) DEFAULT 'CA'::character varying,
    emergency_contact_relationship character varying(60),
    home_location public.geometry(Point,4326)
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    employee_code character varying(30) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    company_id bigint,
    email text,
    employee_profile_type text,
    contact_email text,
    full_name text,
    hire_date date,
    termination_date date
);


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: material_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_catalog (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    item_name text NOT NULL,
    default_unit text DEFAULT 'pcs'::text NOT NULL,
    use_count integer DEFAULT 1 NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: material_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.material_catalog_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: material_catalog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.material_catalog_id_seq OWNED BY public.material_catalog.id;


--
-- Name: material_request_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_request_items (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    item_name text NOT NULL,
    item_name_raw text,
    quantity numeric NOT NULL,
    unit text DEFAULT 'pcs'::text NOT NULL,
    note text,
    qty_from_surplus numeric DEFAULT 0,
    qty_from_supplier numeric DEFAULT 0,
    surplus_source_project_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT material_request_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: material_request_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.material_request_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: material_request_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.material_request_items_id_seq OWNED BY public.material_request_items.id;


--
-- Name: material_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_requests (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    project_id bigint NOT NULL,
    requested_by bigint NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    note text,
    merged_into_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    foreman_employee_id bigint,
    CONSTRAINT material_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'REVIEWED'::text, 'MERGED'::text, 'SENT'::text, 'CANCELLED'::text])))
);


--
-- Name: material_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.material_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: material_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.material_requests_id_seq OWNED BY public.material_requests.id;


--
-- Name: material_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_return_items (
    id bigint NOT NULL,
    return_id bigint NOT NULL,
    item_name text NOT NULL,
    item_name_raw text,
    quantity numeric NOT NULL,
    unit text DEFAULT 'pcs'::text NOT NULL,
    qty_available numeric DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT material_return_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: material_return_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.material_return_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: material_return_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.material_return_items_id_seq OWNED BY public.material_return_items.id;


--
-- Name: material_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_returns (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    project_id bigint NOT NULL,
    declared_by bigint NOT NULL,
    status text DEFAULT 'AVAILABLE'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT material_returns_status_check CHECK ((status = ANY (ARRAY['AVAILABLE'::text, 'PARTIALLY_USED'::text, 'USED'::text])))
);


--
-- Name: material_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.material_returns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: material_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.material_returns_id_seq OWNED BY public.material_returns.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    code text NOT NULL,
    description text NOT NULL,
    grp text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    code text NOT NULL,
    label text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_foremen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_foremen (
    project_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    employee_id integer NOT NULL,
    trade_code character varying(50) NOT NULL,
    company_id integer NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_statuses (
    id integer NOT NULL,
    code character varying(30) NOT NULL,
    name character varying(100) NOT NULL,
    is_final boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: project_statuses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_statuses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_statuses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_statuses_id_seq OWNED BY public.project_statuses.id;


--
-- Name: project_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_trades (
    id integer NOT NULL,
    project_id integer NOT NULL,
    trade_type_id integer NOT NULL,
    trade_admin_id integer,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    notes text,
    company_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT project_trades_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'ON_HOLD'::text, 'COMPLETED'::text, 'CANCELLED'::text])))
);


--
-- Name: project_trades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_trades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_trades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_trades_id_seq OWNED BY public.project_trades.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    project_code character varying(50) NOT NULL,
    project_name character varying(150) NOT NULL,
    trade_type_id integer NOT NULL,
    site_address text,
    start_date date,
    end_date date,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    status_id integer NOT NULL,
    client_id integer,
    site_lat double precision,
    site_lng double precision,
    geocoded_at timestamp with time zone,
    geocode_source text,
    company_id bigint NOT NULL,
    ccq_sector text DEFAULT 'IC'::text,
    CONSTRAINT projects_ccq_sector_check CHECK ((ccq_sector = ANY (ARRAY['RESIDENTIAL'::text, 'IC'::text, 'INDUSTRIAL'::text])))
);


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    ref text NOT NULL,
    project_id bigint NOT NULL,
    foreman_id bigint NOT NULL,
    supplier_id bigint,
    is_procurement boolean DEFAULT false NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    note text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token text NOT NULL,
    platform character varying(10) DEFAULT 'ios'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_tokens_id_seq OWNED BY public.push_tokens.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    user_agent text,
    ip_address character varying(45)
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role text NOT NULL,
    permission_code text NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    role_id bigint NOT NULL,
    role_key text NOT NULL,
    label text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles_role_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_role_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_role_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_role_id_seq OWNED BY public.roles.role_id;


--
-- Name: standup_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.standup_sessions (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    project_id bigint NOT NULL,
    foreman_id bigint NOT NULL,
    standup_date date NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    note text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: standup_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.standup_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: standup_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.standup_sessions_id_seq OWNED BY public.standup_sessions.id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    address text,
    trade_code text,
    note text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: task_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_messages (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    project_id bigint,
    sender_id bigint NOT NULL,
    type text DEFAULT 'TASK'::text NOT NULL,
    title text NOT NULL,
    body text,
    file_url text,
    file_name text,
    file_type text,
    priority text DEFAULT 'NORMAL'::text NOT NULL,
    due_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_status text DEFAULT 'SENT'::text NOT NULL
);


--
-- Name: task_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_messages_id_seq OWNED BY public.task_messages.id;


--
-- Name: task_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_recipients (
    id bigint NOT NULL,
    message_id bigint NOT NULL,
    recipient_id bigint NOT NULL,
    status text DEFAULT 'SENT'::text NOT NULL,
    read_at timestamp with time zone,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expected_project_id integer,
    completion_image_url text,
    completed_at timestamp with time zone,
    completion_note text
);


--
-- Name: task_recipients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.task_recipients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: task_recipients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.task_recipients_id_seq OWNED BY public.task_recipients.id;


--
-- Name: trade_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_types (
    id integer NOT NULL,
    code character varying(30) NOT NULL,
    name character varying(100) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: trade_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trade_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trade_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trade_types_id_seq OWNED BY public.trade_types.id;


--
-- Name: user_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invites (
    id bigint NOT NULL,
    company_id bigint NOT NULL,
    employee_id bigint,
    email text NOT NULL,
    role text NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_by_user_id bigint,
    note text,
    expires_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_user_invites_status CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'USED'::text, 'REVOKED'::text, 'EXPIRED'::text])))
);


--
-- Name: TABLE user_invites; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_invites IS 'Activation invitations issued by admin_users / invite_employee / user_management /resend / user_invites flows. Token verified by onboarding /verify and burned by onboarding /complete. Phase 59 (May 2026) ??? see DECISIONS.md Bug 6 for the discovery story.';


--
-- Name: user_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_invites_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_invites_id_seq OWNED BY public.user_invites.id;


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    permission_code text NOT NULL,
    granted boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_permissions_id_seq OWNED BY public.user_permissions.id;


--
-- Name: v_projects; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_projects AS
 SELECT p.id,
    p.project_code,
    p.project_name,
    tt.code AS trade_code,
    tt.name AS trade_name,
    c.client_code,
    c.client_name,
    c.client_type,
    ps.code AS status_code,
    ps.name AS status_name,
    p.site_address,
    p.start_date,
    p.end_date,
    p.created_at
   FROM (((public.projects p
     JOIN public.trade_types tt ON ((tt.id = p.trade_type_id)))
     JOIN public.clients c ON ((c.id = p.client_id)))
     JOIN public.project_statuses ps ON ((ps.id = p.status_id)));


--
-- Name: work_sites_site_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.work_sites_site_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users ALTER COLUMN id SET DEFAULT nextval('public.app_users_id_seq'::regclass);


--
-- Name: assignment_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_requests ALTER COLUMN id SET DEFAULT nextval('public.assignment_requests_id_seq'::regclass);


--
-- Name: attendance_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records ALTER COLUMN id SET DEFAULT nextval('public.attendance_records_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: ccq_travel_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ccq_travel_rates ALTER COLUMN id SET DEFAULT nextval('public.ccq_travel_rates_id_seq'::regclass);


--
-- Name: clients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT nextval('public.clients_id_seq'::regclass);


--
-- Name: companies company_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies ALTER COLUMN company_id SET DEFAULT nextval('public.companies_company_id_seq'::regclass);


--
-- Name: daily_dispatch_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_dispatch_runs ALTER COLUMN id SET DEFAULT nextval('public.daily_dispatch_runs_id_seq'::regclass);


--
-- Name: employee_daily_dispatch_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_daily_dispatch_state ALTER COLUMN id SET DEFAULT nextval('public.employee_daily_dispatch_state_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: material_catalog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_catalog ALTER COLUMN id SET DEFAULT nextval('public.material_catalog_id_seq'::regclass);


--
-- Name: material_request_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_request_items ALTER COLUMN id SET DEFAULT nextval('public.material_request_items_id_seq'::regclass);


--
-- Name: material_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requests ALTER COLUMN id SET DEFAULT nextval('public.material_requests_id_seq'::regclass);


--
-- Name: material_return_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_return_items ALTER COLUMN id SET DEFAULT nextval('public.material_return_items_id_seq'::regclass);


--
-- Name: material_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_returns ALTER COLUMN id SET DEFAULT nextval('public.material_returns_id_seq'::regclass);


--
-- Name: project_statuses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_statuses ALTER COLUMN id SET DEFAULT nextval('public.project_statuses_id_seq'::regclass);


--
-- Name: project_trades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_trades ALTER COLUMN id SET DEFAULT nextval('public.project_trades_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);


--
-- Name: push_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens ALTER COLUMN id SET DEFAULT nextval('public.push_tokens_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: roles role_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN role_id SET DEFAULT nextval('public.roles_role_id_seq'::regclass);


--
-- Name: standup_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standup_sessions ALTER COLUMN id SET DEFAULT nextval('public.standup_sessions_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: task_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_messages ALTER COLUMN id SET DEFAULT nextval('public.task_messages_id_seq'::regclass);


--
-- Name: task_recipients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_recipients ALTER COLUMN id SET DEFAULT nextval('public.task_recipients_id_seq'::regclass);


--
-- Name: trade_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_types ALTER COLUMN id SET DEFAULT nextval('public.trade_types_id_seq'::regclass);


--
-- Name: user_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites ALTER COLUMN id SET DEFAULT nextval('public.user_invites_id_seq'::regclass);


--
-- Name: user_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions ALTER COLUMN id SET DEFAULT nextval('public.user_permissions_id_seq'::regclass);


--
-- Data for Name: app_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.app_users (id, username, pin_hash, employee_id, role, is_active, created_at, company_id, email, activation_sent_at, activated_at, last_invite_id, password_hash, profile_status, must_change_pin, is_temp_pin) FROM stdin;
\.


--
-- Data for Name: assignment_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assignment_requests (id, request_type, status, requested_by_user_id, requested_for_employee_id, project_id, start_date, end_date, payload_json, decision_by_user_id, decision_note, decision_at, created_at, updated_at, company_id, assignment_role, shift_start, shift_end, distance_km) FROM stdin;
\.


--
-- Data for Name: attendance_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance_records (id, company_id, project_id, assignment_request_id, employee_id, attendance_date, shift_start, check_in_time, check_out_time, raw_minutes, paid_minutes, regular_hours, overtime_hours, late_minutes, status, confirmed_by, confirmed_at, confirmed_regular_hours, confirmed_overtime_hours, foreman_note, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, company_id, user_id, username, role, action, entity_type, entity_id, entity_name, old_values, new_values, details, ip_address, created_at, user_agent) FROM stdin;
\.


--
-- Data for Name: ccq_travel_rates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ccq_travel_rates (id, trade_code, sector, min_km, rate_cad, tax_form, effective_from, effective_to, notes, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clients (id, client_code, client_name, client_type, phone, email, address, is_active, created_at, company_id) FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.companies (company_id, name, created_at, company_code, status, plan, admin_email, phone, updated_at, default_shift_start, default_shift_end, procurement_email, address, logo_url) FROM stdin;
\.


--
-- Data for Name: company_statuses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.company_statuses (code, label, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: daily_dispatch_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.daily_dispatch_runs (id, company_id, dispatch_date, status, triggered_by_user_id, started_at, finished_at, summary_json) FROM stdin;
\.


--
-- Data for Name: employee_daily_dispatch_state; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_daily_dispatch_state (id, company_id, employee_id, work_date, last_sent_version, last_sent_payload_json, last_sent_at) FROM stdin;
\.


--
-- Data for Name: employee_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_profiles (employee_id, full_name, trade_code, home_address, home_lat, home_lng, contact_email, emergency_contact_name, emergency_contact_phone, notes, created_at, updated_at, phone, role_code, rank_code, home_unit, city, postal_code, province, country, emergency_contact_relationship, home_location) FROM stdin;
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employees (id, employee_code, first_name, last_name, is_active, created_at, company_id, email, employee_profile_type, contact_email, full_name, hire_date, termination_date) FROM stdin;
\.


--
-- Data for Name: material_catalog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.material_catalog (id, company_id, item_name, default_unit, use_count, last_used_at, created_at) FROM stdin;
\.


--
-- Data for Name: material_request_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.material_request_items (id, request_id, item_name, item_name_raw, quantity, unit, note, qty_from_surplus, qty_from_supplier, surplus_source_project_id, created_at) FROM stdin;
\.


--
-- Data for Name: material_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.material_requests (id, company_id, project_id, requested_by, status, note, merged_into_id, created_at, updated_at, foreman_employee_id) FROM stdin;
\.


--
-- Data for Name: material_return_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.material_return_items (id, return_id, item_name, item_name_raw, quantity, unit, qty_available, note, created_at) FROM stdin;
\.


--
-- Data for Name: material_returns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.material_returns (id, company_id, project_id, declared_by, status, note, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.permissions (code, description, grp, created_at) FROM stdin;
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.plans (code, label, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: project_foremen; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.project_foremen (project_id, is_active, created_at, employee_id, trade_code, company_id, updated_at) FROM stdin;
\.


--
-- Data for Name: project_statuses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.project_statuses (id, code, name, is_final, created_at) FROM stdin;
\.


--
-- Data for Name: project_trades; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.project_trades (id, project_id, trade_type_id, trade_admin_id, status, notes, company_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projects (id, project_code, project_name, trade_type_id, site_address, start_date, end_date, created_at, status_id, client_id, site_lat, site_lng, geocoded_at, geocode_source, company_id, ccq_sector) FROM stdin;
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_orders (id, company_id, ref, project_id, foreman_id, supplier_id, is_procurement, items, note, sent_at, created_at) FROM stdin;
\.


--
-- Data for Name: push_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.push_tokens (id, user_id, token, platform, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at, user_agent, ip_address) FROM stdin;
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.role_permissions (role, permission_code) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (role_id, role_key, label, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- Data for Name: standup_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.standup_sessions (id, company_id, project_id, foreman_id, standup_date, status, note, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.suppliers (id, company_id, name, email, phone, address, trade_code, note, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: task_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_messages (id, company_id, project_id, sender_id, type, title, body, file_url, file_name, file_type, priority, due_date, created_at, updated_at, delivery_status) FROM stdin;
\.


--
-- Data for Name: task_recipients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_recipients (id, message_id, recipient_id, status, read_at, acknowledged_at, created_at, expected_project_id, completion_image_url, completed_at, completion_note) FROM stdin;
\.


--
-- Data for Name: trade_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.trade_types (id, code, name, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: user_invites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_invites (id, company_id, employee_id, email, role, token_hash, status, created_by_user_id, note, expires_at, sent_at, used_at, revoked_at, created_at) FROM stdin;
\.


--
-- Data for Name: user_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_permissions (id, user_id, permission_code, granted, note, created_at) FROM stdin;
\.


--
-- Name: app_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.app_users_id_seq', 1, false);


--
-- Name: assignment_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.assignment_requests_id_seq', 1, false);


--
-- Name: attendance_logs_attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.attendance_logs_attendance_id_seq', 1, false);


--
-- Name: attendance_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.attendance_records_id_seq', 1, false);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 1, false);


--
-- Name: ccq_travel_rates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ccq_travel_rates_id_seq', 1, false);


--
-- Name: clients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.clients_id_seq', 1, false);


--
-- Name: companies_company_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.companies_company_id_seq', 1, false);


--
-- Name: daily_dispatch_runs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.daily_dispatch_runs_id_seq', 1, false);


--
-- Name: employee_daily_dispatch_state_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employee_daily_dispatch_state_id_seq', 1, false);


--
-- Name: employee_locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employee_locations_id_seq', 1, false);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_id_seq', 1, false);


--
-- Name: material_catalog_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.material_catalog_id_seq', 1, false);


--
-- Name: material_request_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.material_request_items_id_seq', 1, false);


--
-- Name: material_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.material_requests_id_seq', 1, false);


--
-- Name: material_return_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.material_return_items_id_seq', 1, false);


--
-- Name: material_returns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.material_returns_id_seq', 1, false);


--
-- Name: project_locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.project_locations_id_seq', 1, false);


--
-- Name: project_statuses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.project_statuses_id_seq', 1, false);


--
-- Name: project_trades_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.project_trades_id_seq', 1, false);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.projects_id_seq', 1, false);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_orders_id_seq', 1, false);


--
-- Name: push_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.push_tokens_id_seq', 1, false);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.refresh_tokens_id_seq', 1, false);


--
-- Name: roles_role_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_role_id_seq', 1, false);


--
-- Name: standup_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.standup_sessions_id_seq', 1, false);


--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.suppliers_id_seq', 1, false);


--
-- Name: task_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.task_messages_id_seq', 1, false);


--
-- Name: task_recipients_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.task_recipients_id_seq', 1, false);


--
-- Name: trade_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.trade_types_id_seq', 1, false);


--
-- Name: user_invites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_invites_id_seq', 1, false);


--
-- Name: user_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_permissions_id_seq', 1, false);


--
-- Name: work_sites_site_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.work_sites_site_id_seq', 1, false);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: app_users app_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_username_key UNIQUE (username);


--
-- Name: assignment_requests assignment_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_requests
    ADD CONSTRAINT assignment_requests_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_company_id_employee_id_project_id_attend_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_company_id_employee_id_project_id_attend_key UNIQUE (company_id, employee_id, project_id, attendance_date);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: ccq_travel_rates ccq_travel_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ccq_travel_rates
    ADD CONSTRAINT ccq_travel_rates_pkey PRIMARY KEY (id);


--
-- Name: clients clients_client_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_client_code_key UNIQUE (client_code);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (company_id);


--
-- Name: company_statuses company_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_statuses
    ADD CONSTRAINT company_statuses_pkey PRIMARY KEY (code);


--
-- Name: daily_dispatch_runs daily_dispatch_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_dispatch_runs
    ADD CONSTRAINT daily_dispatch_runs_pkey PRIMARY KEY (id);


--
-- Name: employee_daily_dispatch_state employee_daily_dispatch_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_daily_dispatch_state
    ADD CONSTRAINT employee_daily_dispatch_state_pkey PRIMARY KEY (id);


--
-- Name: employee_profiles employee_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_pkey PRIMARY KEY (employee_id);


--
-- Name: employees employees_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_code_key UNIQUE (employee_code);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: material_catalog material_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_catalog
    ADD CONSTRAINT material_catalog_pkey PRIMARY KEY (id);


--
-- Name: material_request_items material_request_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_request_items
    ADD CONSTRAINT material_request_items_pkey PRIMARY KEY (id);


--
-- Name: material_requests material_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requests
    ADD CONSTRAINT material_requests_pkey PRIMARY KEY (id);


--
-- Name: material_return_items material_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_return_items
    ADD CONSTRAINT material_return_items_pkey PRIMARY KEY (id);


--
-- Name: material_returns material_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_returns
    ADD CONSTRAINT material_returns_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (code);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (code);


--
-- Name: project_foremen project_foremen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_foremen
    ADD CONSTRAINT project_foremen_pkey PRIMARY KEY (project_id, trade_code);


--
-- Name: project_statuses project_statuses_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_statuses
    ADD CONSTRAINT project_statuses_code_key UNIQUE (code);


--
-- Name: project_statuses project_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_statuses
    ADD CONSTRAINT project_statuses_pkey PRIMARY KEY (id);


--
-- Name: project_trades project_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_trades
    ADD CONSTRAINT project_trades_pkey PRIMARY KEY (id);


--
-- Name: project_trades project_trades_project_id_trade_type_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_trades
    ADD CONSTRAINT project_trades_project_id_trade_type_id_key UNIQUE (project_id, trade_type_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_key UNIQUE (user_id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role, permission_code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role_id);


--
-- Name: roles roles_role_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_key_key UNIQUE (role_key);


--
-- Name: standup_sessions standup_sessions_company_id_project_id_foreman_id_standup_d_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standup_sessions
    ADD CONSTRAINT standup_sessions_company_id_project_id_foreman_id_standup_d_key UNIQUE (company_id, project_id, foreman_id, standup_date);


--
-- Name: standup_sessions standup_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standup_sessions
    ADD CONSTRAINT standup_sessions_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: task_messages task_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_pkey PRIMARY KEY (id);


--
-- Name: task_recipients task_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_recipients
    ADD CONSTRAINT task_recipients_pkey PRIMARY KEY (id);


--
-- Name: trade_types trade_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_types
    ADD CONSTRAINT trade_types_code_key UNIQUE (code);


--
-- Name: trade_types trade_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_types
    ADD CONSTRAINT trade_types_pkey PRIMARY KEY (id);


--
-- Name: companies uq_companies_company_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT uq_companies_company_code UNIQUE (company_code);


--
-- Name: daily_dispatch_runs uq_daily_dispatch_runs_company_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_dispatch_runs
    ADD CONSTRAINT uq_daily_dispatch_runs_company_date UNIQUE (company_id, dispatch_date);


--
-- Name: employee_daily_dispatch_state uq_employee_daily_dispatch_state_emp_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_daily_dispatch_state
    ADD CONSTRAINT uq_employee_daily_dispatch_state_emp_date UNIQUE (employee_id, work_date);


--
-- Name: projects uq_projects_code_per_company; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT uq_projects_code_per_company UNIQUE (company_id, project_code);


--
-- Name: user_invites user_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_pkey PRIMARY KEY (id);


--
-- Name: user_invites user_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invites
    ADD CONSTRAINT user_invites_token_hash_key UNIQUE (token_hash);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_user_id_permission_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_permission_code_key UNIQUE (user_id, permission_code);


--
-- Name: app_users_company_email_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_users_company_email_uniq ON public.app_users USING btree (company_id, lower(email)) WHERE (email IS NOT NULL);


--
-- Name: employees_company_email_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_company_email_uniq ON public.employees USING btree (company_id, lower(email)) WHERE (email IS NOT NULL);


--
-- Name: idx_app_users_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_users_company_id ON public.app_users USING btree (company_id) WHERE (company_id IS NOT NULL);


--
-- Name: idx_app_users_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_users_employee_id ON public.app_users USING btree (employee_id) WHERE (employee_id IS NOT NULL);


--
-- Name: idx_ar_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ar_employee ON public.assignment_requests USING btree (requested_for_employee_id);


--
-- Name: idx_ar_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ar_project ON public.assignment_requests USING btree (project_id);


--
-- Name: idx_ar_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ar_status ON public.assignment_requests USING btree (status);


--
-- Name: idx_assignment_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_requests_created_at ON public.assignment_requests USING btree (created_at);


--
-- Name: idx_assignment_requests_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_requests_employee ON public.assignment_requests USING btree (requested_for_employee_id);


--
-- Name: idx_assignment_requests_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_requests_project ON public.assignment_requests USING btree (project_id);


--
-- Name: idx_assignment_requests_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_requests_requested_by ON public.assignment_requests USING btree (requested_by_user_id);


--
-- Name: idx_assignment_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_requests_status ON public.assignment_requests USING btree (status);


--
-- Name: idx_attendance_asgn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_asgn ON public.attendance_records USING btree (assignment_request_id);


--
-- Name: idx_attendance_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_company ON public.attendance_records USING btree (company_id);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date ON public.attendance_records USING btree (attendance_date);


--
-- Name: idx_attendance_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_employee ON public.attendance_records USING btree (employee_id);


--
-- Name: idx_attendance_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_project ON public.attendance_records USING btree (project_id);


--
-- Name: idx_attendance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_status ON public.attendance_records USING btree (status);


--
-- Name: idx_audit_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_company ON public.audit_logs USING btree (company_id);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_company ON public.audit_logs USING btree (company_id);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_catalog_company_use; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_company_use ON public.material_catalog USING btree (company_id, use_count DESC);


--
-- Name: idx_ccq_travel_rates_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ccq_travel_rates_lookup ON public.ccq_travel_rates USING btree (trade_code, sector, min_km, effective_from, effective_to);


--
-- Name: idx_clients_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_company_id ON public.clients USING btree (company_id);


--
-- Name: idx_companies_company_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_company_code ON public.companies USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_daily_dispatch_runs_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_dispatch_runs_company_date ON public.daily_dispatch_runs USING btree (company_id, dispatch_date);


--
-- Name: idx_daily_dispatch_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_dispatch_runs_status ON public.daily_dispatch_runs USING btree (status);


--
-- Name: idx_employee_daily_dispatch_state_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_daily_dispatch_state_company_date ON public.employee_daily_dispatch_state USING btree (company_id, work_date);


--
-- Name: idx_employee_daily_dispatch_state_employee_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_daily_dispatch_state_employee_date ON public.employee_daily_dispatch_state USING btree (employee_id, work_date);


--
-- Name: idx_employee_profiles_home_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_profiles_home_location ON public.employee_profiles USING gist (home_location);


--
-- Name: idx_employees_company_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_company_active ON public.employees USING btree (company_id, is_active);


--
-- Name: idx_employees_company_employee_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_company_employee_code ON public.employees USING btree (company_id, employee_code) WHERE ((employee_code IS NOT NULL) AND (company_id IS NOT NULL));


--
-- Name: idx_employees_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_company_id ON public.employees USING btree (company_id);


--
-- Name: idx_employees_company_upper_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_company_upper_code ON public.employees USING btree (company_id, upper((employee_code)::text));


--
-- Name: idx_employees_contact_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_contact_email ON public.employees USING btree (contact_email);


--
-- Name: idx_employees_employee_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_employee_code ON public.employees USING btree (employee_code) WHERE (employee_code IS NOT NULL);


--
-- Name: idx_employees_hire_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_hire_date ON public.employees USING btree (hire_date);


--
-- Name: idx_mat_req_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_req_company ON public.material_requests USING btree (company_id);


--
-- Name: idx_mat_req_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_req_created_at ON public.material_requests USING btree (created_at);


--
-- Name: idx_mat_req_items_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_req_items_request ON public.material_request_items USING btree (request_id);


--
-- Name: idx_mat_req_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_req_project ON public.material_requests USING btree (project_id);


--
-- Name: idx_mat_req_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_req_status ON public.material_requests USING btree (status);


--
-- Name: idx_mat_ret_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_ret_company ON public.material_returns USING btree (company_id);


--
-- Name: idx_mat_ret_items_item_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_ret_items_item_name ON public.material_return_items USING btree (item_name);


--
-- Name: idx_mat_ret_items_return; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_ret_items_return ON public.material_return_items USING btree (return_id);


--
-- Name: idx_mat_ret_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_ret_project ON public.material_returns USING btree (project_id);


--
-- Name: idx_mat_ret_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mat_ret_status ON public.material_returns USING btree (status);


--
-- Name: idx_po_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_company ON public.purchase_orders USING btree (company_id);


--
-- Name: idx_po_foreman; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_foreman ON public.purchase_orders USING btree (foreman_id);


--
-- Name: idx_po_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_project ON public.purchase_orders USING btree (project_id);


--
-- Name: idx_po_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_sent_at ON public.purchase_orders USING btree (sent_at DESC);


--
-- Name: idx_project_foremen_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_foremen_company ON public.project_foremen USING btree (company_id);


--
-- Name: idx_project_foremen_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_foremen_employee ON public.project_foremen USING btree (employee_id);


--
-- Name: idx_project_foremen_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_foremen_project ON public.project_foremen USING btree (project_id);


--
-- Name: idx_project_trades_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_trades_admin ON public.project_trades USING btree (trade_admin_id);


--
-- Name: idx_project_trades_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_trades_company ON public.project_trades USING btree (company_id);


--
-- Name: idx_project_trades_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_trades_project ON public.project_trades USING btree (project_id);


--
-- Name: idx_projects_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_company_id ON public.projects USING btree (company_id);


--
-- Name: idx_projects_site_lat_lng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_site_lat_lng ON public.projects USING btree (site_lat, site_lng) WHERE ((site_lat IS NOT NULL) AND (site_lng IS NOT NULL));


--
-- Name: idx_push_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_tokens_user_id ON public.push_tokens USING btree (user_id);


--
-- Name: idx_refresh_tokens_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_expires ON public.refresh_tokens USING btree (expires_at);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_role_perms_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_perms_role ON public.role_permissions USING btree (role);


--
-- Name: idx_standup_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standup_company ON public.standup_sessions USING btree (company_id);


--
-- Name: idx_standup_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standup_date ON public.standup_sessions USING btree (standup_date);


--
-- Name: idx_standup_foreman; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standup_foreman ON public.standup_sessions USING btree (foreman_id);


--
-- Name: idx_standup_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standup_project ON public.standup_sessions USING btree (project_id);


--
-- Name: idx_suppliers_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_company ON public.suppliers USING btree (company_id);


--
-- Name: idx_suppliers_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_is_active ON public.suppliers USING btree (is_active);


--
-- Name: idx_suppliers_trade_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_trade_code ON public.suppliers USING btree (trade_code);


--
-- Name: idx_task_messages_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_messages_company ON public.task_messages USING btree (company_id);


--
-- Name: idx_task_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_messages_created ON public.task_messages USING btree (created_at DESC);


--
-- Name: idx_task_messages_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_messages_project ON public.task_messages USING btree (project_id);


--
-- Name: idx_task_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_messages_sender ON public.task_messages USING btree (sender_id);


--
-- Name: idx_task_recipients_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_recipients_message ON public.task_recipients USING btree (message_id);


--
-- Name: idx_task_recipients_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_recipients_recipient ON public.task_recipients USING btree (recipient_id);


--
-- Name: idx_task_recipients_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_task_recipients_unique ON public.task_recipients USING btree (message_id, recipient_id);


--
-- Name: idx_user_invites_company_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invites_company_email ON public.user_invites USING btree (company_id, lower(email));


--
-- Name: idx_user_invites_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_invites_status ON public.user_invites USING btree (status);


--
-- Name: idx_user_perms_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_perms_user ON public.user_permissions USING btree (user_id);


--
-- Name: uq_app_users_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_app_users_employee_id ON public.app_users USING btree (employee_id) WHERE (employee_id IS NOT NULL);


--
-- Name: uq_catalog_company_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_catalog_company_item ON public.material_catalog USING btree (company_id, lower(TRIM(BOTH FROM item_name)));


--
-- Name: uq_employee_daily_dispatch_state_company_emp_date; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_employee_daily_dispatch_state_company_emp_date ON public.employee_daily_dispatch_state USING btree (company_id, employee_id, work_date);


--
-- Name: uq_employees_company_employee_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_employees_company_employee_code ON public.employees USING btree (company_id, employee_code) WHERE ((employee_code IS NOT NULL) AND (company_id IS NOT NULL));


--
-- Name: uq_suppliers_name_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_suppliers_name_company ON public.suppliers USING btree (company_id, lower(TRIM(BOTH FROM name)));


--
-- Name: ux_employees_company_name_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_employees_company_name_ci ON public.employees USING btree (company_id, lower(TRIM(BOTH FROM first_name)), lower(TRIM(BOTH FROM last_name)));


--
-- Name: ux_employees_email_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_employees_email_norm ON public.employees USING btree (lower(email)) WHERE ((email IS NOT NULL) AND (btrim(email) <> ''::text));


--
-- Name: assignment_requests trg_assignment_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assignment_requests_updated_at BEFORE UPDATE ON public.assignment_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: audit_logs trg_audit_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();


--
-- Name: audit_logs trg_audit_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();


--
-- Name: material_requests trg_mat_req_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mat_req_updated_at BEFORE UPDATE ON public.material_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: material_returns trg_mat_ret_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mat_ret_updated_at BEFORE UPDATE ON public.material_returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: project_trades trg_project_trades_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_project_trades_updated_at BEFORE UPDATE ON public.project_trades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: suppliers trg_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: app_users trg_sync_app_user_role_to_profile; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_app_user_role_to_profile AFTER INSERT OR UPDATE OF role, employee_id ON public.app_users FOR EACH ROW EXECUTE FUNCTION public.sync_app_user_role_to_profile();


--
-- Name: employees trg_sync_contact_email; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_contact_email AFTER INSERT OR UPDATE OF contact_email ON public.employees FOR EACH ROW EXECUTE FUNCTION public.sync_employee_contact_email();


--
-- Name: employees trg_sync_employee_contact_email; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_employee_contact_email AFTER INSERT OR UPDATE OF contact_email ON public.employees FOR EACH ROW EXECUTE FUNCTION public.sync_employee_contact_email();


--
-- Name: employees trg_sync_employee_full_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_employee_full_name AFTER INSERT OR UPDATE OF first_name, last_name ON public.employees FOR EACH ROW EXECUTE FUNCTION public.sync_employee_full_name();


--
-- Name: employee_profiles trg_sync_home_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_home_location BEFORE INSERT OR UPDATE OF home_lat, home_lng ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_employee_home_location();


--
-- Name: attendance_records attendance_records_assignment_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_assignment_request_id_fkey FOREIGN KEY (assignment_request_id) REFERENCES public.assignment_requests(id) ON DELETE SET NULL;


--
-- Name: attendance_records attendance_records_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: ccq_travel_rates ccq_travel_rates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ccq_travel_rates
    ADD CONSTRAINT ccq_travel_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: clients clients_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: employee_profiles employee_profiles_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employees employees_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: app_users fk_app_users_role; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT fk_app_users_role FOREIGN KEY (role) REFERENCES public.roles(role_key);


--
-- Name: companies fk_companies_plan; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT fk_companies_plan FOREIGN KEY (plan) REFERENCES public.plans(code);


--
-- Name: companies fk_companies_status; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT fk_companies_status FOREIGN KEY (status) REFERENCES public.company_statuses(code);


--
-- Name: daily_dispatch_runs fk_daily_dispatch_runs_triggered_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_dispatch_runs
    ADD CONSTRAINT fk_daily_dispatch_runs_triggered_by_user FOREIGN KEY (triggered_by_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL NOT VALID;


--
-- Name: employee_daily_dispatch_state fk_employee_daily_dispatch_state_employee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_daily_dispatch_state
    ADD CONSTRAINT fk_employee_daily_dispatch_state_employee FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE NOT VALID;


--
-- Name: projects fk_projects_client; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_projects_client FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: projects fk_projects_status; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_projects_status FOREIGN KEY (status_id) REFERENCES public.project_statuses(id);


--
-- Name: material_request_items material_request_items_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_request_items
    ADD CONSTRAINT material_request_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.material_requests(id) ON DELETE CASCADE;


--
-- Name: material_requests material_requests_merged_into_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_requests
    ADD CONSTRAINT material_requests_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES public.material_requests(id);


--
-- Name: material_return_items material_return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_return_items
    ADD CONSTRAINT material_return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.material_returns(id) ON DELETE CASCADE;


--
-- Name: project_foremen project_foremen_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_foremen
    ADD CONSTRAINT project_foremen_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id) ON DELETE CASCADE;


--
-- Name: project_foremen project_foremen_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_foremen
    ADD CONSTRAINT project_foremen_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: project_foremen project_foremen_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_foremen
    ADD CONSTRAINT project_foremen_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_trades project_trades_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_trades
    ADD CONSTRAINT project_trades_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: project_trades project_trades_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_trades
    ADD CONSTRAINT project_trades_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_trades project_trades_trade_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_trades
    ADD CONSTRAINT project_trades_trade_admin_id_fkey FOREIGN KEY (trade_admin_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: project_trades project_trades_trade_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_trades
    ADD CONSTRAINT project_trades_trade_type_id_fkey FOREIGN KEY (trade_type_id) REFERENCES public.trade_types(id);


--
-- Name: projects projects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: projects projects_trade_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_trade_type_id_fkey FOREIGN KEY (trade_type_id) REFERENCES public.trade_types(id);


--
-- Name: push_tokens push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_code_fkey FOREIGN KEY (permission_code) REFERENCES public.permissions(code) ON DELETE CASCADE;


--
-- Name: standup_sessions standup_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standup_sessions
    ADD CONSTRAINT standup_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: task_messages task_messages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_messages
    ADD CONSTRAINT task_messages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: task_recipients task_recipients_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_recipients
    ADD CONSTRAINT task_recipients_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.task_messages(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_permission_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_permission_code_fkey FOREIGN KEY (permission_code) REFERENCES public.permissions(code) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

