/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, Column } from 'typeorm';
import { id } from './util/id.js';

@Entity('user_pending')
@Index('IDX_user_pending_usernameLower', { synchronize: false })
export class MiUserPending {
	@PrimaryColumn(id())
	public id: string;

	@Index({ unique: true })
	@Column('varchar', {
		length: 128,
	})
	public code: string;

	@Column('varchar', {
		length: 128,
	})
	public username: string;

	@Column('varchar', {
		length: 128,
	})
	public email: string;

	@Column('varchar', {
		length: 128,
	})
	public password: string;

	@Column('varchar', {
		length: 2048,
		nullable: true,
	})
	public signupReason: string | null;

	@Index('IDX_user_pending_approvalTicket', { unique: true, where: '"approvalTicket" IS NOT NULL' })
	@Column('varchar', {
		length: 128,
		nullable: true,
	})
	public approvalTicket: string | null;
}
