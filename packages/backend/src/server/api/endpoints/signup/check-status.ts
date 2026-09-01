/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository, UserPendingsRepository, ApprovalMessagesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['signup'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			status: { type: 'string', enum: ['pending', 'approved', 'not_found'], optional: false, nullable: false },
			username: { type: 'string', optional: false, nullable: true },
			messages: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: { type: 'string', optional: false, nullable: false },
						createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
						isFromAdmin: { type: 'boolean', optional: false, nullable: false },
						message: { type: 'string', optional: false, nullable: false },
					},
				},
			},
		},
	},

	errors: {
		invalidTicket: {
			message: 'Invalid approval ticket.',
			code: 'INVALID_TICKET',
			id: 'afb5a5c5-b4e1-4e1a-8c4c-8e5a5e5a5e5a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		approvalTicket: { type: 'string', minLength: 1, maxLength: 128 },
	},
	required: ['approvalTicket'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userPendingsRepository)
		private userPendingsRepository: UserPendingsRepository,

		@Inject(DI.approvalMessagesRepository)
		private approvalMessagesRepository: ApprovalMessagesRepository,
	) {
		super(meta, paramDef, async (ps) => {
			if (!ps.approvalTicket || ps.approvalTicket.trim() === '') {
				throw new ApiError(meta.errors.invalidTicket);
			}

			const pendingUser = await this.userPendingsRepository.findOneBy({
				approvalTicket: ps.approvalTicket,
			});
			const approvedUser = pendingUser == null
				? await this.usersRepository.findOneBy({ approvalTicket: ps.approvalTicket, approved: true })
				: null;

			if (pendingUser == null && approvedUser == null) {
				return {
					status: 'not_found' as const,
					username: null,
					messages: [],
				};
			}

			// Get messages for this user
			const messages = await this.approvalMessagesRepository.find({
				where: {
					approvalTicket: ps.approvalTicket,
				},
				order: {
					createdAt: 'ASC',
				},
			});

			return {
				status: approvedUser != null ? 'approved' as const : 'pending' as const,
				username: (approvedUser ?? pendingUser)!.username,
				messages: messages.map(msg => ({
					id: msg.id,
					createdAt: msg.createdAt.toISOString(),
					isFromAdmin: msg.isFromAdmin,
					message: msg.message,
				})),
			};
		});
	}
}
