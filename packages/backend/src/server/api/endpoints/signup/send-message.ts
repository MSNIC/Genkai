/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { MiApprovalMessage, MiUserPending } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['signup'],
	requireCredential: false,
	limit: {
		duration: 1000 * 60 * 60,
		max: 20,
		minInterval: 1000,
	},
	errors: {
		approvalNotFound: {
			message: 'Approval request not found.',
			code: 'APPROVAL_NOT_FOUND',
			id: '47baf274-0630-42c5-84e5-76ecc0ada852',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		approvalTicket: { type: 'string', minLength: 1, maxLength: 128 },
		message: { type: 'string', minLength: 1, maxLength: 4096 },
	},
	required: ['approvalTicket', 'message'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		private idService: IdService,
	) {
		super(meta, paramDef, async (ps) => {
			await this.db.transaction(async (transaction) => {
				const pendingUser = await transaction.findOne(MiUserPending, {
					where: { approvalTicket: ps.approvalTicket },
					lock: { mode: 'pessimistic_write' },
				});

				if (pendingUser == null) {
					throw new ApiError(meta.errors.approvalNotFound);
				}

				await transaction.insert(MiApprovalMessage, {
					id: this.idService.gen(),
					createdAt: new Date(),
					approvalTicket: ps.approvalTicket,
					isFromAdmin: false,
					message: ps.message,
				});
			});
		});
	}
}
