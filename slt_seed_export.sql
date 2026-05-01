--
-- PostgreSQL database dump
--

\restrict fbCIL5Otaqtvrx4PNLaCuIe3n0Y78rMEeLcjiFIXemMoUcA5VK9RBkhFYrdEpOr

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
-- Data for Name: verticals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.verticals (id, code, name, icon, display_order, is_active, created_at, is_system) FROM stdin;
1	ca	CA Practice	🏛️	1	t	2026-04-10 14:55:19.816435	t
2	dist	Financial Distribution	💹	2	t	2026-04-10 14:55:19.816435	t
3	broke	Broking Services	📈	3	t	2026-04-10 14:55:19.816435	t
5	social	Social Media Marketing	\N	99	t	2026-04-15 03:56:38.09131	f
4	marketing	Legal Marketing	\N	4	t	2026-04-15 03:53:00.735852	f
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, vertical_id, code, name, icon, requires_postsales, default_ps_template, display_order, is_active, created_at, is_system) FROM stdin;
1	1	gst	GST Returns	📋	f	ca_work	1	t	2026-04-10 14:55:19.816435	t
2	1	itr	ITR Filing	📑	f	ca_work	2	t	2026-04-10 14:55:19.816435	t
3	1	audit	Tax / Stat Audit	🔍	f	ca_work	3	t	2026-04-10 14:55:19.816435	t
4	1	tds	TDS Filing	📊	f	ca_work	4	t	2026-04-10 14:55:19.816435	t
5	1	acc	Accounting / Bookkeeping	📒	f	ca_work	5	t	2026-04-10 14:55:19.816435	t
6	1	roc	ROC / MCA Filings	🏛️	f	ca_work	6	t	2026-04-10 14:55:19.816435	t
7	2	mf	Mutual Funds	💹	t	mf_purchase	1	t	2026-04-10 14:55:19.816435	t
8	2	pms	PMS	📊	t	pms	2	t	2026-04-10 14:55:19.816435	t
9	2	aif	AIF	🏦	t	aif	3	t	2026-04-10 14:55:19.816435	t
10	2	health	Health Insurance	🏥	t	insurance	4	t	2026-04-10 14:55:19.816435	t
11	2	life	Life Insurance	🛡️	t	insurance	5	t	2026-04-10 14:55:19.816435	t
12	2	gen	General Insurance	📋	t	insurance	6	t	2026-04-10 14:55:19.816435	t
13	2	fd	Corporate FD	🏛️	t	fd	7	t	2026-04-10 14:55:19.816435	t
14	2	bank	Banking Products	💳	t	bank	8	t	2026-04-10 14:55:19.816435	t
15	2	tax	Tax & Compliance	📑	f	tax	9	t	2026-04-10 14:55:19.816435	t
16	2	egold	eGold / eSilver	🥇	t	egold	10	t	2026-04-10 14:55:19.816435	t
17	3	demat	Demat Account	📈	t	broking	1	t	2026-04-10 14:55:19.816435	t
18	3	trade	Trade Support	⚡	f	broking	2	t	2026-04-10 14:55:19.816435	t
19	3	bkyc	KYC / Onboarding	📋	f	broking	3	t	2026-04-10 14:55:19.816435	t
20	3	dp	DP Services	🏦	f	broking	4	t	2026-04-10 14:55:19.816435	t
21	4	li	LinkedIn	\N	t	bank	99	t	2026-04-15 03:54:17.766114	f
22	5	insta	Instagram	\N	t	bank	99	t	2026-04-15 03:56:57.923189	f
\.


