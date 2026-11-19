-- The application accesses PostgreSQL through the trusted Express backend.
-- No Supabase anon/authenticated client may bypass owner checks through PostgREST.
-- The migration/table owner (or a BYPASSRLS server role) retains backend access.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Topology" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NetworkPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BranchDesign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BranchDesignRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlatformUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlatformRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
