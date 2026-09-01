/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddApprovalSystem1788238778897 {
	name = 'AddApprovalSystem1788238778897'

	async up(queryRunner) {
		// Add approval system flag to meta table
		await queryRunner.query(`ALTER TABLE "meta" ADD "approvalRequiredForSignup" boolean NOT NULL DEFAULT false`);

		// Add approval fields to user table
		await queryRunner.query(`ALTER TABLE "user" ADD "approved" boolean NOT NULL DEFAULT true`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."approved" IS 'Whether the User is approved.'`);
		await queryRunner.query(`ALTER TABLE "user" ADD "approvalTicket" character varying(128)`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."approvalTicket" IS 'Approval ticket number for signup approval system.'`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_da7eb6d177d4ade3305499b443" ON "user" ("approvalTicket") WHERE "approvalTicket" IS NOT NULL`);

		// Add signup reason to user_profile table
		await queryRunner.query(`ALTER TABLE "user_profile" ADD "signupReason" character varying(2048)`);
		await queryRunner.query(`COMMENT ON COLUMN "user_profile"."signupReason" IS 'The signup reason provided by the user during registration.'`);

		// Add signup reason to user_pending table
		await queryRunner.query(`ALTER TABLE "user_pending" ADD "signupReason" character varying(2048)`);

		// Create approval_message table
		await queryRunner.query(`CREATE TABLE "approval_message" ("id" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "userId" character varying(32) NOT NULL, "isFromAdmin" boolean NOT NULL, "message" character varying(4096) NOT NULL, CONSTRAINT "PK_approval_message" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_approval_message_userId" ON "approval_message" ("userId")`);
		await queryRunner.query(`CREATE INDEX "IDX_approval_message_createdAt" ON "approval_message" ("createdAt")`);
		await queryRunner.query(`COMMENT ON COLUMN "approval_message"."createdAt" IS 'The created date of the ApprovalMessage.'`);
		await queryRunner.query(`COMMENT ON COLUMN "approval_message"."isFromAdmin" IS 'Whether the message is from admin.'`);
		await queryRunner.query(`ALTER TABLE "approval_message" ADD CONSTRAINT "FK_approval_message_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		// Drop approval_message table
		await queryRunner.query(`ALTER TABLE "approval_message" DROP CONSTRAINT "FK_approval_message_userId"`);
		await queryRunner.query(`COMMENT ON COLUMN "approval_message"."isFromAdmin" IS 'Whether the message is from admin.'`);
		await queryRunner.query(`COMMENT ON COLUMN "approval_message"."createdAt" IS 'The created date of the ApprovalMessage.'`);
		await queryRunner.query(`DROP INDEX "IDX_approval_message_createdAt"`);
		await queryRunner.query(`DROP INDEX "IDX_approval_message_userId"`);
		await queryRunner.query(`DROP TABLE "approval_message"`);

		// Remove signup reason from user_pending
		await queryRunner.query(`ALTER TABLE "user_pending" DROP COLUMN "signupReason"`);

		// Remove signup reason from user_profile
		await queryRunner.query(`COMMENT ON COLUMN "user_profile"."signupReason" IS 'The signup reason provided by the user during registration.'`);
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "signupReason"`);

		// Remove approval fields from user table
		await queryRunner.query(`DROP INDEX "IDX_da7eb6d177d4ade3305499b443"`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."approvalTicket" IS 'Approval ticket number for signup approval system.'`);
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "approvalTicket"`);
		await queryRunner.query(`COMMENT ON COLUMN "user"."approved" IS 'Whether the User is approved.'`);
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "approved"`);

		// Remove approval flag from meta
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "approvalRequiredForSignup"`);
	}
}
