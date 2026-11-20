import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { pixelateEffectDefinition } from "./pixelate";
import { grayscaleEffectDefinition } from "./grayscale";

const defaultEffects = [blurEffectDefinition, grayscaleEffectDefinition, pixelateEffectDefinition];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
