/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { VoiceRoomService } from '@/core/VoiceRoomService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { throwVoiceRoomApiError, voiceRoomErrors } from './common.js';

export const meta = { tags: ['voice-rooms'], requireCredential: true, kind: 'write:account', errors: voiceRoomErrors } as const;
export const paramDef = { type: 'object', properties: {
	requestId: { type: 'string', format: 'misskey:id' },
	accept: { type: 'boolean' },
}, required: ['requestId', 'accept'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private voiceRoomService: VoiceRoomService, private globalEventService: GlobalEventService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const request = await this.voiceRoomService.respondToSpeakRequest(ps.requestId, me.id, ps.accept);
				this.globalEventService.publishVoiceRoomStream(request.roomId, 'speakRequestsChanged', {});
				this.globalEventService.publishVoiceRoomStream(request.roomId, 'participantChanged', { userId: request.userId });
			} catch (error) { throwVoiceRoomApiError(error); }
		});
	}
}
