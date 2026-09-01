/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Not, IsNull, In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ApprovalMessagesRepository, UserPendingsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin', 'users'],

	requireCredential: true,
	requireAdmin: true,
	secure: true,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', optional: false, nullable: false },
				username: { type: 'string', optional: false, nullable: false },
				approvalTicket: { type: 'string', optional: false, nullable: false },
				createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
				signupReason: { type: 'string', optional: false, nullable: true },
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
	},

	errors: {
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '1fb5a5c5-b4e1-4e1a-8c4c-8e5a5e5a5e5a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		offset: { type: 'integer', minimum: 0, default: 0 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userPendingsRepository)
		private userPendingsRepository: UserPendingsRepository,

		@Inject(DI.approvalMessagesRepository)
		private approvalMessagesRepository: ApprovalMessagesRepository,

		private idService: IdService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!(await this.roleService.isAdministrator(me))) {
				throw new ApiError(meta.errors.accessDenied);
			}

			// Get pending signup applications with an approval ticket.
			const users = await this.userPendingsRepository.find({
				where: {
					approvalTicket: Not(IsNull()),
				},
				order: { id: 'ASC' },
				take: ps.limit,
				skip: ps.offset,
			});

			const approvalTickets = users.map(user => user.approvalTicket!);
			const messages = await this.approvalMessagesRepository.find({
				where: { approvalTicket: In(approvalTickets) },
				order: { createdAt: 'ASC' },
			});

			const messagesByTicket = Map.groupBy(messages, message => message.approvalTicket);

			return users.map(user => {
				return {
					id: user.id,
					username: user.username,
					approvalTicket: user.approvalTicket!,
					createdAt: this.idService.parse(user.id).date.toISOString(),
					signupReason: user.signupReason,
					messages: (messagesByTicket.get(user.approvalTicket!) ?? []).map(message => ({
						id: message.id,
						createdAt: message.createdAt.toISOString(),
						isFromAdmin: message.isFromAdmin,
						message: message.message,
					})),
				};
			});
		});
	}
}
