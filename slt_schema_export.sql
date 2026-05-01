--
-- PostgreSQL database dump
--

\restrict X5IrVzdd0VySUkGAqb1yEHTV22up9hQZmRSG5Rj3Kfnb6dJQ82C9gg5Fzp6ZbUF

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.notification_type AS ENUM (
    'task_assigned',
    'task_confirmed',
    'task_sent_back',
    'task_completed',
    'nudge',
    'renewal_reminder',
    'maturity_reminder',
    'overdue_alert'
);


ALTER TYPE public.notification_type OWNER TO postgres;

--
-- Name: proof_requirement; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.proof_requirement AS ENUM (
    'Yes — Mandatory',
    'Yes — Optional',
    'No'
);


ALTER TYPE public.proof_requirement OWNER TO postgres;

--
-- Name: ps_template_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ps_template_type AS ENUM (
    'mf_purchase',
    'mf_redemption',
    'pms',
    'aif',
    'insurance',
    'fd',
    'bank',
    'tax',
    'egold',
    'ca_work',
    'broking',
    'none'
);


ALTER TYPE public.ps_template_type OWNER TO postgres;

--
-- Name: sip_frequency; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.sip_frequency AS ENUM (
    'monthly',
    'weekly'
);


ALTER TYPE public.sip_frequency OWNER TO postgres;

--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.task_priority AS ENUM (
    'Normal',
    'High',
    'Urgent'
);


ALTER TYPE public.task_priority OWNER TO postgres;

--
-- Name: task_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.task_status AS ENUM (
    'pending',
    'inprogress',
    'postsales',
    'done'
);


ALTER TYPE public.task_status OWNER TO postgres;

--
-- Name: tx_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.tx_type AS ENUM (
    'Financial Transaction',
    'Non-Financial',
    'CA Work',
    'Broking Work'
);


ALTER TYPE public.tx_type OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'Admin / Partner',
    'Operations Manager',
    'Relationship Manager',
    'Back Office Operator',
    'KYC Executive',
    'CA / Tax Specialist',
    'System Admin'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- Name: create_renewal_tracker(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_renewal_tracker() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_task tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = NEW.task_id;

  -- Insurance: create renewal tracker using next_premium_due
  IF NEW.next_premium_due IS NOT NULL THEN
    INSERT INTO renewal_tracker
      (task_id, tracker_type, client_name, client_mobile, client_email,
       product_name, policy_or_fd_no, renewal_due_date, coverage_to)
    VALUES
      (NEW.task_id, 'insurance_renewal',
       v_task.client_name, v_task.client_mobile, v_task.client_email,
       (SELECT c.name FROM categories c WHERE c.id = v_task.category_id),
       NEW.policy_number, NEW.next_premium_due, NEW.coverage_to)
    ON CONFLICT DO NOTHING;
  END IF;

  -- FD: create maturity tracker using fd_maturity_date
  IF NEW.fd_maturity_date IS NOT NULL THEN
    INSERT INTO renewal_tracker
      (task_id, tracker_type, client_name, client_mobile, client_email,
       product_name, policy_or_fd_no, renewal_due_date)
    VALUES
      (NEW.task_id, 'fd_maturity',
       v_task.client_name, v_task.client_mobile, v_task.client_email,
       'Corporate FD', NEW.fd_account_no, NEW.fd_maturity_date)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.create_renewal_tracker() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    id integer NOT NULL,
    vertical_id integer NOT NULL,
    category_id integer NOT NULL,
    nature_id integer NOT NULL,
    tx_type public.tx_type NOT NULL,
    sip_frequency public.sip_frequency,
    sip_date integer,
    sip_day character varying(10),
    ps_template public.ps_template_type DEFAULT 'none'::public.ps_template_type,
    client_name character varying(200) NOT NULL,
    client_father character varying(200),
    client_mobile character varying(15) NOT NULL,
    client_email character varying(200),
    title character varying(500) NOT NULL,
    description text,
    priority public.task_priority DEFAULT 'Normal'::public.task_priority,
    proof_required public.proof_requirement DEFAULT 'Yes — Mandatory'::public.proof_requirement,
    due_date date NOT NULL,
    status public.task_status DEFAULT 'pending'::public.task_status,
    stage integer DEFAULT 1,
    proof_uploaded boolean DEFAULT false,
    s4_doc_uploaded boolean DEFAULT false,
    s3_confirmed_by integer,
    s3_confirmed_at timestamp without time zone,
    s3_note text,
    assigned_to integer NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone,
    client_id integer,
    CONSTRAINT tasks_stage_check CHECK (((stage >= 1) AND (stage <= 5)))
);


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: COLUMN tasks.client_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.client_id IS 'FK to clients table. NULL for tasks created before client master migration.';


