/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ApiError } from '@/server/api/error.js';
import { VoiceRoomServiceError } from '@/core/VoiceRoomService.js';
import type { MiVoiceRoom } from '@/models/VoiceRoom.js';

export const voiceRoomErrors = {
	roomNotFound: { message: 'Voice room not found.', code: 'VOICE_ROOM_NOT_FOUND', id: '6d4f670d-5c57-48e7-8657-dd2264df18f3' },
	roomNotLive: { message: 'Voice room is not live.', code: 'VOICE_ROOM_NOT_LIVE', id: '3dc6c5a7-9316-4f1c-bd03-85d1d6607f16' },
	permissionDenied: { message: 'You cannot perform this action.', code: 'VOICE_ROOM_PERMISSION_DENIED', id: '29fb64d4-a000-4a40-9f47-69b8bd3b0b3e' },
	roomFull: { message: 'Voice room is full.', code: 'VOICE_ROOM_FULL', id: 'ff28b933-e104-4420-8dbd-8679600228bc' },
	speakerLimitReached: { message: 'Speaker limit reached.', code: 'VOICE_ROOM_SPEAKER_LIMIT_REACHED', id: 'd58e3b1b-c1ea-46c7-8808-f5d23879d916' },
	notAListener: { message: 'Only listeners can request to speak.', code: 'VOICE_ROOM_NOT_A_LISTENER', id: 'cca859a8-cd03-4153-a79c-048f38977fd0' },
	requestNotFound: { message: 'Speak request not found.', code: 'VOICE_ROOM_SPEAK_REQUEST_NOT_FOUND', id: '2f62de76-0df6-4c3f-90a1-effb94aaba65' },
	featureDisabled: { message: 'Voice rooms are disabled.', code: 'VOICE_ROOMS_DISABLED', id: 'd79ee2af-af90-4098-a17d-cef2bcda3cb8' },
	invalidTitle: { message: 'Voice room title is required.', code: 'VOICE_ROOM_INVALID_TITLE', id: 'a47bc62d-cbb6-4f15-aaac-4b327f8c9a31' },
	invalidScheduledAt: { message: 'Invalid scheduled date-time.', code: 'VOICE_ROOM_INVALID_SCHEDULED_AT', id: '0e17ec8b-a02f-4885-a878-c43c0934e729' },
} as const;

export const voiceRoomSchema = {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		id: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
		hostId: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
		title: { type: 'string', optional: false, nullable: false },
		description: { type: 'string', optional: false, nullable: false },
		status: { type: 'string', enum: ['scheduled', 'live', 'ended'], optional: false, nullable: false },
		createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
		scheduledAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		startedAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		endedAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		maxSpeakers: { type: 'integer', optional: false, nullable: false },
		maxListeners: { type: 'integer', optional: false, nullable: false },
		recordingEnabled: { type: 'boolean', optional: false, nullable: false },
	},
} as const;

export function serializeVoiceRoom(room: MiVoiceRoom) {
	return {
		id: room.id,
		hostId: room.hostId,
		title: room.title,
		description: room.description,
		status: room.status,
		createdAt: room.createdAt.toISOString(),
		scheduledAt: room.scheduledAt?.toISOString() ?? null,
		startedAt: room.startedAt?.toISOString() ?? null,
		endedAt: room.endedAt?.toISOString() ?? null,
		maxSpeakers: room.maxSpeakers,
		maxListeners: room.maxListeners,
		recordingEnabled: room.recordingEnabled,
	};
}

export function throwVoiceRoomApiError(error: unknown): never {
	if (!(error instanceof VoiceRoomServiceError)) throw error;
	switch (error.code) {
		case 'ROOM_NOT_FOUND': throw new ApiError(voiceRoomErrors.roomNotFound);
		case 'ROOM_NOT_LIVE': throw new ApiError(voiceRoomErrors.roomNotLive);
		case 'PERMISSION_DENIED': throw new ApiError(voiceRoomErrors.permissionDenied);
		case 'ROOM_FULL': throw new ApiError(voiceRoomErrors.roomFull);
		case 'SPEAKER_LIMIT_REACHED': throw new ApiError(voiceRoomErrors.speakerLimitReached);
		case 'NOT_A_LISTENER': throw new ApiError(voiceRoomErrors.notAListener);
		case 'REQUEST_NOT_FOUND': throw new ApiError(voiceRoomErrors.requestNotFound);
		case 'FEATURE_DISABLED': throw new ApiError(voiceRoomErrors.featureDisabled);
		case 'INVALID_TITLE': throw new ApiError(voiceRoomErrors.invalidTitle);
	}
}