--
-- Data for Name: transaction_natures; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transaction_natures (id, category_id, code, name, description, icon, ps_template_override, is_sip, display_order, is_active, ft_allowed, nft_allowed, is_system) FROM stdin;
65	21	post	LinkedIn Post	linkedin post of clients	\N	\N	f	99	t	f	t	f
67	22	ip	Instagram Post	\N	\N	\N	f	99	t	f	t	f
68	22	ir	Instagram Reel	\N	\N	\N	f	99	t	f	t	f
1	1	gstr1	Monthly GSTR-1	Outward supply return	📅	\N	f	1	t	t	t	t
2	1	gstr3b	Monthly GSTR-3B	Summary return	📅	\N	f	2	t	t	t	t
3	1	gstr9	Annual GSTR-9	Annual return	📊	\N	f	3	t	t	t	t
4	1	gstr9c	GST Audit GSTR-9C	Reconciliation statement	🔍	\N	f	4	t	t	t	t
5	1	gst_new	New GST Registration	Fresh GST number	🆕	\N	f	5	t	t	t	t
6	2	itr12	Individual ITR-1/2	Salaried / capital gains	👤	\N	f	1	t	t	t	t
7	2	itr34	Business ITR-3/4	Business income	💼	\N	f	2	t	t	t	t
8	2	itr6	Corporate ITR-6	Company return	🏢	\N	f	3	t	t	t	t
9	3	tax_audit	Tax Audit (3CD)	Section 44AB	🔍	\N	f	1	t	t	t	t
10	3	stat_audit	Statutory Audit	Companies Act	📋	\N	f	2	t	t	t	t
11	3	int_audit	Internal Audit	Process review	📊	\N	f	3	t	t	t	t
12	4	tds_return	TDS Return Filing	Quarterly returns	📑	\N	f	1	t	t	t	t
13	4	tds_cert	TDS Certificate	Form 16/16A	📋	\N	f	2	t	t	t	t
14	5	bookkeeping	Monthly Bookkeeping	Account maintenance	📒	\N	f	1	t	t	t	t
15	5	fin_stmt	Financial Statements	P&L, Balance Sheet	📊	\N	f	2	t	t	t	t
16	5	payroll	Payroll Processing	Monthly salary	💼	\N	f	3	t	t	t	t
17	6	mgt7	Annual Return (MGT-7)	Company annual filing	📋	\N	f	1	t	t	t	t
18	6	aoc4	Financial Statements (AOC-4)	Form filing	📑	\N	f	2	t	t	t	t
19	6	incorp	Company Incorporation	New company setup	🆕	\N	f	3	t	t	t	t
20	7	mf_lumpsum	Lump Sum Purchase	One-time buy	💵	mf_purchase	f	1	t	t	t	t
21	7	mf_sip	SIP Registration	Regular investment	📅	mf_purchase	t	2	t	t	t	t
22	7	mf_stp	STP Registration	Systematic transfer	🔄	mf_purchase	f	3	t	t	t	t
23	7	mf_redemption	Lump Sum Redemption	One-time withdrawal	💸	mf_redemption	f	4	t	t	t	t
24	7	mf_swp	SWP Registration	Regular withdrawal	🗓️	mf_redemption	f	5	t	t	t	t
25	7	mf_switch	Switch Transaction	Change scheme	🔀	mf_purchase	f	6	t	t	t	t
26	8	pms_new	New Onboarding	Fresh PMS investment	💵	\N	f	1	t	t	t	t
27	8	pms_exit	Redemption / Exit	Exit from PMS	💸	\N	f	2	t	t	t	t
28	9	aif_new	New Investment	Fresh AIF commitment	💵	\N	f	1	t	t	t	t
29	9	aif_exit	Redemption	Exit from AIF	💸	\N	f	2	t	t	t	t
30	10	health_new	New Policy Purchase	Fresh health cover	🆕	\N	f	1	t	t	t	t
31	10	health_renew	Policy Renewal	Renew existing policy	🔄	\N	f	2	t	t	t	t
32	10	health_remind	Renewal Reminder	Upcoming renewal alert	🔔	\N	f	3	t	t	t	t
33	10	health_query	Service Query	Policy related query	❓	\N	f	4	t	t	t	t
34	10	health_claim	Claim Assistance	Claims support	📋	\N	f	5	t	t	t	t
35	11	life_new	New Policy Purchase	Term / ULIP / Endowment	🆕	\N	f	1	t	t	t	t
36	11	life_renew	Policy Renewal	Renew existing policy	🔄	\N	f	2	t	t	t	t
37	11	life_remind	Renewal Reminder	Upcoming renewal alert	🔔	\N	f	3	t	t	t	t
38	11	life_query	Service Query	Policy related query	❓	\N	f	4	t	t	t	t
39	11	life_claim	Claim Assistance	Claims support	📋	\N	f	5	t	t	t	t
40	12	gen_new	New Policy Purchase	Motor / Home / Travel	🆕	\N	f	1	t	t	t	t
41	12	gen_renew	Policy Renewal	Renew existing policy	🔄	\N	f	2	t	t	t	t
42	12	gen_remind	Renewal Reminder	Upcoming renewal alert	🔔	\N	f	3	t	t	t	t
43	12	gen_query	Service Query	Policy related query	❓	\N	f	4	t	t	t	t
44	13	fd_new	New FD Booking	Fresh fixed deposit	💵	\N	f	1	t	t	t	t
45	13	fd_renew	FD Renewal	Roll over on maturity	🔄	\N	f	2	t	t	t	t
46	13	fd_remind	Maturity Reminder	FD maturity alert	🔔	\N	f	3	t	t	t	t
47	14	bank_acc	Account Opening	Current / Savings account	🏦	\N	f	1	t	t	t	t
48	14	bank_card	Credit Card Application	New card issuance	💳	\N	f	2	t	t	t	t
49	14	bank_loan	Loan Application	Personal / Business loan	🤝	\N	f	3	t	t	t	t
50	14	bank_query	Service Query	Banking related query	❓	\N	f	4	t	t	t	t
51	15	tax_itr	ITR Filing	Income tax return	📑	\N	f	1	t	t	t	t
52	15	tax_bk	Bookkeeping	Account maintenance	📒	\N	f	2	t	t	t	t
53	15	tax_cg	Capital Gain Report	CG for ITR filing	📊	\N	f	3	t	t	t	t
54	16	eg_lumpsum	Lump Sum Purchase	One-time eGold/eSilver buy	💵	egold	f	1	t	t	t	t
55	16	eg_sip	SIP Purchase	Regular SIP	📅	egold	t	2	t	t	t	t
56	16	eg_redeem	Withdrawal / Redemption	Redeem eGold/eSilver	💸	egold	f	3	t	t	t	t
57	17	demat_new	New Demat Account	Fresh account opening	🆕	\N	f	1	t	t	t	t
58	17	demat_seg	Segment Addition	Add F&O / Currency	➕	\N	f	2	t	t	t	t
59	18	trade_query	Trade Query	Support for trades	❓	\N	f	1	t	t	t	t
60	18	trade_platform	Platform Issue	Login / access	🔐	\N	f	2	t	t	t	t
61	19	bkyc_new	KYC Verification	New client KYC	👤	\N	f	1	t	t	t	t
62	19	bkyc_update	KYC Update	Update existing KYC	🔄	\N	f	2	t	t	t	t
63	20	dp_query	DP Services Query	Demat services	📋	\N	f	1	t	t	t	t
64	20	dp_stmt	Statement Request	Holdings statement	📄	\N	f	2	t	t	t	t
66	21	poster	Poster for Linkedin	poster creation job for linkedin	\N	\N	f	99	t	t	t	f
69	21	linkp	Linkedin Post	\N	\N	\N	f	99	t	f	t	f
70	21	linkposter	Linkedin Poster	\N	\N	\N	f	99	t	f	t	f
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, full_name, email, mobile, password_hash, role, reports_to, tasks_active, tasks_completed, efficiency_pct, is_active, last_login, created_at, updated_at, secondary_reports_to, allow_dual_reporting, job_profile_id) FROM stdin;
15	teststaff.jest	Teststaff1776114109600 Jest	teststaff.1776114109600@slt.test	9876500000	\N	Back Office Operator	\N	0	0	0.00	t	\N	2026-04-14 02:31:49.605086	2026-04-14 02:31:49.605086	\N	f	\N
13	testuser.jest	Testuser1776053005382 Jest	jest.test.1776053005382@slt.test	9876543210	\N	Back Office Operator	\N	0	0	0.00	t	\N	2026-04-13 09:33:25.384344	2026-04-13 09:33:25.384344	\N	f	\N
28	diwakar.sharma	Diwakar Sharma	sharma.diwakar1302@gmail.com	\N	$2b$10$yK0KAf7FwCPTqp.lbqHlhOJt1aumEy0Y276rv6Krf5JERJrt3jONa	Admin / Partner	\N	0	0	0.00	t	\N	2026-04-27 16:15:33.324899	2026-04-27 16:15:33.324899	\N	f	\N
1	shanil	Shanil Jain	shanil.jain@gmail.com	9876500001	$2b$10$yK0KAf7FwCPTqp.lbqHlhOJt1aumEy0Y276rv6Krf5JERJrt3jONa	Admin / Partner	\N	0	0	0.00	t	2026-04-27 21:52:53.119701	2026-04-10 14:55:19.816435	2026-04-27 16:15:33.324899	\N	f	\N
14	sysadmin	System Administrator	sysadmin@secondlevelthink.com	\N	$2b$10$yK0KAf7FwCPTqp.lbqHlhOJt1aumEy0Y276rv6Krf5JERJrt3jONa	System Admin	\N	0	0	0.00	t	2026-04-27 21:53:26.131096	2026-04-14 01:01:35.709601	2026-04-27 16:15:33.324899	\N	f	\N
10	jest.test.user.	Jest Test User 1776052587964	jest.test.1776052587964@slt.test	9876543210	\N	Back Office Operator	\N	0	0	0.00	t	\N	2026-04-13 09:26:27.967367	2026-04-13 09:26:27.967367	\N	f	\N
\.


--
-- Data for Name: user_vertical_access; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_vertical_access (id, user_id, vertical_id) FROM stdin;
1	1	1
2	1	2
3	1	3
20	10	1
21	10	2
22	10	3
23	13	1
24	13	2
25	13	3
26	15	1
27	15	2
28	15	3
59	28	1
60	28	2
61	28	3
62	28	5
63	28	4
\.


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categories_id_seq', 22, true);


--
-- Name: transaction_natures_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.transaction_natures_id_seq', 70, true);


--
-- Name: user_vertical_access_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_vertical_access_id_seq', 63, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 28, true);


--
-- Name: verticals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.verticals_id_seq', 5, true);


--
-- PostgreSQL database dump complete
--

\unrestrict fbCIL5Otaqtvrx4PNLaCuIe3n0Y78rMEeLcjiFIXemMoUcA5VK9RBkhFYrdEpOr

