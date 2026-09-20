-- Run only against a NEW restore target, before schema.sql creates app objects.
-- pg_dump emits source grants but cannot revoke grants implicitly added by a
-- different target's defaults. Remove Supabase's broad API-role defaults first;
-- schema.sql then restores the source object grants and future default grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
