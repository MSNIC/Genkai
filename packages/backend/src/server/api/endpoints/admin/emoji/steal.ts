/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { EmojisRepository } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { DI } from '@/di-symbols.js';
import { DriveService } from '@/core/DriveService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageCustomEmojis',
	kind: 'write:admin:emoji',

	errors: {
		noSuchEmoji: {
			message: 'No such emoji.',
			code: 'NO_SUCH_EMOJI',
			id: '2ce33400-1ff3-4b0f-9453-e25821dd5e8e',
		},
		duplicateName: {
			message: 'Duplicate name.',
			code: 'DUPLICATE_NAME',
			id: '5eeb98e6-34b8-40c5-bb83-cd0f2a7c456f',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			id: {
				type: 'string',
				optional: false, nullable: false,
				format: 'id',
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		host: { type: 'string' },
	},
	required: ['name', 'host'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,
		private emojiEntityService: EmojiEntityService,
		private customEmojiService: CustomEmojiService,
		private driveService: DriveService,
		private utilityService: UtilityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const emoji = await this.emojisRepository.findOneBy({
				name: ps.name,
				host: this.utilityService.toPuny(ps.host),
			});
			if (emoji == null) {
				throw new ApiError(meta.errors.noSuchEmoji);
			}

			const isDuplicate = await this.customEmojiService.checkDuplicate(emoji.name);
			if (isDuplicate) throw new ApiError(meta.errors.duplicateName);

			let driveFile: MiDriveFile;

			try {
				driveFile = await this.driveService.uploadFromUrl({ url: emoji.originalUrl, user: null, force: true });
			} catch (_) {
				// TODO: need to return Drive Error
				throw new ApiError();
			}

			const addedEmoji = await this.customEmojiService.add({
				originalUrl: driveFile.url,
				publicUrl: driveFile.webpublicUrl ?? driveFile.url,
				fileType: driveFile.webpublicType ?? driveFile.type,
				name: emoji.name,
				category: emoji.category,
				aliases: emoji.aliases,
				host: null,
				license: emoji.license,
				isSensitive: emoji.isSensitive,
				localOnly: emoji.localOnly,
				roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction,
			}, me);

			return this.emojiEntityService.packDetailed(addedEmoji);
		});
	}
}
