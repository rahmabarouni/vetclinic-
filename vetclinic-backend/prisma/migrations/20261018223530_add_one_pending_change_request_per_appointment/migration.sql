-- Un seul changement en attente par rendez-vous : le front ne propose jamais
-- deux modifications concurrentes, et cela empêche deux approbations concurrentes.
CREATE UNIQUE INDEX "appointment_change_requests_one_pending_per_appointment"
  ON "appointment_change_requests"("appointment_id")
  WHERE "status" = 'PENDING';
