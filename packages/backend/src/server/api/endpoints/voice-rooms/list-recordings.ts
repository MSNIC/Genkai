/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { VoiceRoomRecordingsRepository, VoiceRoomsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { voiceRoomErrors } from './common.js';

const recordingSchema = { type: 'object', optional: false, nullable: false, properties: {
	id: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
	fileId: { type: 'string', format: 'misskey:id', optional: false, nullable: true },
	status: { type: 'string', enum: ['recording', 'processing', 'ready', 'failed'], optional: false, nullable: false },
	createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
	finishedAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
	durationMs: { type: 'integer', optional: false, nullable: true },
} } as const;

export const meta = {
	tags: ['voice-rooms'], requireCredential: true, kind: 'read:account', errors: voiceRoomErrors,
	res: { type: 'array', optional: false, nullable: false, items: recordingSchema },
} as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.voiceRoomsRepository)
		roomsRepository: VoiceRoomsRepository,
		@Inject(DI.voiceRoomRecordingsRepository)
		recordingsRepository: VoiceRoomRecordingsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const room = await roomsRepository.findOneBy({ id: ps.roomId });
			if (room == null) throw new ApiError(voiceRoomErrors.roomNotFound);
			if (room.hostId !== me.id) throw new ApiError(voiceRoomErrors.permissionDenied);
			const recordings = await recordingsRepository.find({ where: { roomId: ps.roomId }, order: { createdAt: 'DESC' } });
			return recordings.map(recording => ({
				id: recording.id, fileId: recording.fileId, status: recording.status, createdAt: recording.createdAt.toISOString(),
				finishedAt: recording.finishedAt?.toISOString() ?? null, durationMs: recording.durationMs,
			}));
		});
	}
}
