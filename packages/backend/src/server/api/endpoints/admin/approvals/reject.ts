/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MiApprovalMessage, MiUser, MiUserPending } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin', 'users'],

	requireCredential: true,
	requireAdmin: true,
	secure: true,

	errors: {
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '5fb5a5c5-b4e1-4e1a-8c4c-8e5a5e5a5e5a',
		},
		userNotFound: {
			message: 'User not found.',
			code: 'USER_NOT_FOUND',
			id: '6fb5a5c5-b4e1-4e1a-8c4c-8e5a5e5a5e5a',
		},
		alreadyApproved: {
			message: 'User is already approved.',
			code: 'ALREADY_APPROVED',
			id: '7fb5a5c5-b4e1-4e1a-8c4c-8e5a5e5a5e5a',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!(await this.roleService.isAdministrator(me))) {
				throw new ApiError(meta.errors.accessDenied);
			}

			await this.db.transaction(async (transaction) => {
				const pendingUser = await transaction.findOne(MiUserPending, {
					where: { id: ps.userId },
					lock: { mode: 'pessimistic_write' },
				});

				if (pendingUser?.approvalTicket == null) {
					throw new ApiError(meta.errors.userNotFound);
				}

				if (await transaction.existsBy(MiUser, { approvalTicket: pendingUser.approvalTicket })) {
					throw new ApiError(meta.errors.alreadyApproved);
				}

				await transaction.delete(MiApprovalMessage, { approvalTicket: pendingUser.approvalTicket });
				await transaction.delete(MiUserPending, pendingUser.id);
			});
		});
	}
}
