<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition
	:name="prefer.s.animation ? 'eew-alert' : ''"
	:duration="200"
	mode="out-in"
>
	<div v-if="visible" class="eew-alert-container">
		<div class="eew-alert">
			<div class="eew-header">
				<i class="ti ti-alert-triangle"></i>
				<span class="eew-title">緊急地震速報</span>
				<button class="close-btn" @click="close">
					<i class="ti ti-x"></i>
				</button>
			</div>
			<div class="eew-content">
				<div v-if="eewData" class="eew-info">
					<div class="info-row">
						<span class="label">震源地:</span>
						<span class="value">{{ eewData.earthquake.hypocenter.name }}</span>
					</div>
					<div class="info-row">
						<span class="label">マグニチュード:</span>
						<span class="value magnitude">M{{ eewData.earthquake.hypocenter.magnitude.toFixed(1) }}</span>
					</div>
					<div class="info-row">
						<span class="label">深さ:</span>
						<span class="value">{{ eewData.earthquake.hypocenter.depth }}km</span>
					</div>
					<div v-if="eewData.areas && eewData.areas.length > 0" class="areas-list">
						<div v-for="(area, index) in eewData.areas.slice(0, 5)" :key="index" class="area-item">
							<span class="area-name">{{ area.name }}</span>
							<span class="area-scale">震度{{ area.scaleFrom }}{{ area.scaleTo !== area.scaleFrom ? `~${area.scaleTo}` : '' }}</span>
							<span class="area-time">{{ formatArrivalTime(area.arrivalTime) }}</span>
						</div>
						<div v-if="eewData.areas.length > 5" class="more-areas">
							他{{ eewData.areas.length - 5 }}地域
						</div>
					</div>
				</div>
				<div v-else-if="quakeData" class="quake-info">
					<div class="info-row">
						<span class="label">震央:</span>
						<span class="value">{{ quakeData.earthquake.hypocenter.name }}</span>
					</div>
					<div class="info-row">
						<span class="label">最大震度:</span>
						<span class="value intensity">震度{{ quakeData.earthquake.maxScale }}</span>
					</div>
					<div v-if="quakeData.earthquake.hypocenter.magnitude" class="info-row">
						<span class="label">マグニチュード:</span>
						<span class="value">M{{ quakeData.earthquake.hypocenter.magnitude.toFixed(1) }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { playMisskeySfxFile } from '@/utility/sound.js';

const stream = useStream();

const visible = ref(false);
const eewData = ref<any>(null);
const quakeData = ref<any>(null);
let autoCloseTimer: number | null = null;

// イベントハンドラー
const handleEEW = (data: any) => {
	console.log('[MkEEWAlert] EEW received:', data);
	show(data.data, 'eew');
};

const handleQuakeInfo = (data: any) => {
	console.log('[MkEEWAlert] Quake info received:', data);
	show(data.data, 'quake');
};

function formatArrivalTime(time: string): string {
	if (!time) return '---';
	if (time === 'already') return '既に到達';
	const date = new Date(time);
	return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function show(data: any, type: 'eew' | 'quake') {
	console.log('[MkEEWAlert] show() called, type:', type, 'eew.enabled:', prefer.s['eew.enabled']);

	// EEW が無効の場合は表示しない
	if (!prefer.s['eew.enabled']) {
		console.log('[MkEEWAlert] EEW disabled, not showing alert');
		return;
	}

	console.log('[MkEEWAlert] Showing alert with data:', data);

	if (type === 'eew') {
		eewData.value = data;
		quakeData.value = null;
	} else {
		quakeData.value = data;
		eewData.value = null;
	}

	visible.value = true;

	// 自動的に閉じる設定
	if (autoCloseTimer) window.clearTimeout(autoCloseTimer);
	if (prefer.s['eew.autoClose']) {
		const delay = (prefer.s['eew.autoCloseDelay'] || 60) * 1000;
		autoCloseTimer = window.setTimeout(() => {
			close();
		}, delay);
	}

	// 音を鳴らす
	const soundSetting = prefer.s['eew.sound'];
	if (soundSetting && soundSetting.type) {
		playMisskeySfxFile(soundSetting);
	}
}

function close() {
	visible.value = false;
	eewData.value = null;
	quakeData.value = null;
	if (autoCloseTimer) {
		window.clearTimeout(autoCloseTimer);
		autoCloseTimer = null;
	}
}

onMounted(() => {
	console.log('[MkEEWAlert] Component mounted, EEW enabled:', prefer.s['eew.enabled']);

	// EEWイベントを購読
	stream.on('eew', handleEEW);

	// 地震情報イベントを購読
	stream.on('quakeInfo', handleQuakeInfo);
});

onBeforeUnmount(() => {
	console.log('[MkEEWAlert] Component unmounting');

	// イベントリスナーを削除
	stream.off('eew', handleEEW);
	stream.off('quakeInfo', handleQuakeInfo);

	if (autoCloseTimer) {
		window.clearTimeout(autoCloseTimer);
	}
});
</script>

<style lang="scss" scoped>
.eew-alert-enter-active,
.eew-alert-leave-active {
	transition: all 0.3s ease;
}

.eew-alert-enter-from {
	transform: translateY(-100%);
	opacity: 0;
}

.eew-alert-leave-to {
	transform: translateY(-100%);
	opacity: 0;
}

.eew-alert-container {
	position: fixed;
	top: 20px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 10000;
	max-width: 500px;
	width: 90%;
}

.eew-alert {
	background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
	border-radius: 12px;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	overflow: hidden;
	animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
	0%, 100% {
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}
	50% {
		box-shadow: 0 8px 48px rgba(255, 107, 107, 0.6);
	}
}

.eew-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 16px;
	background: rgba(0, 0, 0, 0.2);
	color: white;
	font-weight: bold;
	font-size: 18px;

	i {
		font-size: 24px;
	}

	.eew-title {
		flex: 1;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: white;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;

		&:hover {
			background: rgba(255, 255, 255, 0.2);
		}

		i {
			font-size: 20px;
		}
	}
}

.eew-content {
	padding: 16px;
	color: white;
}

.eew-info, .quake-info {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.info-row {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 16px;

	.label {
		font-weight: 600;
		min-width: 100px;
	}

	.value {
		font-weight: bold;

		&.magnitude {
			font-size: 20px;
			color: #ffd700;
		}

		&.intensity {
			font-size: 20px;
			color: #ffd700;
		}
	}
}

.areas-list {
	margin-top: 8px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-height: 200px;
	overflow-y: auto;
}

.area-item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px;
	background: rgba(0, 0, 0, 0.2);
	border-radius: 6px;
	font-size: 14px;

	.area-name {
		flex: 1;
		font-weight: 600;
	}

	.area-scale {
		font-weight: bold;
		color: #ffd700;
	}

	.area-time {
		color: #ffeb3b;
		font-size: 12px;
	}
}

.more-areas {
	text-align: center;
	font-size: 14px;
	color: rgba(255, 255, 255, 0.8);
	padding: 4px;
}
</style>
