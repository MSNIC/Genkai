/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddVoiceRooms1788274572114 {
	name = 'AddVoiceRooms1788274572114'

	async up(queryRunner) {
		await queryRunner.query(`CREATE TYPE "public"."voice_room_status_enum" AS ENUM('scheduled', 'live', 'ended')`);
		await queryRunner.query(`CREATE TYPE "public"."voice_room_participant_role_enum" AS ENUM('host', 'cohost', 'speaker', 'listener')`);
		await queryRunner.query(`CREATE TYPE "public"."voice_room_speak_request_status_enum" AS ENUM('pending', 'accepted', 'rejected', 'withdrawn')`);
		await queryRunner.query(`CREATE TYPE "public"."voice_room_recording_status_enum" AS ENUM('recording', 'processing', 'ready', 'failed')`);
		await queryRunner.query(`CREATE TABLE "voice_room" ("id" character varying(32) NOT NULL, "hostId" character varying(32) NOT NULL, "title" character varying(256) NOT NULL, "description" character varying(2048) NOT NULL DEFAULT '', "status" "public"."voice_room_status_enum" NOT NULL DEFAULT 'scheduled', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "scheduledAt" TIMESTAMP WITH TIME ZONE, "startedAt" TIMESTAMP WITH TIME ZONE, "endedAt" TIMESTAMP WITH TIME ZONE, "maxSpeakers" smallint NOT NULL DEFAULT '6', "maxListeners" smallint NOT NULL DEFAULT '100', "recordingEnabled" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_dcace6b67daa1b48b4bef5a8407" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_voice_room_hostId" ON "voice_room" ("hostId")`);
		await queryRunner.query(`CREATE INDEX "IDX_voice_room_status" ON "voice_room" ("status")`);
		await queryRunner.query(`CREATE INDEX "IDX_voice_room_scheduledAt" ON "voice_room" ("scheduledAt")`);
		await queryRunner.query(`CREATE TABLE "voice_room_participant" ("id" character varying(32) NOT NULL, "roomId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "role" "public"."voice_room_participant_role_enum" NOT NULL, "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "leftAt" TIMESTAMP WITH TIME ZONE, "isMuted" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_5878636883e7ac6384e72429922" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_voice_room_participant_roomId" ON "voice_room_participant" ("roomId")`);
		await queryRunner.query(`CREATE INDEX "IDX_voice_room_participant_userId" ON "voice_room_participant" ("userId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_voice_room_participant_room_user" ON "voice_room_participant" ("roomId", "userId")`);
		await queryRunner.query(`CREATE TABLE "voice_room_speak_request" ("id" character varying(32) NOT NULL, "roomId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "status" "public"."voice_room_speak_request_status_enum" NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "respondedAt" TIMESTAMP WITH TIME ZONE, "respondedById" character varying(32), CONSTRAINT "PK_399d4c94d928b64a84af2a933f0" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_voice_room_speak_request_roomId" ON "voice_room_speak_request" ("roomId")`);
		await queryRunner.query(`CREATE INDEX "IDX_voice_room_speak_request_userId" ON "voice_room_speak_request" ("userId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_voice_room_speak_request_pending" ON "voice_room_speak_request" ("roomId", "userId") WHERE "status" = 'pending'`);
		await queryRunner.query(`CREATE TABLE "voice_room_recording" ("id" character varying(32) NOT NULL, "roomId" character varying(32) NOT NULL, "fileId" character varying(32), "status" "public"."voice_room_recording_status_enum" NOT NULL DEFAULT 'recording', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "finishedAt" TIMESTAMP WITH TIME ZONE, "durationMs" integer, CONSTRAINT "PK_67f62b27a55c326b31ad4f9b5c3" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_voice_room_recording_roomId" ON "voice_room_recording" ("roomId")`);
		await queryRunner.query(`ALTER TABLE "voice_room" ADD CONSTRAINT "FK_a8bad02a10ce48cdc550180792e" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "voice_room_participant" ADD CONSTRAINT "FK_2bc91df0f5b1d9c997b396a90ed" FOREIGN KEY ("roomId") REFERENCES "voice_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "voice_room_participant" ADD CONSTRAINT "FK_01e34fbba3db265d5f9e8efb055" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "voice_room_speak_request" ADD CONSTRAINT "FK_7b0a29608e7a2f405f7c1f29350" FOREIGN KEY ("roomId") REFERENCES "voice_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "voice_room_speak_request" ADD CONSTRAINT "FK_23eb199d0421cae78edf8276c07" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "voice_room_recording" ADD CONSTRAINT "FK_e1b7b2520797b5c9b1a88fec3c6" FOREIGN KEY ("roomId") REFERENCES "voice_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "voice_room_recording" ADD CONSTRAINT "FK_6610a0aa984032f16e723024fe9" FOREIGN KEY ("fileId") REFERENCES "drive_file"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "voice_room_recording" DROP CONSTRAINT "FK_6610a0aa984032f16e723024fe9"`);
		await queryRunner.query(`ALTER TABLE "voice_room_recording" DROP CONSTRAINT "FK_e1b7b2520797b5c9b1a88fec3c6"`);
		await queryRunner.query(`ALTER TABLE "voice_room_speak_request" DROP CONSTRAINT "FK_23eb199d0421cae78edf8276c07"`);
		await queryRunner.query(`ALTER TABLE "voice_room_speak_request" DROP CONSTRAINT "FK_7b0a29608e7a2f405f7c1f29350"`);
		await queryRunner.query(`ALTER TABLE "voice_room_participant" DROP CONSTRAINT "FK_01e34fbba3db265d5f9e8efb055"`);
		await queryRunner.query(`ALTER TABLE "voice_room_participant" DROP CONSTRAINT "FK_2bc91df0f5b1d9c997b396a90ed"`);
		await queryRunner.query(`ALTER TABLE "voice_room" DROP CONSTRAINT "FK_a8bad02a10ce48cdc550180792e"`);
		await queryRunner.query(`DROP TABLE "voice_room_recording"`);
		await queryRunner.query(`DROP TABLE "voice_room_speak_request"`);
		await queryRunner.query(`DROP TABLE "voice_room_participant"`);
		await queryRunner.query(`DROP TABLE "voice_room"`);
		await queryRunner.query(`DROP TYPE "public"."voice_room_recording_status_enum"`);
		await queryRunner.query(`DROP TYPE "public"."voice_room_speak_request_status_enum"`);
		await queryRunner.query(`DROP TYPE "public"."voice_room_participant_role_enum"`);
		await queryRunner.query(`DROP TYPE "public"."voice_room_status_enum"`);
	}
}
