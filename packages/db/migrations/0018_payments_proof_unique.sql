-- Accord de l'utilisateur (2026-11-10, PR « migrations 0018-0019 ») : « un reçu, un paiement » garanti en base, en plus
-- du verrou applicatif (subscriberProofOf FOR UPDATE, lot 3.3). Une preuve ne sert qu'à un seul paiement en attente ou
-- validé ; un paiement rejeté ou annulé la libère. Index ajouté à docs/specs/schema.sql.
CREATE UNIQUE INDEX payments_proof_unique ON payments (proof_file_id)
  WHERE proof_file_id IS NOT NULL AND status IN ('pending', 'validated');
