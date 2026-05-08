-- CreateEnum
CREATE TYPE "ManualJurorAssignmentAction" AS ENUM ('ASSIGN', 'UNASSIGN', 'REASSIGN', 'UNASSIGN_ALL', 'UNASSIGN_ALL_FROM_EVALUATOR');

-- CreateTable
CREATE TABLE "juror_assignment_audit_logs" (
    "id" SERIAL NOT NULL,
    "action" "ManualJurorAssignmentAction" NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "team_id" INTEGER,
    "juror_id" TEXT,
    "previous_juror_id" TEXT,
    "new_juror_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "juror_assignment_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "juror_assignment_audit_logs_actor_user_id_idx" ON "juror_assignment_audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "juror_assignment_audit_logs_team_id_idx" ON "juror_assignment_audit_logs"("team_id");

-- CreateIndex
CREATE INDEX "juror_assignment_audit_logs_juror_id_idx" ON "juror_assignment_audit_logs"("juror_id");

-- CreateIndex
CREATE INDEX "juror_assignment_audit_logs_created_at_idx" ON "juror_assignment_audit_logs"("created_at");
