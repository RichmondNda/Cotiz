-- Lot 1.4 : statistiques plateforme (pf.dashboard), module reporting. Vues matérialisées rafraîchies toutes les
-- 15 min par la tâche stats.refresh (jobs.yaml ; architecture/09 : rafraîchissement concurrent planifié).
-- Mois et « ce mois-ci » dans le fuseau de la plateforme (Africa/Abidjan).

-- Associations actives à la fin de chacun des 12 derniers mois (le mois en cours : au rafraîchissement). Aucun
-- historique des statuts : reconstruit à partir de l'activation (fin de l'onboarding, à défaut la création) et de la
-- suspension en cours. Une association réactivée compte comme active sur tout son historique.
CREATE MATERIALIZED VIEW stats_active_associations_by_month AS
WITH months AS (
  SELECT (date_trunc('month', now() AT TIME ZONE 'Africa/Abidjan') - make_interval(months => n))::date AS month
    FROM generate_series(0, 11) AS n
), bounds AS (
  SELECT month,
         CASE WHEN n.next > now() THEN now() ELSE n.next END AS at
    FROM months, LATERAL (SELECT (month + interval '1 month') AT TIME ZONE 'Africa/Abidjan' AS next) AS n
)
SELECT b.month, count(a.id)::int AS count
  FROM bounds b
  LEFT JOIN associations a
    ON a.status IN ('active', 'suspended')
   AND coalesce(a.onboarding_completed_at, a.created_at) < b.at
   AND NOT (a.status = 'suspended' AND a.suspended_at < b.at)
 GROUP BY b.month;
--> statement-breakpoint
CREATE UNIQUE INDEX stats_active_associations_by_month_key ON stats_active_associations_by_month (month);
--> statement-breakpoint
-- Associations non fermées par plan affiché (abonnement en cours, à défaut le plus récent ; comme pf.asso.list).
CREATE MATERIALIZED VIEW stats_associations_by_plan AS
SELECT d.plan_id, count(*)::int AS count
  FROM (SELECT DISTINCT ON (s.association_id) s.association_id, s.plan_id
          FROM subscriptions s
         ORDER BY s.association_id, (s.status IN ('trialing', 'active', 'past_due')) DESC, s.created_at DESC, s.id DESC) d
  JOIN associations a ON a.id = d.association_id AND a.status <> 'closed'
 GROUP BY d.plan_id;
--> statement-breakpoint
CREATE UNIQUE INDEX stats_associations_by_plan_key ON stats_associations_by_plan (plan_id);
--> statement-breakpoint
-- Compteurs du tableau de bord (une ligne).
CREATE MATERIALIZED VIEW stats_platform_kpi AS
SELECT 1 AS id,
       (SELECT count(*) FROM associations WHERE status = 'active')::int AS active_associations,
       (SELECT count(*) FROM associations
         WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Abidjan') AT TIME ZONE 'Africa/Abidjan')::int
         AS new_associations_this_month,
       (SELECT count(*) FROM associations)::int AS total_associations,
       (SELECT count(*) FROM subscriptions WHERE status = 'active')::int AS subscriptions_up_to_date,
       (SELECT count(*) FROM subscriptions WHERE status = 'past_due')::int AS subscriptions_unpaid,
       now() AS refreshed_at;
--> statement-breakpoint
CREATE UNIQUE INDEX stats_platform_kpi_key ON stats_platform_kpi (id);
--> statement-breakpoint
-- Abonnements facturés (actifs ou impayés, sans les essais) par prix : le revenu mensuel récurrent est calculé par
-- @cotiz/domain (monthlyRecurringRevenue). Prix : tarif actuel du plan pour la période (aucun prix figé, lot 4.6).
CREATE MATERIALIZED VIEW stats_recurring_revenue AS
SELECT s.billing_period,
       CASE s.billing_period WHEN 'monthly' THEN p.price_monthly ELSE p.price_yearly END AS price,
       p.currency,
       count(*)::int AS count
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
 WHERE s.status IN ('active', 'past_due')
 GROUP BY 1, 2, 3;
--> statement-breakpoint
CREATE UNIQUE INDEX stats_recurring_revenue_key ON stats_recurring_revenue (billing_period, price, currency);
--> statement-breakpoint
-- Rafraîchissement par le worker (cotiz_app, espace system) : seul le propriétaire rafraîchit une vue matérialisée
-- (PostgreSQL 16). Les requêtes des vues s'exécutent en cotiz_migrator, sous les politiques system_* des tables lues.
CREATE FUNCTION refresh_platform_stats() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ BEGIN
       IF app_space() <> 'system' THEN
         RAISE EXCEPTION 'refresh_platform_stats : espace system seulement' USING ERRCODE = 'insufficient_privilege';
       END IF;
       REFRESH MATERIALIZED VIEW CONCURRENTLY stats_active_associations_by_month;
       REFRESH MATERIALIZED VIEW CONCURRENTLY stats_associations_by_plan;
       REFRESH MATERIALIZED VIEW CONCURRENTLY stats_platform_kpi;
       REFRESH MATERIALIZED VIEW CONCURRENTLY stats_recurring_revenue;
     END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION refresh_platform_stats() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION refresh_platform_stats() TO cotiz_app;
--> statement-breakpoint
-- Statistiques de toute la plateforme : lues par cotiz_platform seulement (aucune politique RLS sur une vue).
REVOKE ALL ON stats_active_associations_by_month, stats_associations_by_plan, stats_platform_kpi,
  stats_recurring_revenue FROM cotiz_app, cotiz_readonly;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON stats_active_associations_by_month, stats_associations_by_plan, stats_platform_kpi,
  stats_recurring_revenue FROM cotiz_platform;
--> statement-breakpoint
-- Activité récente du tableau de bord (10 derniers événements de la plateforme) sans parcourir tout le journal.
CREATE INDEX audit_platform_activity ON audit_logs (occurred_at DESC, id DESC)
  WHERE association_id IS NOT NULL
    AND action IN ('association.create', 'association_request.approve', 'association.suspend',
                   'association.reactivate', 'subscription.change_plan');