--
-- Name: update_task_stage(integer, character varying, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_task_stage(p_task_id integer, p_action character varying, p_actor_id integer, p_note text DEFAULT NULL::text) RETURNS public.tasks
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_task        tasks%ROWTYPE;
  v_from_status task_status;
  v_from_stage  INTEGER;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  v_from_status := v_task.status;
  v_from_stage  := v_task.stage;

  CASE p_action

    -- Manager clicks "Mark as In Progress"
    WHEN 'start' THEN
      UPDATE tasks SET status='inprogress', stage=2, updated_at=NOW()
      WHERE id = p_task_id;

    -- Manager clicks "Confirm" on Stage 2
    WHEN 'confirm' THEN
      -- Record Stage 3 confirmation
      UPDATE tasks SET
        s3_confirmed_by = p_actor_id,
        s3_confirmed_at = NOW(),
        s3_note         = p_note,
        updated_at      = NOW()
      WHERE id = p_task_id;

      -- If Financial Transaction → go to postsales (Stage 4)
      -- Else → go to done (Stage 5)
      IF v_task.tx_type = 'Financial Transaction' AND v_task.ps_template != 'none' THEN
        UPDATE tasks SET status='postsales', stage=4, updated_at=NOW() WHERE id=p_task_id;
      ELSE
        UPDATE tasks SET status='done', stage=5, completed_at=NOW(), updated_at=NOW() WHERE id=p_task_id;
      END IF;

    -- Manager clicks "Verify Fulfillment"
    WHEN 'verify' THEN
      UPDATE tasks SET status='done', stage=5, completed_at=NOW(), updated_at=NOW()
      WHERE id = p_task_id;

    -- Manager clicks "Send Back"
    WHEN 'send_back' THEN
      UPDATE tasks SET
        status='inprogress', stage=2,
        s3_confirmed_by=NULL, s3_confirmed_at=NULL, s3_note=NULL,
        updated_at=NOW()
      WHERE id = p_task_id;

    -- Manager clicks "Re-open"
    WHEN 'reopen' THEN
      UPDATE tasks SET
        status='inprogress', stage=2,
        completed_at=NULL, updated_at=NOW()
      WHERE id = p_task_id;

  END CASE;

  -- Log to audit trail
  INSERT INTO task_stage_history
    (task_id, from_status, to_status, from_stage, to_stage, action, action_by, note)
  SELECT
    p_task_id, v_from_status, t.status, v_from_stage, t.stage, p_action, p_actor_id, p_note
  FROM tasks t WHERE t.id = p_task_id;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
  RETURN v_task;
END;
$$;


ALTER FUNCTION public.update_task_stage(p_task_id integer, p_action character varying, p_actor_id integer, p_note text) OWNER TO postgres;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    vertical_id integer NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(10),
    requires_postsales boolean DEFAULT false,
    default_ps_template public.ps_template_type DEFAULT 'none'::public.ps_template_type,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_system boolean DEFAULT false
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categories_id_seq OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clients (
    id integer NOT NULL,
    client_name character varying(150) NOT NULL,
    father_spouse_name character varying(150),
    mobile character varying(15),
    email character varying(100),
    pan_number character varying(10),
    address text,
    source character varying(50) DEFAULT 'slt_taskmanager'::character varying NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.clients OWNER TO postgres;

--
-- Name: TABLE clients; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.clients IS 'Client master — single source of truth for all client identities across SLT apps.';


--
-- Name: COLUMN clients.pan_number; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.clients.pan_number IS 'PAN stored in UPPERCASE. Not validated here — validated at application layer.';


--
-- Name: COLUMN clients.source; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.clients.source IS 'Which application created this record. Prepares for future slt_master shared DB.';


--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clients_id_seq OWNER TO postgres;

--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;


--
-- Name: job_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.job_profiles (
    id integer NOT NULL,
    title character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.job_profiles OWNER TO postgres;

--
-- Name: job_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.job_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.job_profiles_id_seq OWNER TO postgres;

--
-- Name: job_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.job_profiles_id_seq OWNED BY public.job_profiles.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    recipient_id integer NOT NULL,
    type public.notification_type NOT NULL,
    title character varying(300) NOT NULL,
    message text,
    task_id integer,
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_id_seq OWNER TO postgres;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: post_sales_fulfillment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.post_sales_fulfillment (
    id integer NOT NULL,
    task_id integer NOT NULL,
    ps_template public.ps_template_type NOT NULL,
    folio_number character varying(50),
    units numeric(15,6),
    nav_rate numeric(12,4),
    allotment_date date,
    tx_reference character varying(100),
    amount_credited numeric(15,2),
    client_account_no character varying(100),
    demat_account_no character varying(100),
    portal_login_id character varying(200),
    temp_password character varying(200),
    contribution_amount numeric(15,2),
    policy_number character varying(100),
    policy_issued_date date,
    coverage_from date,
    coverage_to date,
    next_premium_due date,
    annual_premium numeric(12,2),
    fd_account_no character varying(100),
    fd_receipt_no character varying(100),
    fd_maturity_date date,
    interest_rate numeric(5,2),
    maturity_amount numeric(15,2),
    bank_account_no character varying(100),
    account_type character varying(50),
    ifsc_code character varying(20),
    net_banking_login character varying(200),
    itr_ack_no character varying(50),
    filing_date date,
    financial_year character varying(20),
    itr_form character varying(20),
    total_income numeric(15,2),
    eg_order_ref character varying(100),
    eg_quantity_grams numeric(12,4),
    eg_rate_per_gram numeric(12,2),
    eg_metal_type character varying(20),
    ca_filing_ref character varying(100),
    ca_completion_date date,
    ca_period character varying(100),
    broker_client_id character varying(100),
    broker_demat_no character varying(100),
    credentials_shared boolean DEFAULT false,
    submitted_by integer,
    submitted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    verified_by integer,
    verified_at timestamp without time zone
);


ALTER TABLE public.post_sales_fulfillment OWNER TO postgres;

--
-- Name: post_sales_fulfillment_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.post_sales_fulfillment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.post_sales_fulfillment_id_seq OWNER TO postgres;

--
-- Name: post_sales_fulfillment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.post_sales_fulfillment_id_seq OWNED BY public.post_sales_fulfillment.id;


--
-- Name: renewal_tracker; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.renewal_tracker (
    id integer NOT NULL,
    task_id integer NOT NULL,
    tracker_type character varying(20) NOT NULL,
    client_name character varying(200),
    client_mobile character varying(15),
    client_email character varying(200),
    product_name character varying(100),
    policy_or_fd_no character varying(100),
    renewal_due_date date NOT NULL,
    coverage_to date,
    reminder_30d_sent boolean DEFAULT false,
    reminder_7d_sent boolean DEFAULT false,
    reminder_1d_sent boolean DEFAULT false,
    followup_task_id integer,
    is_actioned boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.renewal_tracker OWNER TO postgres;

--
-- Name: renewal_tracker_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.renewal_tracker_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.renewal_tracker_id_seq OWNER TO postgres;

--
-- Name: renewal_tracker_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.renewal_tracker_id_seq OWNED BY public.renewal_tracker.id;


--
-- Name: subtasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subtasks (
    id integer NOT NULL,
    task_id integer NOT NULL,
    title character varying(500) NOT NULL,
    instructions text,
    assigned_to integer,
    due_date date,
    display_order integer DEFAULT 0,
    is_completed boolean DEFAULT false,
    completed_at timestamp without time zone,
    completed_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.subtasks OWNER TO postgres;

--
-- Name: subtasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.subtasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.subtasks_id_seq OWNER TO postgres;

--
-- Name: subtasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.subtasks_id_seq OWNED BY public.subtasks.id;


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_config (
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description character varying(500),
    updated_by integer,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.system_config OWNER TO postgres;

--
-- Name: task_proofs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_proofs (
    id integer NOT NULL,
    task_id integer NOT NULL,
    stage integer NOT NULL,
    file_name character varying(300) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_size integer,
    mime_type character varying(100),
    uploaded_by integer NOT NULL,
    uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    original_file_name character varying(255),
    storage_root character varying(500),
    uuid_prefix character varying(36),
    CONSTRAINT task_proofs_stage_check CHECK ((stage = ANY (ARRAY[2, 4])))
);


ALTER TABLE public.task_proofs OWNER TO postgres;

--
-- Name: task_proofs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.task_proofs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.task_proofs_id_seq OWNER TO postgres;

--
-- Name: task_proofs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.task_proofs_id_seq OWNED BY public.task_proofs.id;


--
-- Name: task_stage_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_stage_history (
    id integer NOT NULL,
    task_id integer NOT NULL,
    from_status public.task_status,
    to_status public.task_status NOT NULL,
    from_stage integer,
    to_stage integer,
    action character varying(100),
    action_by integer NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.task_stage_history OWNER TO postgres;

--
-- Name: task_stage_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.task_stage_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.task_stage_history_id_seq OWNER TO postgres;

--
-- Name: task_stage_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.task_stage_history_id_seq OWNED BY public.task_stage_history.id;


--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tasks_id_seq OWNER TO postgres;

--
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;


--
-- Name: transaction_natures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transaction_natures (
    id integer NOT NULL,
    category_id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    description character varying(300),
    icon character varying(10),
    ps_template_override public.ps_template_type,
    is_sip boolean DEFAULT false,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    ft_allowed boolean DEFAULT true,
    nft_allowed boolean DEFAULT true,
    is_system boolean DEFAULT false
);


ALTER TABLE public.transaction_natures OWNER TO postgres;

--
-- Name: transaction_natures_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.transaction_natures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transaction_natures_id_seq OWNER TO postgres;

--
-- Name: transaction_natures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.transaction_natures_id_seq OWNED BY public.transaction_natures.id;


--
-- Name: user_reporting_map; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_reporting_map (
    id integer NOT NULL,
    user_id integer NOT NULL,
    manager_id integer NOT NULL,
    priority character varying(10) DEFAULT 'primary'::character varying NOT NULL,
    assigned_by integer,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    CONSTRAINT user_reporting_map_priority_check CHECK (((priority)::text = ANY ((ARRAY['primary'::character varying, 'secondary'::character varying])::text[])))
);


ALTER TABLE public.user_reporting_map OWNER TO postgres;

--
-- Name: user_reporting_map_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_reporting_map_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_reporting_map_id_seq OWNER TO postgres;

--
-- Name: user_reporting_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_reporting_map_id_seq OWNED BY public.user_reporting_map.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(500) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ip_address character varying(50)
);


ALTER TABLE public.user_sessions OWNER TO postgres;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_sessions_id_seq OWNER TO postgres;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_sessions_id_seq OWNED BY public.user_sessions.id;


--
-- Name: user_vertical_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_vertical_access (
    id integer NOT NULL,
    user_id integer NOT NULL,
    vertical_id integer NOT NULL
);


ALTER TABLE public.user_vertical_access OWNER TO postgres;

--
-- Name: user_vertical_access_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_vertical_access_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_vertical_access_id_seq OWNER TO postgres;

--
-- Name: user_vertical_access_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_vertical_access_id_seq OWNED BY public.user_vertical_access.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    full_name character varying(150) NOT NULL,
    email character varying(200) NOT NULL,
    mobile character varying(15),
    password_hash character varying(255),
    role public.user_role NOT NULL,
    reports_to integer,
    tasks_active integer DEFAULT 0,
    tasks_completed integer DEFAULT 0,
    efficiency_pct numeric(5,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    secondary_reports_to integer,
    allow_dual_reporting boolean DEFAULT false,
    job_profile_id integer
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: v_dashboard_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_dashboard_summary AS
 SELECT count(*) FILTER (WHERE (status = 'pending'::public.task_status)) AS pending_count,
    count(*) FILTER (WHERE (status = 'inprogress'::public.task_status)) AS inprogress_count,
    count(*) FILTER (WHERE (status = 'postsales'::public.task_status)) AS postsales_count,
    count(*) FILTER (WHERE (status = 'done'::public.task_status)) AS done_count,
    count(*) FILTER (WHERE ((status <> 'done'::public.task_status) AND (due_date < CURRENT_DATE))) AS overdue_count,
    count(*) FILTER (WHERE ((created_at)::date = CURRENT_DATE)) AS created_today
   FROM public.tasks;


ALTER VIEW public.v_dashboard_summary OWNER TO postgres;

--
-- Name: v_renewals_due_30d; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_renewals_due_30d AS
 SELECT rt.id,
    rt.task_id,
    rt.tracker_type,
    rt.client_name,
    rt.client_mobile,
    rt.client_email,
    rt.product_name,
    rt.policy_or_fd_no,
    rt.renewal_due_date,
    rt.coverage_to,
    rt.reminder_30d_sent,
    rt.reminder_7d_sent,
    rt.reminder_1d_sent,
    rt.followup_task_id,
    rt.is_actioned,
    rt.created_at,
    t.title AS original_task_title,
    t.category_id
   FROM (public.renewal_tracker rt
     JOIN public.tasks t ON ((rt.task_id = t.id)))
  WHERE ((rt.renewal_due_date <= (CURRENT_DATE + '30 days'::interval)) AND (rt.renewal_due_date >= CURRENT_DATE) AND (rt.is_actioned = false))
  ORDER BY rt.renewal_due_date;


ALTER VIEW public.v_renewals_due_30d OWNER TO postgres;

--
-- Name: v_staff_performance; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_staff_performance AS
 SELECT u.id,
    u.full_name,
    u.role,
    u.tasks_active,
    u.tasks_completed,
    u.efficiency_pct,
    count(t.id) FILTER (WHERE (t.status = 'pending'::public.task_status)) AS current_pending,
    count(t.id) FILTER (WHERE (t.status = 'inprogress'::public.task_status)) AS current_inprogress,
    count(t.id) FILTER (WHERE (t.status = 'postsales'::public.task_status)) AS current_postsales,
    count(t.id) FILTER (WHERE ((t.status <> 'done'::public.task_status) AND (t.due_date < CURRENT_DATE))) AS overdue
   FROM (public.users u
     LEFT JOIN public.tasks t ON ((t.assigned_to = u.id)))
  WHERE (u.is_active = true)
  GROUP BY u.id, u.full_name, u.role, u.tasks_active, u.tasks_completed, u.efficiency_pct;


ALTER VIEW public.v_staff_performance OWNER TO postgres;

--
-- Name: verticals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.verticals (
    id integer NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(10),
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_system boolean DEFAULT false
);


ALTER TABLE public.verticals OWNER TO postgres;

--
-- Name: v_tasks_full; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_tasks_full AS
 SELECT t.id,
    t.title,
    t.status,
    t.stage,
    t.priority,
    t.tx_type,
    t.due_date,
    t.created_at,
    t.proof_uploaded,
    t.s4_doc_uploaded,
    t.s3_confirmed_at,
    t.s3_note,
    t.ps_template,
    t.sip_frequency,
    t.sip_date,
    t.sip_day,
    v.name AS vertical_name,
    v.code AS vertical_code,
    c.name AS category_name,
    c.code AS category_code,
    n.name AS nature_name,
    n.code AS nature_code,
    t.client_name,
    t.client_father,
    t.client_mobile,
    t.client_email,
    ua.full_name AS assigned_to_name,
    ua.id AS assigned_to_id,
    uc.full_name AS created_by_name,
    uc.id AS created_by_id,
    us3.full_name AS s3_confirmed_by_name
   FROM ((((((public.tasks t
     JOIN public.verticals v ON ((t.vertical_id = v.id)))
     JOIN public.categories c ON ((t.category_id = c.id)))
     JOIN public.transaction_natures n ON ((t.nature_id = n.id)))
     JOIN public.users ua ON ((t.assigned_to = ua.id)))
     JOIN public.users uc ON ((t.created_by = uc.id)))
     LEFT JOIN public.users us3 ON ((t.s3_confirmed_by = us3.id)));


ALTER VIEW public.v_tasks_full OWNER TO postgres;

--
-- Name: v_user_reporting; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_user_reporting AS
 SELECT u.id,
    u.full_name,
    u.username,
    u.role,
    u.is_active,
    u.allow_dual_reporting,
    pm.full_name AS primary_manager,
    pm.id AS primary_manager_id,
    sm.full_name AS secondary_manager,
    sm.id AS secondary_manager_id,
    jp.title AS job_profile
   FROM (((((public.users u
     LEFT JOIN public.user_reporting_map urm_p ON (((urm_p.user_id = u.id) AND ((urm_p.priority)::text = 'primary'::text) AND (urm_p.is_active = true))))
     LEFT JOIN public.users pm ON ((pm.id = urm_p.manager_id)))
     LEFT JOIN public.user_reporting_map urm_s ON (((urm_s.user_id = u.id) AND ((urm_s.priority)::text = 'secondary'::text) AND (urm_s.is_active = true))))
     LEFT JOIN public.users sm ON ((sm.id = urm_s.manager_id)))
     LEFT JOIN public.job_profiles jp ON ((jp.id = u.job_profile_id)))
  WHERE (u.role <> 'System Admin'::public.user_role);


ALTER VIEW public.v_user_reporting OWNER TO postgres;

--
-- Name: verticals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.verticals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.verticals_id_seq OWNER TO postgres;

--
-- Name: verticals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.verticals_id_seq OWNED BY public.verticals.id;


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: clients id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT nextval('public.clients_id_seq'::regclass);


--
-- Name: job_profiles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_profiles ALTER COLUMN id SET DEFAULT nextval('public.job_profiles_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: post_sales_fulfillment id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_sales_fulfillment ALTER COLUMN id SET DEFAULT nextval('public.post_sales_fulfillment_id_seq'::regclass);


--
-- Name: renewal_tracker id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.renewal_tracker ALTER COLUMN id SET DEFAULT nextval('public.renewal_tracker_id_seq'::regclass);


--
-- Name: subtasks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subtasks ALTER COLUMN id SET DEFAULT nextval('public.subtasks_id_seq'::regclass);


--
-- Name: task_proofs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_proofs ALTER COLUMN id SET DEFAULT nextval('public.task_proofs_id_seq'::regclass);


--
-- Name: task_stage_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_stage_history ALTER COLUMN id SET DEFAULT nextval('public.task_stage_history_id_seq'::regclass);


--
-- Name: tasks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);


--
-- Name: transaction_natures id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_natures ALTER COLUMN id SET DEFAULT nextval('public.transaction_natures_id_seq'::regclass);


--
-- Name: user_reporting_map id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_reporting_map ALTER COLUMN id SET DEFAULT nextval('public.user_reporting_map_id_seq'::regclass);


--
-- Name: user_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions ALTER COLUMN id SET DEFAULT nextval('public.user_sessions_id_seq'::regclass);


--
-- Name: user_vertical_access id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_vertical_access ALTER COLUMN id SET DEFAULT nextval('public.user_vertical_access_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: verticals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.verticals ALTER COLUMN id SET DEFAULT nextval('public.verticals_id_seq'::regclass);


--
-- Name: categories categories_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_code_key UNIQUE (code);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: job_profiles job_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_profiles
    ADD CONSTRAINT job_profiles_pkey PRIMARY KEY (id);


--
-- Name: job_profiles job_profiles_title_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_profiles
    ADD CONSTRAINT job_profiles_title_key UNIQUE (title);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: post_sales_fulfillment post_sales_fulfillment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_sales_fulfillment
    ADD CONSTRAINT post_sales_fulfillment_pkey PRIMARY KEY (id);


--
-- Name: post_sales_fulfillment post_sales_fulfillment_task_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_sales_fulfillment
    ADD CONSTRAINT post_sales_fulfillment_task_id_key UNIQUE (task_id);


--
-- Name: renewal_tracker renewal_tracker_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.renewal_tracker
    ADD CONSTRAINT renewal_tracker_pkey PRIMARY KEY (id);


--
-- Name: subtasks subtasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (key);


--
-- Name: task_proofs task_proofs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_proofs
    ADD CONSTRAINT task_proofs_pkey PRIMARY KEY (id);


--
-- Name: task_stage_history task_stage_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_stage_history
    ADD CONSTRAINT task_stage_history_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: transaction_natures transaction_natures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_natures
    ADD CONSTRAINT transaction_natures_pkey PRIMARY KEY (id);


--
-- Name: user_reporting_map user_reporting_map_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_reporting_map
    ADD CONSTRAINT user_reporting_map_pkey PRIMARY KEY (id);


--
-- Name: user_reporting_map user_reporting_map_user_id_manager_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_reporting_map
    ADD CONSTRAINT user_reporting_map_user_id_manager_id_key UNIQUE (user_id, manager_id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_vertical_access user_vertical_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_vertical_access
    ADD CONSTRAINT user_vertical_access_pkey PRIMARY KEY (id);


--
-- Name: user_vertical_access user_vertical_access_user_id_vertical_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_vertical_access
    ADD CONSTRAINT user_vertical_access_user_id_vertical_id_key UNIQUE (user_id, vertical_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: verticals verticals_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.verticals
    ADD CONSTRAINT verticals_code_key UNIQUE (code);


--
-- Name: verticals verticals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.verticals
    ADD CONSTRAINT verticals_pkey PRIMARY KEY (id);


--
-- Name: idx_clients_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clients_active ON public.clients USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_clients_mobile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clients_mobile ON public.clients USING btree (mobile);


--
-- Name: idx_clients_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clients_name ON public.clients USING btree (client_name);


--
-- Name: idx_clients_pan; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clients_pan ON public.clients USING btree (pan_number);


--
-- Name: idx_notifications_recipient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_recipient ON public.notifications USING btree (recipient_id, is_read);


--
-- Name: idx_renewal_tracker_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_renewal_tracker_date ON public.renewal_tracker USING btree (renewal_due_date);


--
-- Name: idx_renewal_tracker_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_renewal_tracker_type ON public.renewal_tracker USING btree (tracker_type);


--
-- Name: idx_reporting_map_manager; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reporting_map_manager ON public.user_reporting_map USING btree (manager_id);


--
-- Name: idx_reporting_map_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reporting_map_user ON public.user_reporting_map USING btree (user_id);


--
-- Name: idx_stage_history_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stage_history_task_id ON public.task_stage_history USING btree (task_id);


--
-- Name: idx_subtasks_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_subtasks_task_id ON public.subtasks USING btree (task_id);


--
-- Name: idx_task_proofs_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_task_proofs_task_id ON public.task_proofs USING btree (task_id);


--
-- Name: idx_tasks_assigned_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to);


--
-- Name: idx_tasks_category_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_category_id ON public.tasks USING btree (category_id);


--
-- Name: idx_tasks_client_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_client_id ON public.tasks USING btree (client_id);


--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_created_at ON public.tasks USING btree (created_at);


--
-- Name: idx_tasks_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_created_by ON public.tasks USING btree (created_by);


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_tasks_vertical_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_vertical_id ON public.tasks USING btree (vertical_id);


--
-- Name: idx_users_secondary; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_secondary ON public.users USING btree (secondary_reports_to);


--
-- Name: post_sales_fulfillment trg_create_renewal_tracker; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_create_renewal_tracker AFTER INSERT OR UPDATE ON public.post_sales_fulfillment FOR EACH ROW EXECUTE FUNCTION public.create_renewal_tracker();


--
-- Name: categories categories_vertical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_vertical_id_fkey FOREIGN KEY (vertical_id) REFERENCES public.verticals(id) ON DELETE CASCADE;


--
-- Name: clients clients_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users fk_users_job_profile; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_job_profile FOREIGN KEY (job_profile_id) REFERENCES public.job_profiles(id);


--
-- Name: job_profiles job_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.job_profiles
    ADD CONSTRAINT job_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: post_sales_fulfillment post_sales_fulfillment_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_sales_fulfillment
    ADD CONSTRAINT post_sales_fulfillment_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id);


--
-- Name: post_sales_fulfillment post_sales_fulfillment_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_sales_fulfillment
    ADD CONSTRAINT post_sales_fulfillment_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: post_sales_fulfillment post_sales_fulfillment_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_sales_fulfillment
    ADD CONSTRAINT post_sales_fulfillment_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: renewal_tracker renewal_tracker_followup_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.renewal_tracker
    ADD CONSTRAINT renewal_tracker_followup_task_id_fkey FOREIGN KEY (followup_task_id) REFERENCES public.tasks(id);


--
-- Name: renewal_tracker renewal_tracker_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.renewal_tracker
    ADD CONSTRAINT renewal_tracker_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: subtasks subtasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: subtasks subtasks_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);


--
-- Name: subtasks subtasks_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subtasks
    ADD CONSTRAINT subtasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: system_config system_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: task_proofs task_proofs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_proofs
    ADD CONSTRAINT task_proofs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_proofs task_proofs_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_proofs
    ADD CONSTRAINT task_proofs_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: task_stage_history task_stage_history_action_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_stage_history
    ADD CONSTRAINT task_stage_history_action_by_fkey FOREIGN KEY (action_by) REFERENCES public.users(id);


--
-- Name: task_stage_history task_stage_history_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_stage_history
    ADD CONSTRAINT task_stage_history_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: tasks tasks_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: tasks tasks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: tasks tasks_nature_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_nature_id_fkey FOREIGN KEY (nature_id) REFERENCES public.transaction_natures(id);


--
-- Name: tasks tasks_s3_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_s3_confirmed_by_fkey FOREIGN KEY (s3_confirmed_by) REFERENCES public.users(id);


--
-- Name: tasks tasks_vertical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_vertical_id_fkey FOREIGN KEY (vertical_id) REFERENCES public.verticals(id);


--
-- Name: transaction_natures transaction_natures_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_natures
    ADD CONSTRAINT transaction_natures_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: user_reporting_map user_reporting_map_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_reporting_map
    ADD CONSTRAINT user_reporting_map_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: user_reporting_map user_reporting_map_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_reporting_map
    ADD CONSTRAINT user_reporting_map_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_reporting_map user_reporting_map_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_reporting_map
    ADD CONSTRAINT user_reporting_map_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_vertical_access user_vertical_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_vertical_access
    ADD CONSTRAINT user_vertical_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_vertical_access user_vertical_access_vertical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_vertical_access
    ADD CONSTRAINT user_vertical_access_vertical_id_fkey FOREIGN KEY (vertical_id) REFERENCES public.verticals(id) ON DELETE CASCADE;


--
-- Name: users users_reports_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_reports_to_fkey FOREIGN KEY (reports_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users users_secondary_reports_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_secondary_reports_to_fkey FOREIGN KEY (secondary_reports_to) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict X5IrVzdd0VySUkGAqb1yEHTV22up9hQZmRSG5Rj3Kfnb6dJQ82C9gg5Fzp6ZbUF

