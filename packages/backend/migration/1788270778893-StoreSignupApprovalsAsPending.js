/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class StoreSignupApprovalsAsPending1788270778893 {
	name = 'StoreSignupApprovalsAsPending1788270778893'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_pending" ADD "approvalTicket" character varying(128)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_pending_approvalTicket" ON "user_pending" ("approvalTicket") WHERE "approvalTicket" IS NOT NULL`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_pending_usernameLower" ON "user_pending" (LOWER("username")) WHERE "approvalTicket" IS NOT NULL`);

		await queryRunner.query(`ALTER TABLE "approval_message" DROP CONSTRAINT "FK_approval_message_userId"`);
		await queryRunner.query(`DROP INDEX "IDX_approval_message_userId"`);
		await queryRunner.query(`ALTER TABLE "approval_message" ADD "approvalTicket" character varying(128)`);
		await queryRunner.query(`UPDATE "approval_message" AS message SET "approvalTicket" = "user"."approvalTicket" FROM "user" WHERE "user"."id" = message."userId"`);
		await queryRunner.query(`DELETE FROM "approval_message" WHERE "approvalTicket" IS NULL`);
		await queryRunner.query(`ALTER TABLE "approval_message" ALTER COLUMN "approvalTicket" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "approval_message" DROP COLUMN "userId"`);
		await queryRunner.query(`CREATE INDEX "IDX_approval_message_approvalTicket" ON "approval_message" ("approvalTicket")`);
		await queryRunner.query(`CREATE INDEX "IDX_approval_message_ticket_createdAt" ON "approval_message" ("approvalTicket", "createdAt")`);

		await queryRunner.query(`INSERT INTO "user_pending" ("id", "code", "username", "email", "password", "signupReason", "approvalTicket") SELECT "user"."id", 'approval-' || "user"."id", "user"."username", COALESCE(profile."email", ''), profile."password", profile."signupReason", "user"."approvalTicket" FROM "user" INNER JOIN "user_profile" AS profile ON profile."userId" = "user"."id" WHERE "user"."approved" = false AND "user"."approvalTicket" IS NOT NULL`);
		await queryRunner.query(`DELETE FROM "used_username" WHERE "username" IN (SELECT LOWER("username") FROM "user" WHERE "approved" = false AND "approvalTicket" IS NOT NULL)`);
		await queryRunner.query(`DELETE FROM "user" WHERE "approved" = false AND "approvalTicket" IS NOT NULL`);
	}

	async down(queryRunner) {
		const pendingApprovals = await queryRunner.query(`SELECT 1 FROM "user_pending" WHERE "approvalTicket" IS NOT NULL LIMIT 1`);
		if (pendingApprovals.length > 0) {
			throw new Error('Cannot revert while pending signup approvals exist.');
		}

		await queryRunner.query(`DROP INDEX "IDX_approval_message_ticket_createdAt"`);
		await queryRunner.query(`DROP INDEX "IDX_approval_message_approvalTicket"`);
		await queryRunner.query(`ALTER TABLE "approval_message" ADD "userId" character varying(32)`);
		await queryRunner.query(`UPDATE "approval_message" AS message SET "userId" = "user"."id" FROM "user" WHERE "user"."approvalTicket" = message."approvalTicket"`);
		const orphanMessages = await queryRunner.query(`SELECT 1 FROM "approval_message" WHERE "userId" IS NULL LIMIT 1`);
		if (orphanMessages.length > 0) {
			throw new Error('Cannot revert approval messages without an associated user.');
		}
		await queryRunner.query(`ALTER TABLE "approval_message" ALTER COLUMN "userId" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "approval_message" DROP COLUMN "approvalTicket"`);
		await queryRunner.query(`CREATE INDEX "IDX_approval_message_userId" ON "approval_message" ("userId")`);
		await queryRunner.query(`ALTER TABLE "approval_message" ADD CONSTRAINT "FK_approval_message_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

		await queryRunner.query(`DROP INDEX "IDX_user_pending_approvalTicket"`);
		await queryRunner.query(`DROP INDEX "IDX_user_pending_usernameLower"`);
		await queryRunner.query(`ALTER TABLE "user_pending" DROP COLUMN "approvalTicket"`);
	}
}
