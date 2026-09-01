<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<MkInfo>
		緊急地震速報 (EEW) の設定を行います。P2P地震情報からリアルタイムで地震情報を受信します。
	</MkInfo>

	<FormSection first>
		<template #label>基本設定</template>
		<div class="_gaps_s">
			<MkSwitch v-model="eewEnabled">
				<template #label>緊急地震速報を有効にする</template>
				<template #caption>オフにすると、EEWアラートが表示されなくなります</template>
			</MkSwitch>
		</div>
	</FormSection>

	<FormSection>
		<template #label>アラート設定</template>
		<div class="_gaps_s">
			<MkSwitch v-model="eewShowMap">
				<template #label>地図を表示する</template>
				<template #caption>アラート表示時に震源地の地図を表示します（未実装）</template>
			</MkSwitch>

			<MkSwitch v-model="eewAutoClose">
				<template #label>自動的に閉じる</template>
				<template #caption>一定時間後にアラートを自動的に閉じます</template>
			</MkSwitch>

			<MkInput v-if="eewAutoClose" v-model="eewAutoCloseDelay" type="number" :min="10" :max="300">
				<template #label>自動クローズまでの時間（秒）</template>
			</MkInput>
		</div>
	</FormSection>

	<FormSection>
		<template #label>音声設定</template>
		<div class="_gaps_s">
			<MkFolder>
				<template #label>通知音</template>
				<template #suffix>{{ eewSoundLabel }}</template>

				<XSound v-model="eewSound"/>
			</MkFolder>
		</div>
	</FormSection>

	<FormSection>
		<template #label>テスト</template>
		<div class="_gaps_s">
			<MkButton :disabled="!eewEnabled" @click="sendTest">
				<i class="ti ti-alert-triangle"></i> テスト通知を送信
			</MkButton>
			<MkInfo warn>
				テスト通知は東京湾を震源とするM6.2の模擬地震情報です
			</MkInfo>
		</div>
	</FormSection>

	<FormSection>
		<template #label>地震履歴</template>
		<div class="_gaps_s">
			<MkInfo>地震履歴機能は未実装です</MkInfo>
		</div>
	</FormSection>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import FormSection from '@/components/form/section.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkFolder from '@/components/MkFolder.vue';
import XSound from './sounds.sound.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';

const eewEnabled = prefer.model('eew.enabled');
const eewSound = prefer.model('eew.sound');
const eewShowMap = prefer.model('eew.showMap');
const eewAutoClose = prefer.model('eew.autoClose');
const eewAutoCloseDelay = prefer.model('eew.autoCloseDelay');

const eewSoundLabel = computed(() => {
	if (eewSound.value.type === '_driveFile_') {
		return 'ドライブファイル';
	}
	return eewSound.value.type?.replace('syuilo/', '') || 'なし';
});

async function sendTest() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: 'テスト通知を送信',
		text: 'テスト用の緊急地震速報を表示します。よろしいですか？',
	});

	if (canceled) return;

	try {
		await misskeyApi('eew/test');
		os.success('テスト通知を送信しました');
	} catch (error) {
		os.alert({
			type: 'error',
			title: 'エラー',
			text: 'テスト通知の送信に失敗しました',
		});
	}
}

definePage(() => ({
	title: '緊急地震速報',
	icon: 'ti ti-alert-triangle',
}));
</script>
