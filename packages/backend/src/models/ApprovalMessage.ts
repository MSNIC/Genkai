/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';

@Entity('approval_message')
@Index('IDX_approval_message_ticket_createdAt', ['approvalTicket', 'createdAt'])
export class MiApprovalMessage {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_approval_message_createdAt')
	@Column('timestamp with time zone', {
		comment: 'The created date of the ApprovalMessage.',
	})
	public createdAt: Date;

	@Index('IDX_approval_message_approvalTicket')
	@Column('varchar', {
		length: 128,
	})
	public approvalTicket: string;

	@Column('boolean', {
		comment: 'Whether the message is from admin.',
	})
	public isFromAdmin: boolean;

	@Column('varchar', {
		length: 4096,
	})
	public message: string;
}
